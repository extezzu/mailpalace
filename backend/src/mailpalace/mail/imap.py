"""IMAP mail source.

Standard-library `imaplib` wrapped in `asyncio.to_thread` calls so the
FastAPI event loop never blocks on socket reads. Works against any
RFC 3501 + RFC 4549 server (Gmail, Fastmail, mailbox.org, iCloud,
Outlook, Proton Bridge, Tutanota Bridge).

Sync model
==========
Per-folder UID-based incremental sync (RFC 4549). The stored
`sync_state` is a JSON dict
``{"<folder>": {"uidvalidity": int, "uidnext": int}}`` so each
mailbox tracks its own progress independently. On UIDVALIDITY
change we wipe the local cursor for that folder and re-fetch
everything; this is the only correct response per RFC 3501.

The fetch loop walks Inbox, Sent, Spam, Trash, Drafts (whichever
the server exposes) so the local view matches what the user sees
in their primary email client.

Why imaplib + threads, not aioimaplib
=====================================
imaplib is stable, in stdlib, and has no known correctness bugs
that affect us. aioimaplib carries its own surprise pile and
adds a runtime dep for what amounts to socket I/O. We push the
blocking calls into a worker thread via `asyncio.to_thread`
(same pattern the Gmail source uses for the OAuth flow).

Bidirectional sync
==================
`mark_read` / `archive_remote` / `delete_remote` resolve the
UID by looking up the message in our DB (we stash
``"<folder>:<uid>"`` as `provider_msg_id`), select the matching
folder, and issue the corresponding STORE / COPY / EXPUNGE.
"""

from __future__ import annotations

import asyncio
import imaplib
import json
import logging
import re
from collections.abc import AsyncIterator, Iterable

from mailpalace.auth import secrets as secrets_store
from mailpalace.mail._rfc822 import parse_rfc822
from mailpalace.mail.base import NormalizedEmail
from mailpalace.mail.imap_folders import (
    ROLE_INBOX,
    ROLE_SENT,
    ROLE_SPAM,
    ROLE_TRASH,
    FolderMap,
    discover_folders,
)

logger = logging.getLogger(__name__)

# imaplib's default 1 MB read limit truncates fat marketing HTML; raise
# to 10 MB so the body is never silently chopped mid-MIME-part.
imaplib._MAXLINE = max(getattr(imaplib, "_MAXLINE", 0), 10_000_000)

_MAX_FOLDER_PER_FIRST_INGEST = 1000  # cap UID-1..N walk on first run.
_FOLDER_TO_ROLE_LABEL: dict[str, str] = {
    ROLE_INBOX: "INBOX",
    ROLE_SENT: "SENT",
    ROLE_SPAM: "SPAM",
    ROLE_TRASH: "TRASH",
}

# Provider-side flag → our normalized label vocabulary. Mirrors the
# Gmail label conventions so list_inbox's filtering works the same way.
_FLAG_TO_LABEL: dict[str, str] = {
    "\\Seen": "READ",  # synthetic — used to invert is_unread
    "\\Flagged": "STARRED",
    "\\Answered": "ANSWERED",
    "\\Draft": "DRAFT",
}


def _password_for(email_address: str) -> str:
    pw = secrets_store.load("imap", email_address)
    if pw is None:
        raise RuntimeError(
            f"No stored IMAP password for {email_address}; reconnect via the wizard."
        )
    return pw


class ImapSource:
    """RFC 3501 IMAP source."""

    name = "imap"

    def __init__(
        self,
        *,
        account_id: int,
        email_address: str,
        host: str,
        port: int,
        username: str,
    ) -> None:
        self.account_id = account_id
        self._email = email_address
        self._host = host
        self._port = port
        self._username = username
        self._client: imaplib.IMAP4_SSL | None = None
        self._folders: FolderMap | None = None
        self._sync_state: dict[str, dict[str, int]] = {}

    # ---- connection lifecycle --------------------------------------

    async def connect(self) -> None:
        await asyncio.to_thread(self._connect_blocking)

    def _connect_blocking(self) -> None:
        password = _password_for(self._email)
        client = imaplib.IMAP4_SSL(self._host, self._port, timeout=30)
        client.login(self._username, password)
        self._client = client
        self._folders = discover_folders(client)
        logger.info(
            "imap[%s] connected; folders inbox=%s sent=%s spam=%s trash=%s",
            self._email,
            self._folders.inbox,
            self._folders.sent,
            self._folders.spam,
            self._folders.trash,
        )

    async def close(self) -> None:
        client = self._client
        self._client = None
        if client is None:
            return
        await asyncio.to_thread(self._logout_blocking, client)

    @staticmethod
    def _logout_blocking(client: imaplib.IMAP4_SSL) -> None:
        try:
            client.logout()
        except Exception:  # noqa: BLE001
            logger.debug("imap logout raised; ignoring", exc_info=True)

    # ---- fetch_since -----------------------------------------------

    async def fetch_since(self, sync_state: str | None) -> AsyncIterator[NormalizedEmail]:
        if self._client is None or self._folders is None:
            await self.connect()
        assert self._client is not None and self._folders is not None

        self._sync_state = _decode_sync_state(sync_state)
        for path in self._folders.iter_paths():
            role = self._folders.role_for(path)
            async for email in self._fetch_folder(path, role):
                yield email

    async def _fetch_folder(self, path: str, role: str) -> AsyncIterator[NormalizedEmail]:
        try:
            uidvalidity, uids = await asyncio.to_thread(
                self._select_and_search, path, self._sync_state.get(path, {})
            )
        except Exception:
            logger.exception("imap select/search failed for %s", path)
            return

        if not uids:
            return

        for batch in _chunk(uids, 50):
            try:
                items = await asyncio.to_thread(self._fetch_batch, batch)
            except Exception:
                logger.exception("imap fetch failed for %s uids=%s", path, batch[:3])
                continue
            for uid, raw_bytes, flags in items:
                try:
                    email = self._normalise(path, role, uid, raw_bytes, flags)
                except Exception:
                    logger.exception("imap parse failed for %s uid=%d", path, uid)
                    continue
                yield email

        # Track the newest UID we have observed for this folder so the
        # next sync only fetches messages newer than this. UIDVALIDITY
        # is also recorded so we can detect a server-side mailbox reset
        # and re-baseline.
        max_uid = max(uids)
        self._sync_state[path] = {
            "uidvalidity": uidvalidity,
            "uidnext": max_uid + 1,
        }

    # ---- low-level imaplib helpers (blocking) ----------------------

    def _select_and_search(
        self, path: str, prev: dict[str, int]
    ) -> tuple[int, list[int]]:
        client = self._client
        assert client is not None
        # readonly=True so SELECT does not auto-clear \\Recent or change
        # \\Seen flags as a side effect of the fetch loop.
        typ, data = client.select(_quote_mailbox(path), readonly=True)
        if typ != "OK":
            raise RuntimeError(f"SELECT {path} failed: {data!r}")

        uidvalidity = int(client.response("UIDVALIDITY")[1][0] or 0)
        prev_validity = prev.get("uidvalidity", 0)
        last_uid = prev.get("uidnext", 1) - 1 if prev_validity == uidvalidity else 0

        # First-time / re-baseline: fetch newest first. SEARCH ALL on a
        # huge mailbox can return tens of thousands of UIDs; cap the
        # walk so initial sync stays bounded.
        criterion = f"UID {last_uid + 1}:*" if last_uid > 0 else "ALL"
        typ, raw = client.uid("SEARCH", None, criterion)
        if typ != "OK" or not raw or raw[0] is None:
            return uidvalidity, []
        uids = [int(x) for x in raw[0].split()]
        if last_uid == 0 and len(uids) > _MAX_FOLDER_PER_FIRST_INGEST:
            uids = uids[-_MAX_FOLDER_PER_FIRST_INGEST:]
        return uidvalidity, uids

    def _fetch_batch(self, uids: list[int]) -> list[tuple[int, bytes, list[str]]]:
        """Issue one UID FETCH for a batch and parse the response."""
        client = self._client
        assert client is not None
        uid_set = ",".join(str(u) for u in uids)
        typ, data = client.uid("FETCH", uid_set, "(UID FLAGS BODY.PEEK[])")
        if typ != "OK" or not data:
            return []
        return list(_iter_fetch_response(data))

    # ---- message normalisation -------------------------------------

    def _normalise(
        self,
        folder_path: str,
        role: str,
        uid: int,
        raw_bytes: bytes,
        flags: list[str],
    ) -> NormalizedEmail:
        is_unread = "\\Seen" not in flags
        is_starred = "\\Flagged" in flags
        labels: list[str] = []
        role_label = _FOLDER_TO_ROLE_LABEL.get(role)
        if role_label:
            labels.append(role_label)
        if "\\Draft" in flags:
            labels.append("DRAFT")

        return parse_rfc822(
            raw_bytes,
            provider_msg_id=f"{folder_path}:{uid}",
            provider_thread_id=f"{folder_path}:{uid}",
            labels=labels,
            is_unread=is_unread,
            is_starred=is_starred,
        )

    # ---- sync state ------------------------------------------------

    async def new_sync_state(self) -> str:
        return json.dumps(self._sync_state, separators=(",", ":"))

    # ---- bidirectional actions -------------------------------------

    async def mark_read(self, provider_msg_id: str, *, read: bool = True) -> None:
        op = "+FLAGS" if read else "-FLAGS"
        await self._uid_store(provider_msg_id, op, "(\\Seen)")

    async def archive_remote(self, provider_msg_id: str) -> None:
        if self._client is None:
            await self.connect()
        assert self._folders is not None
        archive_path = self._folders.archive
        if archive_path:
            await self._copy(provider_msg_id, archive_path, expunge_source=True)
            return
        # No archive folder advertised — fall back to "remove from
        # Inbox" by deleting the local source copy. Many providers
        # treat \\Deleted + EXPUNGE as archive when there's no
        # designated archive mailbox.
        await self._uid_store(provider_msg_id, "+FLAGS", "(\\Deleted)")
        await self._expunge_current()

    async def delete_remote(self, provider_msg_id: str) -> None:
        if self._client is None:
            await self.connect()
        assert self._folders is not None
        trash_path = self._folders.trash
        if trash_path:
            await self._copy(provider_msg_id, trash_path, expunge_source=True)
            return
        await self._uid_store(provider_msg_id, "+FLAGS", "(\\Deleted)")
        await self._expunge_current()

    # ---- low-level mutation helpers --------------------------------

    async def _uid_store(self, provider_msg_id: str, op: str, flags: str) -> None:
        folder_path, uid = _split_provider_id(provider_msg_id)
        await asyncio.to_thread(self._select_writable, folder_path)
        await asyncio.to_thread(self._uid_store_blocking, uid, op, flags)

    def _uid_store_blocking(self, uid: int, op: str, flags: str) -> None:
        client = self._client
        assert client is not None
        typ, data = client.uid("STORE", str(uid), op, flags)
        if typ != "OK":
            raise RuntimeError(f"UID STORE {uid} {op} failed: {data!r}")

    async def _copy(
        self, provider_msg_id: str, dest_path: str, *, expunge_source: bool
    ) -> None:
        folder_path, uid = _split_provider_id(provider_msg_id)
        await asyncio.to_thread(self._select_writable, folder_path)
        await asyncio.to_thread(self._copy_blocking, uid, dest_path)
        if expunge_source:
            await asyncio.to_thread(self._uid_store_blocking, uid, "+FLAGS", "(\\Deleted)")
            await asyncio.to_thread(self._expunge_blocking)

    def _copy_blocking(self, uid: int, dest_path: str) -> None:
        client = self._client
        assert client is not None
        typ, data = client.uid("COPY", str(uid), _quote_mailbox(dest_path))
        if typ != "OK":
            raise RuntimeError(f"UID COPY {uid} -> {dest_path} failed: {data!r}")

    async def _expunge_current(self) -> None:
        await asyncio.to_thread(self._expunge_blocking)

    def _expunge_blocking(self) -> None:
        client = self._client
        assert client is not None
        client.expunge()

    def _select_writable(self, path: str) -> None:
        client = self._client
        assert client is not None
        typ, data = client.select(_quote_mailbox(path), readonly=False)
        if typ != "OK":
            raise RuntimeError(f"SELECT {path} (writable) failed: {data!r}")


# ---------- module-level helpers (no client state) -------------------


def _decode_sync_state(raw: str | None) -> dict[str, dict[str, int]]:
    if not raw:
        return {}
    try:
        decoded = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("imap sync_state not JSON; resetting")
        return {}
    if not isinstance(decoded, dict):
        return {}
    return {
        path: {
            "uidvalidity": int(folder.get("uidvalidity", 0)),
            "uidnext": int(folder.get("uidnext", 1)),
        }
        for path, folder in decoded.items()
        if isinstance(folder, dict)
    }


def _split_provider_id(provider_msg_id: str) -> tuple[str, int]:
    """Inverse of `f"{folder_path}:{uid}"` — tolerant of `:` in folder names."""
    folder_path, _, uid_part = provider_msg_id.rpartition(":")
    if not folder_path or not uid_part.isdigit():
        raise ValueError(f"malformed IMAP provider_msg_id: {provider_msg_id!r}")
    return folder_path, int(uid_part)


def _quote_mailbox(path: str) -> str:
    """Wrap a mailbox path in IMAP-safe quotes."""
    safe = path.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{safe}"'


def _chunk(items: list[int], size: int) -> Iterable[list[int]]:
    for offset in range(0, len(items), size):
        yield items[offset : offset + size]


# Matches the standard `* N FETCH (UID 12 FLAGS (\\Seen) BODY[] {1234}`
# header — the literal byte length follows the `{N}` marker.
_FETCH_HEADER_RE = re.compile(
    rb"\(UID\s+(?P<uid>\d+)\s+FLAGS\s+\((?P<flags>[^)]*)\)",
    re.IGNORECASE,
)


def _iter_fetch_response(data: list) -> Iterable[tuple[int, bytes, list[str]]]:
    """Walk imaplib's UID FETCH response into (uid, raw_bytes, flags) tuples.

    imaplib hands us a list where literal bodies arrive as
    ``(b"... {N}", b"<N bytes of RFC822>")`` tuples and the trailing
    `)` arrives as a separate bytes element. We stitch the header to
    its body and pull UID + FLAGS out of the header bytes.
    """
    for entry in data:
        if not isinstance(entry, tuple):
            continue
        header, body = entry[0], entry[1]
        if not isinstance(header, (bytes, bytearray)) or not isinstance(
            body, (bytes, bytearray)
        ):
            continue
        match = _FETCH_HEADER_RE.search(header)
        if match is None:
            continue
        uid = int(match.group("uid"))
        flags = match.group("flags").decode("ascii", errors="replace").split()
        yield uid, bytes(body), flags

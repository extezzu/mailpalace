"""Discover an IMAP server's special folders.

Different IMAP providers name their Sent / Spam / Trash mailboxes
differently. RFC 6154 (SPECIAL-USE LIST) gives us a reliable signal
when the server supports it (most do in 2026: Gmail, Fastmail,
mailbox.org, iCloud, Outlook). For older servers without
SPECIAL-USE we fall back to a list of well-known names.

Returned `FolderMap` carries the actual mailbox path for each
canonical role plus the role each path maps back to. The IMAP
fetch loop walks `iter_paths()` to know which mailboxes to scan
and uses `role_for(path)` to attach the right normalized label
("SPAM" / "SENT" / "TRASH" / "INBOX") to each parsed message.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from imaplib import IMAP4

logger = logging.getLogger(__name__)

# Provider-agnostic role names. These are the labels we attach to
# NormalizedEmail.labels so list_inbox's folder routing works the
# same way for IMAP and Gmail.
ROLE_INBOX = "INBOX"
ROLE_SENT = "SENT"
ROLE_SPAM = "SPAM"
ROLE_TRASH = "TRASH"
ROLE_DRAFTS = "DRAFTS"
ROLE_ARCHIVE = "ARCHIVE"

# RFC 6154 SPECIAL-USE flag → role.
_SPECIAL_USE_TO_ROLE: dict[str, str] = {
    "\\Sent": ROLE_SENT,
    "\\Junk": ROLE_SPAM,
    "\\Trash": ROLE_TRASH,
    "\\Drafts": ROLE_DRAFTS,
    "\\Archive": ROLE_ARCHIVE,
}

# Fallback names per role for servers without SPECIAL-USE. Lower-cased
# at lookup time. Provider-specific quirks live here so the discovery
# function stays small.
_FALLBACK_NAMES: dict[str, tuple[str, ...]] = {
    ROLE_SENT: (
        "sent",
        "sent items",
        "sent mail",
        "sent messages",
        "[gmail]/sent mail",
        "inbox.sent",
    ),
    ROLE_SPAM: (
        "spam",
        "junk",
        "junk e-mail",
        "junk email",
        "bulk mail",
        "[gmail]/spam",
        "inbox.spam",
        "inbox.junk",
    ),
    ROLE_TRASH: (
        "trash",
        "deleted",
        "deleted items",
        "deleted messages",
        "[gmail]/trash",
        "inbox.trash",
    ),
    ROLE_DRAFTS: (
        "drafts",
        "[gmail]/drafts",
        "inbox.drafts",
    ),
    ROLE_ARCHIVE: (
        "archive",
        "[gmail]/all mail",
        "all mail",
    ),
}

# `* LIST (\\HasNoChildren \\Sent) "/" "INBOX/Sent"` — the path is the
# trailing quoted string. Also tolerates atom paths without quotes.
_LIST_LINE_RE = re.compile(
    rb'^\* LIST \((?P<flags>[^)]*)\) "(?P<delim>[^"]*)" '
    rb'(?:"(?P<qpath>[^"]*)"|(?P<apath>[^\s]+))\s*$'
)


@dataclass(frozen=True)
class FolderMap:
    """Maps each canonical role to the actual mailbox path on the server.

    `inbox` is the IMAP4 standard name "INBOX", which RFC 3501 mandates
    is case-insensitive — we keep the upper-case form for consistency.
    Optional roles default to None when the server has nothing for them.
    """

    inbox: str = "INBOX"
    sent: str | None = None
    spam: str | None = None
    trash: str | None = None
    drafts: str | None = None
    archive: str | None = None

    # path → role. Built lazily by `role_for`.
    _by_path: dict[str, str] = field(default_factory=dict, init=False, repr=False)

    def iter_paths(self) -> tuple[str, ...]:
        """Mailbox paths to scan during a full fetch (in priority order)."""
        paths = (self.inbox, self.sent, self.spam, self.trash, self.drafts)
        return tuple(p for p in paths if p)

    def role_for(self, path: str) -> str:
        """Return the canonical role label for a given mailbox path.

        Matches case-insensitively because RFC 3501 INBOX is case-
        insensitive and many providers tolerate lowercase paths.
        Falls back to ROLE_INBOX so messages from unknown folders
        still surface in the primary view rather than going missing.
        """
        if not self._by_path:
            for role, path_attr in (
                (ROLE_INBOX, self.inbox),
                (ROLE_SENT, self.sent),
                (ROLE_SPAM, self.spam),
                (ROLE_TRASH, self.trash),
                (ROLE_DRAFTS, self.drafts),
                (ROLE_ARCHIVE, self.archive),
            ):
                if path_attr:
                    self._by_path[path_attr.lower()] = role
        return self._by_path.get(path.lower(), ROLE_INBOX)


def _decode_path(raw_path: str | bytes) -> str:
    """IMAP UTF-7 → str if needed. Keeps ASCII paths untouched."""
    if isinstance(raw_path, bytes):
        raw_path = raw_path.decode("utf-8", errors="replace")
    # Servers sometimes wrap non-ASCII names in modified UTF-7 (RFC 3501).
    # imaplib's utf7 codec is named "imap4-utf-7" and we register a
    # try/except so an unknown codec on a stripped Python build doesn't
    # crash discovery — we just keep the raw bytes.
    try:
        return raw_path.encode("latin-1").decode("imap4-utf-7")
    except (LookupError, UnicodeDecodeError, UnicodeEncodeError):
        return raw_path


def discover_folders(client: IMAP4) -> FolderMap:
    """LIST every mailbox, classify by RFC 6154 SPECIAL-USE flag.

    Tries `LIST (SPECIAL-USE) "" "*"` first; if the server rejects
    the SPECIAL-USE selector we re-issue a plain `LIST "" "*"` and
    classify by name.
    """
    sent: str | None = None
    spam: str | None = None
    trash: str | None = None
    drafts: str | None = None
    archive: str | None = None

    typ, lines = client.list('""', "*")
    if typ != "OK" or lines is None:
        logger.warning("LIST failed (%s); falling back to defaults", typ)
        return FolderMap()

    role_to_path: dict[str, str] = {}
    name_candidates: list[str] = []

    for line in lines:
        if line is None:
            continue
        if isinstance(line, tuple):
            line = b" ".join(part for part in line if isinstance(part, (bytes, bytearray)))
        match = _LIST_LINE_RE.match(line)
        if match is None:
            continue
        flags_raw = match.group("flags").decode("ascii", errors="replace")
        path_raw = match.group("qpath") or match.group("apath") or b""
        path = _decode_path(path_raw)
        flags = set(flags_raw.split())

        for flag, role in _SPECIAL_USE_TO_ROLE.items():
            if flag in flags and role not in role_to_path:
                role_to_path[role] = path

        name_candidates.append(path)

    # Fallback by name for any role SPECIAL-USE did not cover.
    lower_index = {p.lower(): p for p in name_candidates}
    for role, fallbacks in _FALLBACK_NAMES.items():
        if role in role_to_path:
            continue
        for candidate in fallbacks:
            if candidate in lower_index:
                role_to_path[role] = lower_index[candidate]
                break

    sent = role_to_path.get(ROLE_SENT)
    spam = role_to_path.get(ROLE_SPAM)
    trash = role_to_path.get(ROLE_TRASH)
    drafts = role_to_path.get(ROLE_DRAFTS)
    archive = role_to_path.get(ROLE_ARCHIVE)

    return FolderMap(
        sent=sent, spam=spam, trash=trash, drafts=drafts, archive=archive
    )

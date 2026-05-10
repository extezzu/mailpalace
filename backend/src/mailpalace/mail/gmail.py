"""Gmail mail source.

Real fetch loop for Gmail. Uses ``users.history.list`` for incremental sync
and falls back to ``users.messages.list`` with ``newer_than:30d`` on the
first run or when the stored historyId expires (Google drops history older
than seven days).
"""

from __future__ import annotations

import base64
import logging
import re
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from email import message_from_bytes
from email.header import decode_header, make_header
from email.utils import getaddresses, parsedate_to_datetime

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from mailpalace.auth import gmail_oauth
from mailpalace.mail.base import NormalizedEmail

logger = logging.getLogger(__name__)


def _decode(raw: str | None) -> str:
    if not raw:
        return ""
    try:
        return str(make_header(decode_header(raw)))
    except Exception:
        return raw


def _parse_addresses(raw: str | None) -> list[dict]:
    if not raw:
        return []
    return [{"name": _decode(name), "email": email} for name, email in getaddresses([raw]) if email]


_HTML_TAG_RE = re.compile(r"<[^>]+>")
_HTML_BLOCK_NOISE_RE = re.compile(
    r"<(script|style|head)\b[^>]*>.*?</\1>",
    re.IGNORECASE | re.DOTALL,
)
_HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)


def _strip_html(html: str) -> str:
    """Plain-text fallback that drops markup, comments, scripts, and styles.

    Plain `re.sub("<[^>]+>")` keeps the contents of `<style>` blocks and
    Outlook-flavoured CSS comments, which then surface in the snippet and
    in the triage prompt. Strip those wrappers first, then the tags.
    """
    cleaned = _HTML_COMMENT_RE.sub(" ", html)
    cleaned = _HTML_BLOCK_NOISE_RE.sub(" ", cleaned)
    cleaned = _HTML_TAG_RE.sub(" ", cleaned)
    return " ".join(cleaned.split())


def _walk_body(msg) -> tuple[str, str | None]:
    """Return (text, html) extracted from a parsed RFC822 message.

    Single-part HTML messages must NOT have their HTML dumped into the text
    field; we keep the markup separately and derive a tag-stripped fallback
    so triage prompts and snippets see prose, not source.
    """
    text_parts: list[str] = []
    html: str | None = None
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            if part.get_filename():
                continue
            if ctype == "text/plain":
                payload = part.get_payload(decode=True) or b""
                charset = part.get_content_charset() or "utf-8"
                text_parts.append(payload.decode(charset, errors="replace"))
            elif ctype == "text/html" and html is None:
                payload = part.get_payload(decode=True) or b""
                charset = part.get_content_charset() or "utf-8"
                html = payload.decode(charset, errors="replace")
    else:
        ctype = msg.get_content_type()
        payload = msg.get_payload(decode=True) or b""
        charset = msg.get_content_charset() or "utf-8"
        decoded = payload.decode(charset, errors="replace")
        if ctype == "text/html":
            html = decoded
        else:
            text_parts.append(decoded)
    text = "\n".join(text_parts).strip()
    if not text and html:
        text = _strip_html(html)
    return text, html


def _has_attachments(msg) -> bool:
    if not msg.is_multipart():
        return False
    return any(part.get_filename() for part in msg.walk())


def _normalise(
    message_id: str, thread_id: str, raw_b64: str, labels: list[str] | None = None
) -> NormalizedEmail:
    raw_bytes = base64.urlsafe_b64decode(raw_b64.encode("ascii"))
    msg = message_from_bytes(raw_bytes)
    from_addresses = _parse_addresses(msg.get("From"))
    sender = from_addresses[0] if from_addresses else {"name": "", "email": ""}
    text, html = _walk_body(msg)
    received = msg.get("Date")
    try:
        received_at = parsedate_to_datetime(received) if received else datetime.now(tz=timezone.utc)
    except (TypeError, ValueError):
        received_at = datetime.now(tz=timezone.utc)
    if received_at.tzinfo is not None:
        received_at = received_at.astimezone(timezone.utc).replace(tzinfo=None)
    label_set = labels or []
    return NormalizedEmail(
        provider_msg_id=message_id,
        provider_thread_id=thread_id,
        rfc822_message_id=msg.get("Message-ID"),
        from_name=sender.get("name") or None,
        from_email=sender.get("email") or "(unknown)",
        to=_parse_addresses(msg.get("To")),
        cc=_parse_addresses(msg.get("Cc")),
        subject=_decode(msg.get("Subject")),
        snippet=text[:200] if text else "",
        body_text=text,
        body_html=html,
        received_at=received_at,
        raw_size_bytes=len(raw_bytes),
        is_unread="UNREAD" in label_set,
        is_starred="STARRED" in label_set,
        has_attachments=_has_attachments(msg),
        labels=label_set,
    )


class GmailSource:
    name = "gmail"

    def __init__(self, *, account_id: int, email_address: str) -> None:
        self.account_id = account_id
        self._email = email_address
        self._service = None
        self._latest_history_id: str | None = None

    async def connect(self) -> None:
        creds = gmail_oauth.load_credentials(self._email)
        if creds is None:
            raise RuntimeError(f"No stored credentials for {self._email}; reconnect via OAuth")
        self._service = build("gmail", "v1", credentials=creds, cache_discovery=False)
        profile = self._service.users().getProfile(userId="me").execute()
        self._latest_history_id = str(profile.get("historyId"))

    async def fetch_since(self, sync_state: str | None) -> AsyncIterator[NormalizedEmail]:
        if self._service is None:
            await self.connect()
        assert self._service is not None

        message_ids: list[tuple[str, str]] = []  # (message_id, thread_id)

        if sync_state:
            try:
                page_token: str | None = None
                while True:
                    history = (
                        self._service.users()
                        .history()
                        .list(userId="me", startHistoryId=sync_state, pageToken=page_token)
                        .execute()
                    )
                    for record in history.get("history", []):
                        for added in record.get("messagesAdded", []):
                            msg = added.get("message") or {}
                            mid = msg.get("id")
                            tid = msg.get("threadId")
                            if mid and tid:
                                message_ids.append((mid, tid))
                    self._latest_history_id = str(history.get("historyId", self._latest_history_id))
                    page_token = history.get("nextPageToken")
                    if not page_token:
                        break
            except HttpError as exc:
                if exc.resp.status == 404:
                    logger.warning("history id expired; falling back to bounded backfill")
                    sync_state = None
                else:
                    raise

        if not sync_state:
            # Gmail's `in:anywhere` covers Spam/Trash and the inbox tabs but
            # not Sent, and `q="newer_than:..."` defaults to inbox-only. Run
            # two queries and merge so Sent shows up in the first ingest.
            for q in ("in:anywhere newer_than:60d", "in:sent newer_than:60d"):
                page_token = None
                seen = 0
                while True:
                    page = (
                        self._service.users()
                        .messages()
                        .list(
                            userId="me",
                            q=q,
                            maxResults=100,
                            pageToken=page_token,
                        )
                        .execute()
                    )
                    for entry in page.get("messages", []):
                        message_ids.append((entry["id"], entry["threadId"]))
                    seen += len(page.get("messages", []))
                    page_token = page.get("nextPageToken")
                    if page_token is None or seen >= 500:
                        break

        # De-dupe in case history surfaced the same message twice.
        seen_ids: set[str] = set()
        for message_id, thread_id in message_ids:
            if message_id in seen_ids:
                continue
            seen_ids.add(message_id)
            try:
                # Two API calls per message: `raw` for the RFC822 bytes and
                # `metadata` for the label ids. The latter is cheap and lets
                # us preserve Gmail's INBOX / SPAM / SENT / CATEGORY_*
                # routing on our side.
                detail = (
                    self._service.users()
                    .messages()
                    .get(userId="me", id=message_id, format="raw")
                    .execute()
                )
                meta = (
                    self._service.users()
                    .messages()
                    .get(userId="me", id=message_id, format="minimal")
                    .execute()
                )
            except HttpError as exc:
                logger.warning("messages.get failed for %s: %s", message_id, exc)
                continue
            labels = meta.get("labelIds", [])
            yield _normalise(message_id, thread_id, detail["raw"], labels)

    async def new_sync_state(self) -> str:
        if self._latest_history_id is None and self._service is not None:
            profile = self._service.users().getProfile(userId="me").execute()
            self._latest_history_id = str(profile.get("historyId"))
        return self._latest_history_id or ""

    async def close(self) -> None:
        self._service = None

    async def mark_read(self, provider_msg_id: str, *, read: bool = True) -> None:
        if self._service is None:
            await self.connect()
        assert self._service is not None
        body = (
            {"removeLabelIds": ["UNREAD"]}
            if read
            else {"addLabelIds": ["UNREAD"]}
        )
        try:
            self._service.users().messages().modify(
                userId="me", id=provider_msg_id, body=body
            ).execute()
        except HttpError as exc:
            logger.warning("mark_read failed for %s: %s", provider_msg_id, exc)

    async def archive_remote(self, provider_msg_id: str) -> None:
        if self._service is None:
            await self.connect()
        assert self._service is not None
        try:
            self._service.users().messages().modify(
                userId="me",
                id=provider_msg_id,
                body={"removeLabelIds": ["INBOX"]},
            ).execute()
        except HttpError as exc:
            logger.warning("archive_remote failed for %s: %s", provider_msg_id, exc)

    async def delete_remote(self, provider_msg_id: str) -> None:
        if self._service is None:
            await self.connect()
        assert self._service is not None
        try:
            self._service.users().messages().trash(
                userId="me", id=provider_msg_id
            ).execute()
        except HttpError as exc:
            logger.warning("delete_remote failed for %s: %s", provider_msg_id, exc)

"""Shared RFC822 message parsing.

Both Gmail and IMAP fetch loops eventually hand us a `bytes` payload of
an RFC822 message and need the same downstream processing: decoded
headers, address tuples, plain-text body extraction, HTML cleanup for
the snippet/triage path. This module is the single source of truth for
that work so a Gmail-specific bug fix and an IMAP-specific bug fix do
not drift apart.

Nothing in this module touches a network or a database. It is pure
parsing — `parse_rfc822(raw_bytes, ...) -> NormalizedEmail`.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from email import message_from_bytes
from email.header import decode_header, make_header
from email.message import Message
from email.utils import getaddresses, parsedate_to_datetime

from mailpalace.mail.base import NormalizedEmail


def decode_header_value(raw: str | None) -> str:
    """Decode a possibly RFC2047-encoded header. Falls back to the raw value."""
    if not raw:
        return ""
    try:
        return str(make_header(decode_header(raw)))
    except Exception:
        return raw


def parse_addresses(raw: str | None) -> list[dict]:
    """Return the address list as a list of {name, email} dicts.

    Gracefully drops entries with no email so downstream JSON storage
    never has to nullity-check the address column.
    """
    if not raw:
        return []
    return [
        {"name": decode_header_value(name), "email": email}
        for name, email in getaddresses([raw])
        if email
    ]


_HTML_TAG_RE = re.compile(r"<[^>]+>")
_HTML_BLOCK_NOISE_RE = re.compile(
    r"<(script|style|head)\b[^>]*>.*?</\1>",
    re.IGNORECASE | re.DOTALL,
)
_HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)


def strip_html(html: str) -> str:
    """Plain-text fallback that drops markup, comments, scripts, and styles.

    Plain `re.sub("<[^>]+>")` keeps the contents of `<style>` blocks and
    Outlook-flavoured CSS comments, which then surface in the snippet and
    in the triage prompt. Strip those wrappers first, then the tags.
    """
    cleaned = _HTML_COMMENT_RE.sub(" ", html)
    cleaned = _HTML_BLOCK_NOISE_RE.sub(" ", cleaned)
    cleaned = _HTML_TAG_RE.sub(" ", cleaned)
    return " ".join(cleaned.split())


def walk_body(msg: Message) -> tuple[str, str | None]:
    """Return (text, html) extracted from a parsed RFC822 message.

    Single-part HTML messages must NOT have their HTML dumped into the
    text field; we keep the markup separately and derive a tag-stripped
    fallback so triage prompts and snippets see prose, not source.
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
        text = strip_html(html)
    return text, html


def has_attachments(msg: Message) -> bool:
    if not msg.is_multipart():
        return False
    return any(part.get_filename() for part in msg.walk())


def parse_rfc822(
    raw_bytes: bytes,
    *,
    provider_msg_id: str,
    provider_thread_id: str,
    labels: list[str] | None = None,
    is_unread: bool | None = None,
    is_starred: bool | None = None,
) -> NormalizedEmail:
    """Convert raw RFC822 bytes into a `NormalizedEmail`.

    `labels`, `is_unread`, `is_starred` come from the provider (Gmail
    label list, IMAP flags). When the provider does not give an explicit
    flag we fall back to inspecting `labels`: e.g. Gmail's UNREAD label
    and IMAP's `\\Seen` absence both surface here as `is_unread=True`.
    """
    msg = message_from_bytes(raw_bytes)
    from_addresses = parse_addresses(msg.get("From"))
    sender = from_addresses[0] if from_addresses else {"name": "", "email": ""}
    text, html = walk_body(msg)
    received = msg.get("Date")
    try:
        received_at = (
            parsedate_to_datetime(received) if received else datetime.now(tz=timezone.utc)
        )
    except (TypeError, ValueError):
        received_at = datetime.now(tz=timezone.utc)
    if received_at.tzinfo is not None:
        received_at = received_at.astimezone(timezone.utc).replace(tzinfo=None)

    label_set = labels or []
    if is_unread is None:
        is_unread = "UNREAD" in label_set
    if is_starred is None:
        is_starred = "STARRED" in label_set or "\\Flagged" in label_set

    return NormalizedEmail(
        provider_msg_id=provider_msg_id,
        provider_thread_id=provider_thread_id,
        rfc822_message_id=msg.get("Message-ID"),
        from_name=sender.get("name") or None,
        from_email=sender.get("email") or "(unknown)",
        to=parse_addresses(msg.get("To")),
        cc=parse_addresses(msg.get("Cc")),
        subject=decode_header_value(msg.get("Subject")),
        snippet=text[:200] if text else "",
        body_text=text,
        body_html=html,
        received_at=received_at,
        raw_size_bytes=len(raw_bytes),
        is_unread=is_unread,
        is_starred=is_starred,
        has_attachments=has_attachments(msg),
        labels=label_set,
    )

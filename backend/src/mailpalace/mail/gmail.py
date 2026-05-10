"""Gmail mail source.

Real fetch loop for Gmail. Uses ``users.history.list`` for incremental
sync and falls back to a canonical ``users.messages.list`` (no q,
includeSpamTrash=True) on the first run or when the stored historyId
expires (Google drops history older than seven days).

RFC822 parsing is shared with the IMAP source — see ``mail/_rfc822.py``.
"""

from __future__ import annotations

import base64
import logging
from collections.abc import AsyncIterator

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from mailpalace.auth import gmail_oauth
from mailpalace.mail._retry import with_gmail_retry
from mailpalace.mail._rfc822 import parse_rfc822
from mailpalace.mail.base import NormalizedEmail

logger = logging.getLogger(__name__)


def _normalise(
    message_id: str, thread_id: str, raw_b64: str, labels: list[str] | None = None
) -> NormalizedEmail:
    raw_bytes = base64.urlsafe_b64decode(raw_b64.encode("ascii"))
    return parse_rfc822(
        raw_bytes,
        provider_msg_id=message_id,
        provider_thread_id=thread_id,
        labels=labels or [],
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
        profile = with_gmail_retry(
            lambda: self._service.users().getProfile(userId="me").execute(),
            label="getProfile",
        )
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
                    history = with_gmail_retry(
                        lambda: self._service.users()
                        .history()
                        .list(
                            userId="me",
                            startHistoryId=sync_state,
                            pageToken=page_token,
                        )
                        .execute(),
                        label="history.list",
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
            # Canonical full-mailbox backfill.
            #
            # No `q` parameter: `in:anywhere` is documented only as covering
            # Spam and Trash. SENT, DRAFT, and CHAT are listed as separate
            # operators and are NOT guaranteed to be included. Omitting `q`
            # is the documented most-permissive state.
            # Ref: https://support.google.com/mail/answer/7190
            #
            # `includeSpamTrash=True`: the authoritative API parameter for
            # SPAM/TRASH inclusion. Relying on `in:anywhere` for that is
            # undocumented at the API level.
            #
            # No message-count cap: the former 2000-per-query cap silently
            # truncated large mailboxes. Subsequent syncs use the cheap
            # history API, so unbounded backfill is fine.
            #
            # `maxResults=500`: the API maximum per page; halves round trips.
            #
            # CHAT (legacy Hangouts) messages are NOT returned by the Gmail
            # email API for personal accounts; that residual gap is accepted.
            page_token: str | None = None
            while True:
                current_token = page_token
                page = with_gmail_retry(
                    lambda: self._service.users()
                    .messages()
                    .list(
                        userId="me",
                        includeSpamTrash=True,
                        maxResults=500,
                        pageToken=current_token,
                    )
                    .execute(),
                    label="messages.list",
                )
                for entry in page.get("messages", []):
                    message_ids.append((entry["id"], entry["threadId"]))
                page_token = page.get("nextPageToken")
                if page_token is None:
                    break

        # De-dupe in case history surfaced the same message twice.
        seen_ids: set[str] = set()
        for message_id, thread_id in message_ids:
            if message_id in seen_ids:
                continue
            seen_ids.add(message_id)
            try:
                # `format="raw"` already includes `labelIds` in the response,
                # so a single Gmail call covers both the RFC822 bytes and
                # the routing labels we use for inbox/spam/sent splits.
                detail = with_gmail_retry(
                    lambda: self._service.users()
                    .messages()
                    .get(userId="me", id=message_id, format="raw")
                    .execute(),
                    label="messages.get",
                )
            except HttpError as exc:
                logger.warning("messages.get failed for %s: %s", message_id, exc)
                continue
            labels = detail.get("labelIds", [])
            yield _normalise(message_id, thread_id, detail["raw"], labels)

    async def new_sync_state(self) -> str:
        if self._latest_history_id is None and self._service is not None:
            profile = with_gmail_retry(
                lambda: self._service.users().getProfile(userId="me").execute(),
                label="getProfile",
            )
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
            with_gmail_retry(
                lambda: self._service.users()
                .messages()
                .modify(userId="me", id=provider_msg_id, body=body)
                .execute(),
                label="messages.modify",
            )
        except HttpError as exc:
            logger.warning("mark_read failed for %s: %s", provider_msg_id, exc)

    async def archive_remote(self, provider_msg_id: str) -> None:
        if self._service is None:
            await self.connect()
        assert self._service is not None
        try:
            with_gmail_retry(
                lambda: self._service.users()
                .messages()
                .modify(
                    userId="me",
                    id=provider_msg_id,
                    body={"removeLabelIds": ["INBOX"]},
                )
                .execute(),
                label="messages.modify",
            )
        except HttpError as exc:
            logger.warning("archive_remote failed for %s: %s", provider_msg_id, exc)

    async def delete_remote(self, provider_msg_id: str) -> None:
        if self._service is None:
            await self.connect()
        assert self._service is not None
        try:
            with_gmail_retry(
                lambda: self._service.users()
                .messages()
                .trash(userId="me", id=provider_msg_id)
                .execute(),
                label="messages.trash",
            )
        except HttpError as exc:
            logger.warning("delete_remote failed for %s: %s", provider_msg_id, exc)

    async def send_message(
        self,
        *,
        to: list[str],
        subject: str,
        body_text: str,
        in_reply_to: str | None = None,
        references: str | None = None,
        thread_id: str | None = None,
    ) -> dict:
        """Send a plain-text RFC822 message via users.messages.send.

        Gmail handles all the deliverability mechanics (DKIM/SPF, From
        address, message-id) so we only have to encode a minimal RFC822
        envelope. ``thread_id`` keeps the reply attached to the source
        thread on the Gmail side; without it the reply opens a brand
        new thread even when the headers say otherwise.
        """
        if self._service is None:
            await self.connect()
        assert self._service is not None

        from email.message import EmailMessage

        msg = EmailMessage()
        msg["To"] = ", ".join(to)
        msg["Subject"] = subject
        if in_reply_to:
            msg["In-Reply-To"] = in_reply_to
            msg["References"] = references or in_reply_to
        msg.set_content(body_text)

        raw_b64 = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
        body: dict = {"raw": raw_b64}
        if thread_id:
            body["threadId"] = thread_id

        return with_gmail_retry(
            lambda: self._service.users()
            .messages()
            .send(userId="me", body=body)
            .execute(),
            label="messages.send",
        )

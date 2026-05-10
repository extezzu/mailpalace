"""IMAP mail source.

Built on the standard-library ``imaplib`` and ``email`` modules so we don't
take a third-party IMAP dependency. v0 ships the contract only; the real
``UID SEARCH`` loop lands with the ingest scheduler in v0.1.
"""

from __future__ import annotations

from datetime import datetime
from typing import AsyncIterator

from mailpalace.mail.base import NormalizedEmail


class ImapSource:
    name = "imap"

    def __init__(
        self,
        *,
        account_id: int,
        host: str,
        port: int,
        username: str,
        password: str,
    ) -> None:
        self.account_id = account_id
        self.host = host
        self.port = port
        self.username = username
        self._password = password

    async def connect(self) -> None:
        # TODO v0.1: imaplib.IMAP4_SSL connect, login, select INBOX
        return None

    async def fetch_since(self, sync_state: str | None) -> AsyncIterator[NormalizedEmail]:
        # TODO v0.1: UID SEARCH UID > last_uid, fetch RFC822, parse via mail.parse
        if False:  # pragma: no cover
            yield NormalizedEmail(
                provider_msg_id="",
                provider_thread_id="",
                from_email="",
                snippet="",
                body_text="",
                received_at=datetime.utcnow(),
            )
        return

    async def new_sync_state(self) -> str:
        return ""

    async def close(self) -> None:
        return None

    async def mark_read(self, provider_msg_id: str, *, read: bool = True) -> None:
        # TODO v0.1: STORE UID +FLAGS \Seen / -FLAGS \Seen
        return None

    async def archive_remote(self, provider_msg_id: str) -> None:
        # TODO v0.1: COPY UID -> [Gmail]/All Mail, then STORE +FLAGS \Deleted, EXPUNGE
        return None

    async def delete_remote(self, provider_msg_id: str) -> None:
        # TODO v0.1: STORE UID +FLAGS \Deleted, EXPUNGE
        return None

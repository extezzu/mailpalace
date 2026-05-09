"""Gmail mail source.

Wraps ``google-api-python-client`` and the History API. v0 ships only the
type contract; the real fetch loop lands in v0.1 alongside the OAuth flow.
"""

from __future__ import annotations

from datetime import datetime
from typing import AsyncIterator

from mailpalace.mail.base import NormalizedEmail


class GmailSource:
    name = "gmail"

    def __init__(self, *, account_id: int, credentials: dict) -> None:
        self.account_id = account_id
        self._credentials = credentials

    async def connect(self) -> None:
        # TODO v0.1: build google-api-python-client gmail v1 service
        return None

    async def fetch_since(self, sync_state: str | None) -> AsyncIterator[NormalizedEmail]:
        # TODO v0.1: users.history.list with startHistoryId=sync_state
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

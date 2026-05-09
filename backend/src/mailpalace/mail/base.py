"""Mail source Protocol shared by every email-fetcher implementation."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import datetime
from typing import Protocol, runtime_checkable

from pydantic import BaseModel


class NormalizedEmail(BaseModel):
    provider_msg_id: str
    provider_thread_id: str
    rfc822_message_id: str | None = None
    from_name: str | None = None
    from_email: str
    to: list[dict] = []
    cc: list[dict] = []
    subject: str | None = None
    snippet: str
    body_text: str
    body_html: str | None = None
    received_at: datetime
    raw_size_bytes: int = 0
    is_unread: bool = True
    is_starred: bool = False
    has_attachments: bool = False


@runtime_checkable
class MailSource(Protocol):
    account_id: int

    async def connect(self) -> None: ...

    async def fetch_since(self, sync_state: str | None) -> AsyncIterator[NormalizedEmail]: ...

    async def new_sync_state(self) -> str: ...

    async def close(self) -> None: ...

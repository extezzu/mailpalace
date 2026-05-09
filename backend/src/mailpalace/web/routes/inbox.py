"""Inbox listing endpoint."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from mailpalace.db import repo
from mailpalace.web.deps import SessionDep

router = APIRouter()


class AiBlock(BaseModel):
    language: str | None = None
    classification: str | None = None
    confidence: float | None = None
    summary_ru: str | None = None
    suggested_action: str | None = None
    provider: str | None = None


class EmailListItem(BaseModel):
    id: int
    account_id: int
    thread_id: int | None
    from_name: str | None
    from_email: str
    subject: str | None
    snippet: str | None
    received_at: datetime
    is_unread: bool
    is_starred: bool
    has_attachments: bool
    ai: AiBlock | None = None


class InboxResponse(BaseModel):
    emails: list[EmailListItem]
    next_cursor: datetime | None = None


@router.get(
    "/inbox",
    response_model=InboxResponse,
    summary="List emails with AI metadata",
    description=(
        "Cursor-paginated email list. Filter by account, classification, "
        "language, unread state, or free-text query. Each row carries the "
        "joined AI block (classification, Russian summary, suggested action) "
        "when triage has finished for that email."
    ),
)
def get_inbox(
    session: Session = SessionDep,
    account_id: int | None = Query(default=None),
    classification: str | None = Query(default=None, description="csv: urgent,important,..."),
    language: str | None = Query(default=None, description="csv: en,ru,uk,..."),
    unread: bool = Query(default=False),
    q: str | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    cursor: datetime | None = Query(default=None),
) -> InboxResponse:
    classifications = (
        [item.strip() for item in classification.split(",")] if classification else None
    )
    languages = [item.strip() for item in language.split(",")] if language else None

    rows = repo.list_inbox(
        session,
        account_id=account_id,
        classifications=classifications,
        languages=languages,
        unread_only=unread,
        query=q,
        limit=limit,
        cursor=cursor,
    )

    items: list[EmailListItem] = []
    for row in rows:
        ai_block: AiBlock | None = None
        if row.ai is not None:
            ai_block = AiBlock(
                language=row.ai.language_code,
                classification=row.ai.classification,
                confidence=row.ai.classification_confidence,
                summary_ru=row.ai.summary_ru,
                suggested_action=row.ai.suggested_action,
                provider=row.ai.provider_used,
            )
        items.append(
            EmailListItem(
                id=row.id,
                account_id=row.account_id,
                thread_id=row.thread_id,
                from_name=row.from_name,
                from_email=row.from_email,
                subject=row.subject,
                snippet=row.snippet,
                received_at=row.received_at,
                is_unread=row.is_unread,
                is_starred=row.is_starred,
                has_attachments=row.has_attachments,
                ai=ai_block,
            )
        )

    next_cursor = items[-1].received_at if items and len(items) >= limit else None
    return InboxResponse(emails=items, next_cursor=next_cursor)

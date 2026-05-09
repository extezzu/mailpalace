"""Email detail endpoint."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from mailpalace.db import repo
from mailpalace.web.deps import SessionDep
from mailpalace.web.routes.inbox import AiBlock

router = APIRouter()


class DraftBlock(BaseModel):
    id: int
    body: str
    language: str
    provider_used: str
    instructions: str | None
    created_at: datetime


class ThreadMessage(BaseModel):
    id: int
    from_name: str | None
    from_email: str
    received_at: datetime
    body_text: str | None
    body_html: str | None


class EmailDetail(BaseModel):
    id: int
    account_id: int
    thread_id: int | None
    from_name: str | None
    from_email: str
    to: list[dict]
    cc: list[dict] | None
    subject: str | None
    body_text: str | None
    body_html: str | None
    received_at: datetime
    is_unread: bool
    is_starred: bool
    has_attachments: bool
    ai: AiBlock | None
    drafts: list[DraftBlock]
    thread_messages: list[ThreadMessage]


@router.get(
    "/email/{email_id}",
    response_model=EmailDetail,
    summary="Email detail with thread + AI metadata + drafts",
    description=(
        "Returns one email plus the rest of its thread (oldest first), the "
        "joined AI block, and any drafts the user has generated for it."
    ),
)
def get_email(email_id: int, session: Session = SessionDep) -> EmailDetail:
    """Look up one email by id and return it with thread context."""
    row = repo.get_email_with_thread(session, email_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Email not found")

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

    drafts = [
        DraftBlock(
            id=d.id,
            body=d.body,
            language=d.language_code,
            provider_used=d.provider_used,
            instructions=d.instructions,
            created_at=d.created_at,
        )
        for d in row.drafts
    ]

    thread_messages: list[ThreadMessage] = []
    if row.thread_id is not None:
        thread_messages = [
            ThreadMessage(
                id=m.id,
                from_name=m.from_name,
                from_email=m.from_email,
                received_at=m.received_at,
                body_text=m.body_text,
                body_html=m.body_html,
            )
            for m in repo.get_thread_messages(session, row.thread_id)
        ]

    return EmailDetail(
        id=row.id,
        account_id=row.account_id,
        thread_id=row.thread_id,
        from_name=row.from_name,
        from_email=row.from_email,
        to=row.to_json or [],
        cc=row.cc_json,
        subject=row.subject,
        body_text=row.body_text,
        body_html=row.body_html,
        received_at=row.received_at,
        is_unread=row.is_unread,
        is_starred=row.is_starred,
        has_attachments=row.has_attachments,
        ai=ai_block,
        drafts=drafts,
        thread_messages=thread_messages,
    )

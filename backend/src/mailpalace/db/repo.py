"""Query helpers.

The web layer and pipeline call into these functions; nothing else in the
codebase imports SQLAlchemy directly. Keeping queries here means the schema
can evolve without ripping through every route.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload


def _utcnow() -> datetime:
    return datetime.now(tz=timezone.utc)

from mailpalace.db.schema import (
    Account,
    AIMetadata,
    Draft,
    Email,
    IngestRun,
    Thread,
)


def list_accounts(session: Session, active_only: bool = True) -> list[Account]:
    stmt = select(Account)
    if active_only:
        stmt = stmt.where(Account.is_active.is_(True))
    return list(session.scalars(stmt).all())


def list_inbox(
    session: Session,
    *,
    account_id: int | None = None,
    classifications: list[str] | None = None,
    languages: list[str] | None = None,
    unread_only: bool = False,
    query: str | None = None,
    limit: int = 50,
    cursor: datetime | None = None,
    folder: str = "inbox",
) -> list[Email]:
    """Return emails in one folder.

    `folder` controls which row state we want:
      - "inbox": not replied, not deleted, not snoozed.
      - "sent":  replied_at IS NOT NULL.
      - "trash": deleted_at IS NOT NULL.
      - "all":   no folder predicate; useful for /api/email/{id} lookups.
    """
    stmt = (
        select(Email)
        .options(joinedload(Email.ai))
        .order_by(Email.received_at.desc())
        .limit(limit)
    )
    if folder == "inbox":
        stmt = stmt.where(
            Email.replied_at.is_(None),
            Email.deleted_at.is_(None),
            Email.snoozed_until.is_(None),
        )
    elif folder == "sent":
        stmt = stmt.where(Email.replied_at.is_not(None))
    elif folder == "trash":
        stmt = stmt.where(Email.deleted_at.is_not(None))
    if account_id is not None:
        stmt = stmt.where(Email.account_id == account_id)
    if unread_only:
        stmt = stmt.where(Email.is_unread.is_(True))
    if cursor is not None:
        stmt = stmt.where(Email.received_at < cursor)
    if classifications or languages:
        stmt = stmt.join(AIMetadata)
        if classifications:
            stmt = stmt.where(AIMetadata.classification.in_(classifications))
        if languages:
            stmt = stmt.where(AIMetadata.language_code.in_(languages))
    if query:
        like = f"%{query}%"
        stmt = stmt.where((Email.subject.ilike(like)) | (Email.snippet.ilike(like)))
    return list(session.scalars(stmt).unique().all())


def mark_email_replied(session: Session, email_id: int) -> Email | None:
    email = session.get(Email, email_id)
    if email is None:
        return None
    email.replied_at = _utcnow()
    email.is_unread = False
    return email


def mark_email_deleted(session: Session, email_id: int) -> Email | None:
    email = session.get(Email, email_id)
    if email is None:
        return None
    email.deleted_at = _utcnow()
    return email


def mark_email_unread(session: Session, email_id: int, is_unread: bool) -> Email | None:
    email = session.get(Email, email_id)
    if email is None:
        return None
    email.is_unread = is_unread
    return email


def snooze_email(session: Session, email_id: int, until: datetime) -> Email | None:
    email = session.get(Email, email_id)
    if email is None:
        return None
    email.snoozed_until = until
    return email


def bulk_mark_deleted(session: Session, email_ids: list[int]) -> int:
    if not email_ids:
        return 0
    stmt = select(Email).where(Email.id.in_(email_ids))
    rows = session.scalars(stmt).all()
    now = _utcnow()
    for row in rows:
        row.deleted_at = now
    return len(rows)


def get_email_with_thread(session: Session, email_id: int) -> Email | None:
    stmt = (
        select(Email)
        .options(
            joinedload(Email.ai),
            joinedload(Email.drafts),
            joinedload(Email.thread),
        )
        .where(Email.id == email_id)
    )
    return session.scalars(stmt).unique().one_or_none()


def get_thread_messages(session: Session, thread_id: int) -> list[Email]:
    stmt = (
        select(Email)
        .options(joinedload(Email.ai))
        .where(Email.thread_id == thread_id)
        .order_by(Email.received_at.asc())
    )
    return list(session.scalars(stmt).unique().all())


def upsert_thread(
    session: Session,
    *,
    account_id: int,
    provider_thread_id: str,
    subject: str | None,
    participants: list[dict],
    last_message_at: datetime,
) -> Thread:
    thread = session.scalar(
        select(Thread).where(
            Thread.account_id == account_id,
            Thread.provider_thread_id == provider_thread_id,
        )
    )
    if thread is None:
        thread = Thread(
            account_id=account_id,
            provider_thread_id=provider_thread_id,
            subject=subject,
            participants_json=participants,
            last_message_at=last_message_at,
            message_count=0,
        )
        session.add(thread)
        session.flush()
    else:
        thread.last_message_at = max(thread.last_message_at, last_message_at)
    return thread


def insert_email_if_new(session: Session, email: Email) -> Email | None:
    """INSERT ... ON CONFLICT DO NOTHING semantics. Returns the row if inserted, else None."""
    existing = session.scalar(
        select(Email).where(
            Email.account_id == email.account_id,
            Email.provider_msg_id == email.provider_msg_id,
        )
    )
    if existing is not None:
        return None
    session.add(email)
    session.flush()
    return email


def upsert_ai_metadata(session: Session, email_id: int, **fields: Any) -> AIMetadata:
    ai = session.get(AIMetadata, email_id)
    if ai is None:
        ai = AIMetadata(email_id=email_id, **fields)
        session.add(ai)
    else:
        for k, v in fields.items():
            setattr(ai, k, v)
    session.flush()
    return ai


def list_pending_triage(session: Session, limit: int = 20) -> list[Email]:
    """Emails awaiting initial triage."""
    stmt = (
        select(Email)
        .outerjoin(AIMetadata)
        .where(
            (AIMetadata.email_id.is_(None))
            | (AIMetadata.error_message == "pending")
        )
        .order_by(Email.received_at.desc())
        .limit(limit)
    )
    return list(session.scalars(stmt).all())


def latest_drafts(session: Session, email_id: int) -> list[Draft]:
    stmt = (
        select(Draft)
        .where(Draft.email_id == email_id)
        .order_by(Draft.created_at.desc())
    )
    return list(session.scalars(stmt).all())


def open_ingest_run(session: Session, account_id: int) -> IngestRun:
    run = IngestRun(account_id=account_id, started_at=_utcnow(), status="running")
    session.add(run)
    session.flush()
    return run


def close_ingest_run(
    session: Session,
    run_id: int,
    *,
    status: str,
    new_count: int = 0,
    error_count: int = 0,
    error_summary: str | None = None,
) -> None:
    run = session.get(IngestRun, run_id)
    if run is None:
        return
    run.finished_at = _utcnow()
    run.status = status
    run.new_count = new_count
    run.error_count = error_count
    run.error_summary = error_summary

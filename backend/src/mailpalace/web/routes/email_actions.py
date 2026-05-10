"""Mutating email endpoints (mark replied, delete, mark read, snooze)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from mailpalace.db import repo
from mailpalace.web.deps import SessionDep

router = APIRouter()


class EmailUpdate(BaseModel):
    is_unread: bool | None = None


class SnoozeRequest(BaseModel):
    minutes: int = 60


class BulkRequest(BaseModel):
    email_ids: list[int]


@router.post("/email/{email_id}/mark_replied", summary="Move email to Sent")
def mark_replied(email_id: int, session: Session = SessionDep) -> dict:
    """Stamp an email as replied. Inbox hides it; Sent reads it."""
    row = repo.mark_email_replied(session, email_id)
    session.commit()
    if row is None:
        raise HTTPException(status_code=404, detail="Email not found")
    return {"id": row.id, "replied_at": row.replied_at.isoformat() if row.replied_at else None}


@router.post("/email/{email_id}/delete", summary="Move email to Trash")
def delete_email(email_id: int, session: Session = SessionDep) -> dict:
    row = repo.mark_email_deleted(session, email_id)
    session.commit()
    if row is None:
        raise HTTPException(status_code=404, detail="Email not found")
    return {"id": row.id, "deleted_at": row.deleted_at.isoformat() if row.deleted_at else None}


@router.patch("/email/{email_id}", summary="Update read state")
def patch_email(email_id: int, body: EmailUpdate, session: Session = SessionDep) -> dict:
    if body.is_unread is None:
        raise HTTPException(status_code=400, detail="No fields to update")
    row = repo.mark_email_unread(session, email_id, body.is_unread)
    session.commit()
    if row is None:
        raise HTTPException(status_code=404, detail="Email not found")
    return {"id": row.id, "is_unread": row.is_unread}


@router.post("/email/{email_id}/snooze", summary="Hide email until later")
def snooze_email(email_id: int, body: SnoozeRequest, session: Session = SessionDep) -> dict:
    until = datetime.now(tz=timezone.utc) + timedelta(minutes=max(body.minutes, 1))
    row = repo.snooze_email(session, email_id, until)
    session.commit()
    if row is None:
        raise HTTPException(status_code=404, detail="Email not found")
    return {"id": row.id, "snoozed_until": until.isoformat()}


@router.post("/email/bulk_delete", summary="Delete several emails at once")
def bulk_delete(body: BulkRequest, session: Session = SessionDep) -> dict:
    affected = repo.bulk_mark_deleted(session, body.email_ids)
    session.commit()
    return {"affected": affected}

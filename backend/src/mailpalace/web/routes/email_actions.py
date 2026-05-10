"""Mutating email endpoints (mark replied, delete, mark read, snooze)."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from mailpalace.db import repo
from mailpalace.web.deps import SessionDep

logger = logging.getLogger(__name__)
router = APIRouter()


# Tracks the latest retriage_all job. v0 keeps it in process memory; v0.1
# moves it into Redis when the scheduler ships.
_RETRIAGE_PROGRESS: dict[str, int | bool | str | None] = {
    "processing": False,
    "current": 0,
    "total": 0,
    "succeeded": 0,
    "failed": 0,
    "started_at": None,
    "finished_at": None,
}
_RETRIAGE_LOCK = asyncio.Lock()


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


async def _retriage_worker(email_ids: list[int]) -> None:
    """Run triage for each email and update the shared progress dict.

    The lock guards against two concurrent retriage cycles racing the
    progress counter; the second caller backs off and refuses to start.
    """
    from mailpalace.pipeline.triage import triage_email

    if _RETRIAGE_LOCK.locked():
        logger.info("retriage already running; skipping new request")
        return

    async with _RETRIAGE_LOCK:
        _RETRIAGE_PROGRESS.update(
            processing=True,
            current=0,
            total=len(email_ids),
            succeeded=0,
            failed=0,
            started_at=datetime.now(tz=timezone.utc).isoformat(),
            finished_at=None,
        )
        for email_id in email_ids:
            try:
                ok = await triage_email(int(email_id))
            except Exception:
                logger.exception("retriage failed for email %d", email_id)
                ok = False
            _RETRIAGE_PROGRESS["current"] = int(_RETRIAGE_PROGRESS["current"]) + 1  # type: ignore[arg-type]
            if ok:
                _RETRIAGE_PROGRESS["succeeded"] = int(_RETRIAGE_PROGRESS["succeeded"]) + 1  # type: ignore[arg-type]
            else:
                _RETRIAGE_PROGRESS["failed"] = int(_RETRIAGE_PROGRESS["failed"]) + 1  # type: ignore[arg-type]
        _RETRIAGE_PROGRESS["processing"] = False
        _RETRIAGE_PROGRESS["finished_at"] = datetime.now(tz=timezone.utc).isoformat()


@router.post(
    "/retriage_all",
    status_code=202,
    summary="Kick off a background re-triage of every active email",
    description=(
        "Returns immediately. Use GET /api/retriage_progress to poll. "
        "Used after the user changes summary_locale so existing rows pick "
        "up the new language without freezing the UI on a long LLM cycle."
    ),
)
async def retriage_all(
    background: BackgroundTasks, session: Session = SessionDep
) -> dict:
    from sqlalchemy import select as sa_select

    from mailpalace.db.schema import Email

    if _RETRIAGE_PROGRESS["processing"]:
        return {
            "started": False,
            "reason": "another retriage is already running",
            **_RETRIAGE_PROGRESS,
        }

    rows = session.scalars(sa_select(Email.id)).all()
    email_ids = [int(row) for row in rows]
    background.add_task(_retriage_worker, email_ids)
    return {"started": True, "total": len(email_ids)}


@router.get(
    "/retriage_progress",
    summary="Read the current retriage_all progress",
    description=(
        "Polled by the dashboard while the language switcher is rotating "
        "every email through the LLM. Reports current/total counts and "
        "succeeded/failed breakdown."
    ),
)
def retriage_progress() -> dict:
    return dict(_RETRIAGE_PROGRESS)

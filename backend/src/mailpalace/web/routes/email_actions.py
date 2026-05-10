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


async def _propagate_to_provider(
    email_id: int,
    action: str,
    *,
    read: bool | None = None,
) -> None:
    """Push a local action (read/delete/archive) up to the upstream mailbox.

    Best-effort: any provider failure logs and returns silently so the
    user's local state still moves regardless of network blips.
    """
    from mailpalace.db.engine import session_scope as _scope
    from mailpalace.db.schema import Account, Email
    from mailpalace.mail.gmail import GmailSource

    with _scope() as session:
        email_row = session.get(Email, email_id)
        if email_row is None:
            return
        account = session.get(Account, email_row.account_id)
        if account is None:
            return
        provider_msg_id = email_row.provider_msg_id
        kind = account.kind
        email_address = account.email_address
        account_id = account.id

    if kind != "gmail":
        return

    source = GmailSource(account_id=account_id, email_address=email_address)
    try:
        await source.connect()
        if action == "read":
            await source.mark_read(provider_msg_id, read=read if read is not None else True)
        elif action == "trash":
            await source.delete_remote(provider_msg_id)
        elif action == "archive":
            await source.archive_remote(provider_msg_id)
    except Exception:
        logger.exception("provider propagate failed for action=%s id=%d", action, email_id)
    finally:
        await source.close()


@router.post("/email/{email_id}/mark_replied", summary="Move email to Sent")
async def mark_replied(
    email_id: int, background: BackgroundTasks, session: Session = SessionDep
) -> dict:
    """Stamp an email as replied. Inbox hides it; Sent reads it."""
    row = repo.mark_email_replied(session, email_id)
    session.commit()
    if row is None:
        raise HTTPException(status_code=404, detail="Email not found")
    background.add_task(_propagate_to_provider, email_id, "read", read=True)
    return {"id": row.id, "replied_at": row.replied_at.isoformat() if row.replied_at else None}


class SendRequest(BaseModel):
    body_text: str
    from_account_id: int | None = None  # null = use the email's own account


@router.post(
    "/email/{email_id}/send",
    summary="Send a real reply through the upstream provider",
    description=(
        "Builds an RFC822 reply (To = original From, Subject = 'Re: …', "
        "In-Reply-To header set) and sends it via the chosen account. "
        "Gmail accounts use users.messages.send under the gmail.modify "
        "scope. IMAP-only accounts return 501 until the SMTP layer "
        "ships in the next iteration. On success we mark the source "
        "email as replied so it leaves the inbox immediately."
    ),
)
async def send_email_reply(
    email_id: int,
    body: SendRequest,
    session: Session = SessionDep,
) -> dict:
    """Send a reply and stamp the original as replied."""
    from mailpalace.db.engine import session_scope as _scope
    from mailpalace.db.schema import Account, Email
    from mailpalace.mail.gmail import GmailSource

    if not body.body_text or not body.body_text.strip():
        raise HTTPException(status_code=400, detail="Reply body is empty.")

    # Snapshot every value we need from the DB before doing any I/O so
    # we never hold a session open across a network call.
    with _scope() as _s:
        email_row = _s.get(Email, email_id)
        if email_row is None:
            raise HTTPException(status_code=404, detail="Email not found")
        target_account_id = body.from_account_id or email_row.account_id
        from_account = _s.get(Account, target_account_id)
        if from_account is None:
            raise HTTPException(status_code=400, detail="Sending account not found")
        if not from_account.is_active:
            raise HTTPException(status_code=400, detail="Sending account is disabled")

        original_subject = email_row.subject or ""
        original_from = email_row.from_email
        rfc822_msg_id = email_row.rfc822_message_id
        provider_thread_id_for_gmail = (
            email_row.provider_msg_id.split(":", 1)[0]
            if from_account.kind == "imap"
            else None
        )
        # The Gmail thread id is stored on the Thread row (provider_thread_id).
        gmail_thread_id: str | None = None
        if from_account.kind == "gmail" and email_row.thread_id is not None:
            from mailpalace.db.schema import Thread as _Thread

            thread_row = _s.get(_Thread, email_row.thread_id)
            if thread_row is not None:
                gmail_thread_id = thread_row.provider_thread_id

        sender_kind = from_account.kind
        sender_email = from_account.email_address

    if sender_kind != "gmail":
        # SMTP for IMAP accounts is the next chunk of work — until it
        # ships we'd rather fail loudly than silently look like we sent
        # something. Surface a clear 501 so the UI can explain.
        raise HTTPException(
            status_code=501,
            detail=(
                f"Sending from {sender_email} (IMAP) is not implemented yet. "
                "Use a Gmail account for now or wait for the SMTP layer."
            ),
        )

    subject = original_subject
    if not subject.lower().startswith("re:"):
        subject = f"Re: {subject}" if subject else "Re:"

    source = GmailSource(account_id=target_account_id, email_address=sender_email)
    try:
        await source.connect()
        result = await source.send_message(
            to=[original_from],
            subject=subject,
            body_text=body.body_text,
            in_reply_to=rfc822_msg_id,
            references=rfc822_msg_id,
            thread_id=gmail_thread_id,
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("send via gmail failed for email %d", email_id)
        raise HTTPException(
            status_code=502,
            detail=f"Provider rejected the send: {exc}",
        ) from exc
    finally:
        await source.close()

    # Stamp source as replied so the inbox hides it. Read-state on
    # provider gets bumped in the same propagate path the manual
    # "mark replied" button uses.
    with _scope() as _s:
        repo.mark_email_replied(_s, email_id)

    return {
        "id": email_id,
        "sent": True,
        "provider_message_id": result.get("id"),
        "from_account_id": target_account_id,
    }


@router.post("/email/{email_id}/delete", summary="Move email to Trash")
async def delete_email(
    email_id: int, background: BackgroundTasks, session: Session = SessionDep
) -> dict:
    row = repo.mark_email_deleted(session, email_id)
    session.commit()
    if row is None:
        raise HTTPException(status_code=404, detail="Email not found")
    background.add_task(_propagate_to_provider, email_id, "trash")
    return {"id": row.id, "deleted_at": row.deleted_at.isoformat() if row.deleted_at else None}


@router.post("/email/{email_id}/archive", summary="Remove from Inbox without deleting")
async def archive_email(
    email_id: int, background: BackgroundTasks, session: Session = SessionDep
) -> dict:
    """Archive locally + propagate to the upstream mailbox.

    Strips ``INBOX`` from the row's provider_labels so list_inbox stops
    surfacing it, then asks the provider to drop the INBOX label too
    (Gmail: ``users.messages.modify`` removeLabelIds=[INBOX]; IMAP:
    archive/move per ImapSource.archive_remote).
    """
    from mailpalace.db.schema import Email

    row = session.get(Email, email_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Email not found")
    labels = list(row.provider_labels or [])
    if "INBOX" in labels:
        labels.remove("INBOX")
        row.provider_labels = labels
    session.commit()
    background.add_task(_propagate_to_provider, email_id, "archive")
    return {"id": email_id, "archived": True}


@router.patch("/email/{email_id}", summary="Update read state")
async def patch_email(
    email_id: int,
    body: EmailUpdate,
    background: BackgroundTasks,
    session: Session = SessionDep,
) -> dict:
    if body.is_unread is None:
        raise HTTPException(status_code=400, detail="No fields to update")
    row = repo.mark_email_unread(session, email_id, body.is_unread)
    session.commit()
    if row is None:
        raise HTTPException(status_code=404, detail="Email not found")
    background.add_task(
        _propagate_to_provider, email_id, "read", read=not body.is_unread
    )
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
async def bulk_delete(
    body: BulkRequest, background: BackgroundTasks, session: Session = SessionDep
) -> dict:
    affected = repo.bulk_mark_deleted(session, body.email_ids)
    session.commit()
    for email_id in body.email_ids:
        background.add_task(_propagate_to_provider, email_id, "trash")
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

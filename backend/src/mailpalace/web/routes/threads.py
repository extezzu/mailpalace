"""Thread / conversation endpoints for the Sent (chat-style) view.

The dashboard's Sent folder renders correspondences as a Telegram-style
chat: left rail lists every thread the user has replied in, right pane
shows the messages with outgoing bubbles aligned right and incoming
bubbles aligned left. These two endpoints feed that view.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from mailpalace.db import repo
from mailpalace.db.schema import Account, Email, Thread
from mailpalace.web.deps import SessionDep

router = APIRouter()


class ThreadSummary(BaseModel):
    thread_id: int
    subject: str | None
    counterpart_email: str
    counterpart_name: str | None
    last_message_at: datetime
    last_message_snippet: str | None
    last_was_outgoing: bool
    message_count: int
    account_id: int
    account_email: str


class ThreadMessage(BaseModel):
    id: int
    direction: str  # "incoming" | "outgoing"
    from_name: str | None
    from_email: str
    received_at: datetime
    subject: str | None
    body_text: str | None
    body_html: str | None
    is_unread: bool


class ThreadDetail(BaseModel):
    thread_id: int
    subject: str | None
    counterpart_email: str
    counterpart_name: str | None
    account_id: int
    account_email: str
    messages: list[ThreadMessage]


def _is_outgoing(email: Email, account_email: str) -> bool:
    """Treat a row as outgoing if Gmail labelled it SENT, the user marked
    it replied locally, or the From address matches the connected account.
    """
    labels = email.provider_labels or []
    if "SENT" in labels:
        return True
    if email.replied_at is not None:
        return True
    return (email.from_email or "").lower() == account_email.lower()


def _counterpart(thread_emails: list[Email], account_email: str) -> tuple[str, str | None]:
    """Pick the most likely "other party" address for a thread.

    Walks every message, prefers an incoming sender; falls back to the
    first To/Cc address found on an outgoing message. We return both
    address + display name when available.
    """
    me = account_email.lower()
    for email in thread_emails:
        if not _is_outgoing(email, account_email):
            return email.from_email, email.from_name
    # Every message in this thread came from us — look at the To/Cc list.
    for email in thread_emails:
        for entry in (email.to_json or []) + (email.cc_json or []):
            addr = (entry.get("email") or "").strip()
            if addr and addr.lower() != me:
                return addr, entry.get("name") or None
    return account_email, None


@router.get(
    "/threads",
    response_model=list[ThreadSummary],
    summary="List Sent-side conversations grouped by thread",
    description=(
        "Every thread that has at least one outgoing message (Gmail SENT "
        "label, locally-replied, or sent from the connected address). "
        "Sorted newest activity first."
    ),
)
def list_sent_threads(session: Session = SessionDep) -> list[ThreadSummary]:
    # Pull every email in a thread that contains at least one outgoing
    # message. We do the "thread has outgoing?" filter in Python after
    # the join so the SQL stays simple — typical Sent volume is well
    # under a few hundred threads.
    stmt = (
        select(Email)
        .options(joinedload(Email.thread))
        .order_by(Email.received_at.asc())
    )
    rows = list(session.scalars(stmt).unique().all())

    accounts = {a.id: a for a in session.scalars(select(Account)).all()}

    by_thread: dict[int, list[Email]] = {}
    for row in rows:
        if row.thread_id is None:
            continue
        by_thread.setdefault(row.thread_id, []).append(row)

    summaries: list[ThreadSummary] = []
    for thread_id, emails in by_thread.items():
        account = accounts.get(emails[0].account_id)
        if account is None:
            continue
        if not any(_is_outgoing(e, account.email_address) for e in emails):
            continue
        counterpart_email, counterpart_name = _counterpart(emails, account.email_address)
        last = max(emails, key=lambda e: e.received_at)
        summaries.append(
            ThreadSummary(
                thread_id=thread_id,
                subject=emails[0].subject,
                counterpart_email=counterpart_email,
                counterpart_name=counterpart_name,
                last_message_at=last.received_at,
                last_message_snippet=last.snippet,
                last_was_outgoing=_is_outgoing(last, account.email_address),
                message_count=len(emails),
                account_id=account.id,
                account_email=account.email_address,
            )
        )

    summaries.sort(key=lambda s: s.last_message_at, reverse=True)
    return summaries


@router.get(
    "/threads/{thread_id}",
    response_model=ThreadDetail,
    summary="Full message history for a single thread",
    description=(
        "Returns every message in the thread, ordered oldest → newest, "
        "tagged as incoming or outgoing relative to the connected "
        "account. Powers the chat bubble view."
    ),
)
def get_thread(thread_id: int, session: Session = SessionDep) -> ThreadDetail:
    thread_row = session.get(Thread, thread_id)
    if thread_row is None:
        raise HTTPException(status_code=404, detail="Thread not found")

    account = session.get(Account, thread_row.account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Owning account missing")

    emails = repo.get_thread_messages(session, thread_id)
    counterpart_email, counterpart_name = _counterpart(emails, account.email_address)

    messages: list[ThreadMessage] = []
    for email in emails:
        outgoing = _is_outgoing(email, account.email_address)
        messages.append(
            ThreadMessage(
                id=email.id,
                direction="outgoing" if outgoing else "incoming",
                from_name=email.from_name,
                from_email=email.from_email,
                received_at=email.received_at,
                subject=email.subject,
                body_text=email.body_text,
                body_html=email.body_html,
                is_unread=email.is_unread,
            )
        )

    return ThreadDetail(
        thread_id=thread_id,
        subject=thread_row.subject,
        counterpart_email=counterpart_email,
        counterpart_name=counterpart_name,
        account_id=account.id,
        account_email=account.email_address,
        messages=messages,
    )

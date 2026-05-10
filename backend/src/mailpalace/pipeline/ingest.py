"""Ingest pipeline: pull new messages from a MailSource into SQLite."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select

from mailpalace.db.engine import session_scope
from mailpalace.db.repo import (
    close_ingest_run,
    insert_email_if_new,
    open_ingest_run,
    upsert_thread,
)
from mailpalace.db.schema import Account, Email
from mailpalace.mail.base import MailSource, NormalizedEmail
from mailpalace.mail.gmail import GmailSource
from mailpalace.pipeline.triage import triage_email

logger = logging.getLogger(__name__)


def _build_source(account: Account) -> MailSource:
    if account.kind == "gmail":
        return GmailSource(account_id=account.id, email_address=account.email_address)
    raise NotImplementedError(f"v0.1 only supports gmail; got {account.kind}")


async def ingest_account(account_id: int) -> tuple[int, int]:
    """Pull new emails for one account. Returns (new_count, error_count)."""
    with session_scope() as session:
        account = session.get(Account, account_id)
        if account is None:
            return 0, 0
        sync_state = account.last_sync_state
        run = open_ingest_run(session, account_id)
        run_id = run.id

    source = _build_source(_account_snapshot(account_id))
    new_count = 0
    error_count = 0
    new_email_ids: list[int] = []

    try:
        await source.connect()
        async for normalized in source.fetch_since(sync_state):
            try:
                inserted_id = _persist_email(account_id, normalized)
                if inserted_id is not None:
                    new_count += 1
                    new_email_ids.append(inserted_id)
            except Exception:
                logger.exception("failed to persist email")
                error_count += 1
        new_state = await source.new_sync_state()
        with session_scope() as session:
            row = session.get(Account, account_id)
            if row is not None:
                row.last_sync_state = new_state
                row.last_synced_at = datetime.now(tz=timezone.utc).replace(tzinfo=None)
                row.last_error = None
        with session_scope() as session:
            close_ingest_run(
                session, run_id, status="ok", new_count=new_count, error_count=error_count
            )
    except Exception as exc:
        logger.exception("ingest failed for account %d", account_id)
        with session_scope() as session:
            row = session.get(Account, account_id)
            if row is not None:
                row.last_error = str(exc)[:500]
            close_ingest_run(
                session,
                run_id,
                status="failed",
                new_count=new_count,
                error_count=error_count + 1,
                error_summary=str(exc)[:500],
            )
        return new_count, error_count + 1
    finally:
        await source.close()

    # Triage every new email through the active LLM provider. Ollama with
    # OLLAMA_NUM_PARALLEL configured + a small (1B) model on a consumer
    # GPU comfortably runs four in flight; the semaphore keeps us from
    # firing fifty fetches at once and starving the dashboard's polling.
    import asyncio as _asyncio

    semaphore = _asyncio.Semaphore(4)

    async def _bounded(eid: int) -> None:
        async with semaphore:
            try:
                await triage_email(eid)
            except Exception:
                logger.exception("triage failed for email %d", eid)

    await _asyncio.gather(*(_bounded(eid) for eid in new_email_ids))
    return new_count, error_count


def _account_snapshot(account_id: int) -> Account:
    """Return a detached copy of the account row for use outside a session."""
    with session_scope() as session:
        row = session.get(Account, account_id)
        if row is None:
            raise ValueError(f"account {account_id} disappeared mid-ingest")
        # Detach by copying the fields we need.
        copy = Account(
            id=row.id,
            kind=row.kind,
            label=row.label,
            email_address=row.email_address,
            config_json=row.config_json,
            last_sync_state=row.last_sync_state,
            is_active=row.is_active,
        )
        return copy


def _persist_email(account_id: int, normalized: NormalizedEmail) -> int | None:
    received_at = normalized.received_at
    if received_at.tzinfo is not None:
        received_at = received_at.astimezone(timezone.utc).replace(tzinfo=None)
    with session_scope() as session:
        thread = upsert_thread(
            session,
            account_id=account_id,
            provider_thread_id=normalized.provider_thread_id,
            subject=normalized.subject,
            participants=[*normalized.to, *normalized.cc, {"email": normalized.from_email}],
            last_message_at=received_at,
        )
        new_email = Email(
            account_id=account_id,
            thread_id=thread.id,
            provider_msg_id=normalized.provider_msg_id,
            rfc822_message_id=normalized.rfc822_message_id,
            from_name=normalized.from_name,
            from_email=normalized.from_email,
            to_json=list(normalized.to),
            cc_json=list(normalized.cc) if normalized.cc else None,
            subject=normalized.subject,
            snippet=normalized.snippet,
            body_text=normalized.body_text,
            body_html=normalized.body_html,
            received_at=received_at,
            raw_size_bytes=normalized.raw_size_bytes,
            is_unread=normalized.is_unread,
            is_starred=normalized.is_starred,
            has_attachments=normalized.has_attachments,
            provider_labels=list(normalized.labels),
        )
        inserted = insert_email_if_new(session, new_email)
        if inserted is None:
            return None
        return int(inserted.id)

"""Account management endpoints."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from mailpalace.auth import gmail_oauth
from mailpalace.db.engine import session_scope
from mailpalace.db.schema import Account
from mailpalace.pipeline.ingest import ingest_account
from mailpalace.web.deps import SessionDep

logger = logging.getLogger(__name__)
router = APIRouter()


# Polled by the connect wizard so the UI can show consent / fetching /
# done states without a long-blocking request that any proxy or dev-server
# hot reload would happily kill.
_OAUTH_STATE: dict[str, str | int | None] = {
    "phase": "idle",  # idle | awaiting_consent | exchanging | ingesting | done | error
    "account_id": None,
    "email_address": None,
    "error": None,
    "started_at": None,
    "finished_at": None,
    # Published when the worker generates the consent URL. Frontend uses
    # this as a fallback link when the OS browser-launch fails silently.
    "consent_url": None,
}
_OAUTH_LOCK = asyncio.Lock()


class AccountSummary(BaseModel):
    id: int
    kind: Literal["gmail", "imap"]
    email_address: str
    label: str
    is_active: bool
    last_synced_at: str | None
    last_error: str | None


def _to_summary(row: Account) -> AccountSummary:
    return AccountSummary(
        id=row.id,
        kind=row.kind,  # type: ignore[arg-type]
        email_address=row.email_address,
        label=row.label,
        is_active=row.is_active,
        last_synced_at=row.last_synced_at.isoformat() if row.last_synced_at else None,
        last_error=row.last_error,
    )


@router.get("/accounts", response_model=list[AccountSummary], summary="List connected mailboxes")
def list_accounts(session: Session = SessionDep) -> list[AccountSummary]:
    rows = session.scalars(select(Account).order_by(Account.id)).all()
    return [_to_summary(row) for row in rows]


@router.delete("/accounts/{account_id}", status_code=204, summary="Disconnect a mailbox")
def delete_account(account_id: int, session: Session = SessionDep) -> None:
    row = session.get(Account, account_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Account not found")
    if row.kind == "gmail":
        try:
            gmail_oauth.forget(row.email_address)
        except Exception:
            logger.exception("failed to clear refresh token for %s", row.email_address)
    session.delete(row)
    session.commit()


async def _gmail_oauth_worker() -> None:
    """Run the OAuth flow off the request thread.

    The frontend polls /api/accounts/gmail/status to know when consent
    finishes, when ingest starts, and when the account is ready.
    """

    def _set(**fields: str | int | None) -> None:
        _OAUTH_STATE.update(fields)

    if _OAUTH_LOCK.locked():
        logger.info("Gmail OAuth already in progress; ignoring duplicate request")
        return

    async with _OAUTH_LOCK:
        _set(
            phase="awaiting_consent",
            account_id=None,
            email_address=None,
            error=None,
            consent_url=None,
            started_at=datetime.now(tz=timezone.utc).isoformat(),
            finished_at=None,
        )

        def _publish_url(url: str) -> None:
            _OAUTH_STATE["consent_url"] = url

        try:
            # run_install_flow blocks on the consent screen + redirect, so
            # offload it to a thread to keep the event loop free.
            creds, profile = await asyncio.to_thread(
                gmail_oauth.run_install_flow, _publish_url
            )
            email_address = profile.get("emailAddress")
            if not email_address:
                raise RuntimeError("Google did not return a profile email")
            _set(phase="exchanging", email_address=email_address)
            gmail_oauth.store_refresh_token(email_address, creds)

            with session_scope() as session:
                existing = session.scalar(
                    select(Account).where(Account.email_address == email_address)
                )
                if existing is not None:
                    existing.kind = "gmail"
                    existing.is_active = True
                    existing.last_error = None
                    account_id = existing.id
                else:
                    row = Account(
                        kind="gmail",
                        label=email_address,
                        email_address=email_address,
                        config_json={"history_id": profile.get("historyId")},
                        is_active=True,
                    )
                    session.add(row)
                    session.flush()
                    account_id = row.id
            # The account row is in the DB and the refresh token is in the
            # keyring, so the user is technically logged in already. We
            # mark phase=done immediately and let the heavy first-ingest
            # run as a detached task. The wizard exits in ~1s instead of
            # blocking 2-3 minutes on the synchronous Gmail backfill, and
            # the dashboard's existing /api/inbox poll picks up rows as
            # they land.
            _set(
                phase="done",
                account_id=account_id,
                finished_at=datetime.now(tz=timezone.utc).isoformat(),
            )

            async def _detached_ingest() -> None:
                try:
                    await ingest_account(account_id)
                except Exception:
                    logger.exception("background ingest after oauth failed")

            asyncio.create_task(_detached_ingest())
            return
        except Exception as exc:
            logger.exception("Gmail OAuth worker failed")
            _set(
                phase="error",
                error=str(exc)[:500],
                finished_at=datetime.now(tz=timezone.utc).isoformat(),
            )


@router.post(
    "/accounts/gmail/connect",
    status_code=202,
    summary="Kick off the Gmail OAuth flow in the background",
    description=(
        "Returns immediately. Use GET /api/accounts/gmail/status to poll. "
        "The backend opens the user's browser at Google's consent screen "
        "via google-auth-oauthlib's localhost loopback redirect."
    ),
)
async def connect_gmail() -> dict:
    if _OAUTH_STATE["phase"] in ("awaiting_consent", "exchanging", "ingesting"):
        return {"started": False, "reason": "OAuth already in progress", **_OAUTH_STATE}
    if gmail_oauth._load_client_config_path() is None:  # type: ignore[attr-defined]
        # Surface the missing-credentials case before kicking the worker so
        # the wizard can render a clear error instead of polling forever.
        raise HTTPException(
            status_code=400,
            detail=(
                "Google credentials file missing. Save the OAuth client JSON "
                "to ~/.mailpalace/google_credentials.json."
            ),
        )
    asyncio.create_task(_gmail_oauth_worker())
    return {"started": True, **_OAUTH_STATE}


@router.get(
    "/accounts/gmail/status",
    summary="Read the latest Gmail OAuth flow status",
)
def gmail_status(session: Session = SessionDep) -> dict:
    """OAuth state plus live ingest counters.

    The wizard's loader uses ingested_count to show "234 emails imported
    so far" while phase=ingesting; counts are read directly off the
    emails / ai_metadata tables filtered to the account that's currently
    being onboarded, so we don't need to plumb a live counter through
    the pipeline itself.
    """
    state = dict(_OAUTH_STATE)
    account_id = state.get("account_id")
    state["ingested_count"] = 0
    state["triaged_count"] = 0
    if isinstance(account_id, int):
        from sqlalchemy import func as _func, select as _select

        from mailpalace.db.schema import AIMetadata, Email

        ingested = session.scalar(
            _select(_func.count(Email.id)).where(Email.account_id == account_id)
        )
        triaged = session.scalar(
            _select(_func.count(AIMetadata.email_id))
            .join(Email, Email.id == AIMetadata.email_id)
            .where(Email.account_id == account_id)
        )
        state["ingested_count"] = int(ingested or 0)
        state["triaged_count"] = int(triaged or 0)
    return state


@router.post("/accounts/{account_id}/sync", summary="Force a sync for a connected account")
async def sync_account(account_id: int, session: Session = SessionDep) -> dict:
    row = session.get(Account, account_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Account not found")
    new_count, error_count = await ingest_account(account_id)
    return {"new": new_count, "errors": error_count}


@router.post(
    "/accounts/{account_id}/rebackfill",
    summary="Re-run a full canonical mailbox scan",
    description=(
        "Clears the stored Gmail historyId so the next ingest performs the "
        "full no-q + includeSpamTrash backfill instead of an incremental "
        "history.list. Existing rows are preserved; only messages that were "
        "missed by earlier (narrower) queries get inserted, since "
        "insert_email_if_new dedupes by provider_msg_id."
    ),
)
async def rebackfill_account(account_id: int, session: Session = SessionDep) -> dict:
    row = session.get(Account, account_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Account not found")
    row.last_sync_state = None
    session.commit()
    new_count, error_count = await ingest_account(account_id)
    return {"new": new_count, "errors": error_count, "rebackfilled": True}


class ImapConnectRequest(BaseModel):
    email_address: str
    host: str
    port: int = 993
    username: str
    password: str
    label: str | None = None


@router.post(
    "/accounts/imap/connect",
    response_model=AccountSummary,
    summary="Connect an IMAP mailbox",
    description=(
        "Saves IMAP credentials. The password lands in the OS keyring "
        "(Windows Credential Manager / macOS Keychain / libsecret). The "
        "username and host live alongside the account row. Suitable for "
        "Outlook, iCloud, Fastmail, mailbox.org, or any local Tutanota / "
        "Proton bridge. Real fetch loop ships in the next iteration."
    ),
)
def connect_imap(body: ImapConnectRequest, session: Session = SessionDep) -> AccountSummary:
    from mailpalace.auth import secrets as secrets_store

    secrets_store.store("imap", body.email_address, body.password)
    existing = session.scalar(select(Account).where(Account.email_address == body.email_address))
    if existing is not None:
        existing.kind = "imap"
        existing.is_active = True
        existing.last_error = None
        existing.config_json = {"host": body.host, "port": body.port, "username": body.username}
        session.commit()
        return _to_summary(existing)
    row = Account(
        kind="imap",
        label=body.label or body.email_address,
        email_address=body.email_address,
        config_json={"host": body.host, "port": body.port, "username": body.username},
        is_active=True,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_summary(row)

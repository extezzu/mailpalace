"""Account management endpoints."""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from mailpalace.auth import gmail_oauth
from mailpalace.db.schema import Account
from mailpalace.pipeline.ingest import ingest_account
from mailpalace.web.deps import SessionDep

logger = logging.getLogger(__name__)
router = APIRouter()


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


@router.post(
    "/accounts/gmail/connect",
    response_model=AccountSummary,
    summary="Run the Gmail OAuth flow and persist the new account",
    description=(
        "Opens the user's browser at the Google consent screen and blocks "
        "until they finish. On success we keep the refresh token in the OS "
        "keyring and write the account row. The frontend should poll this "
        "endpoint with a long timeout (>120s) and refresh the inbox once "
        "it returns."
    ),
)
def connect_gmail(
    background: BackgroundTasks, session: Session = SessionDep
) -> AccountSummary:
    try:
        creds, profile = gmail_oauth.run_install_flow()
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.exception("gmail oauth failed")
        raise HTTPException(status_code=500, detail=f"OAuth failed: {exc}") from exc

    email_address = profile.get("emailAddress")
    if not email_address:
        raise HTTPException(status_code=500, detail="Google did not return a profile email")

    gmail_oauth.store_refresh_token(email_address, creds)

    existing = session.scalar(select(Account).where(Account.email_address == email_address))
    if existing is not None:
        existing.kind = "gmail"
        existing.is_active = True
        existing.last_error = None
        session.commit()
        background.add_task(ingest_account, existing.id)
        return _to_summary(existing)

    row = Account(
        kind="gmail",
        label=email_address,
        email_address=email_address,
        config_json={"history_id": profile.get("historyId")},
        is_active=True,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    background.add_task(ingest_account, row.id)
    return _to_summary(row)


@router.post("/accounts/{account_id}/sync", summary="Force a sync for a connected account")
async def sync_account(account_id: int, session: Session = SessionDep) -> dict:
    row = session.get(Account, account_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Account not found")
    new_count, error_count = await ingest_account(account_id)
    return {"new": new_count, "errors": error_count}


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

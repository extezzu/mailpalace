"""FastAPI app factory."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from mailpalace.config import get_settings
from mailpalace.db.engine import init_db
from mailpalace.logging import configure_logging
from mailpalace.web.routes import (
    accounts,
    draft,
    email,
    email_actions,
    events,
    inbox,
    settings,
)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    init_db()

    # Hydrate any previously-saved remote-LLM API keys from the OS
    # keyring into the in-memory Settings before the LLM router or any
    # triage call needs them. Env vars still take precedence; the
    # keyring is the persistence layer for keys saved through the UI.
    from mailpalace.web.routes.settings import _load_keyring_keys as _hydrate_keys

    _hydrate_keys(get_settings())

    # Periodic ingest: every active mailbox is refetched on a 60s tick so
    # new mail lands without the user clicking sync. The first run for
    # each account uses its existing sync state (incremental history API).
    import asyncio
    import logging as _logging
    from sqlalchemy import select as _select

    from mailpalace.db.engine import session_scope as _session_scope
    from mailpalace.db.schema import Account as _Account
    from mailpalace.pipeline.ingest import ingest_account as _ingest

    _log = _logging.getLogger(__name__)
    _stop = asyncio.Event()

    async def poll_loop() -> None:
        while not _stop.is_set():
            try:
                with _session_scope() as session:
                    ids = list(
                        session.scalars(
                            _select(_Account.id).where(_Account.is_active.is_(True))
                        ).all()
                    )
                for account_id in ids:
                    try:
                        await _ingest(int(account_id))
                    except Exception:
                        _log.exception("scheduled ingest failed for %d", account_id)
            except Exception:
                _log.exception("poll loop iteration crashed")
            try:
                await asyncio.wait_for(_stop.wait(), timeout=60)
            except asyncio.TimeoutError:
                pass

    poll_task = asyncio.create_task(poll_loop())
    try:
        yield
    finally:
        _stop.set()
        try:
            await asyncio.wait_for(poll_task, timeout=5)
        except asyncio.TimeoutError:
            poll_task.cancel()


def create_app() -> FastAPI:
    cfg = get_settings()
    app = FastAPI(
        title="MailPalace",
        version="0.1.0",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    # The Next.js dev server runs on :3000 in development.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            f"http://{cfg.host}:{cfg.port}",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(inbox.router, prefix="/api")
    app.include_router(email.router, prefix="/api")
    app.include_router(email_actions.router, prefix="/api")
    app.include_router(draft.router, prefix="/api")
    app.include_router(settings.router, prefix="/api")
    app.include_router(accounts.router, prefix="/api")
    app.include_router(events.router, prefix="/api")

    @app.get("/api/health")
    async def health() -> dict:
        return {"status": "ok", "version": "0.1.0"}

    # Build/process identifier the dashboard polls so a hot-reload + bundle
    # change reaches the user's browser without a manual refresh.
    import os as _os
    import time as _time

    process_token = f"{_os.getpid()}-{int(_time.time())}"

    @app.get("/api/version")
    async def version() -> dict:
        return {"process_token": process_token}

    return app


app = create_app()

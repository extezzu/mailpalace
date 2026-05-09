"""FastAPI app factory."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from mailpalace.config import get_settings
from mailpalace.db.engine import init_db
from mailpalace.logging import configure_logging
from mailpalace.web.routes import draft, email, events, inbox, settings


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    init_db()
    yield


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
    app.include_router(draft.router, prefix="/api")
    app.include_router(settings.router, prefix="/api")
    app.include_router(events.router, prefix="/api")

    @app.get("/api/health")
    async def health() -> dict:
        return {"status": "ok", "version": "0.1.0"}

    return app


app = create_app()

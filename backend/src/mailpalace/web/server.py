"""Uvicorn server runner."""

from __future__ import annotations

import uvicorn

from mailpalace.config import get_settings


def run_server(
    host: str | None = None,
    port: int | None = None,
    demo_mode: bool = False,
) -> int:
    s = get_settings()
    if demo_mode:
        # Persist demo flag through env for reload workers (if used).
        import os

        os.environ["MAILPALACE_DEMO_MODE"] = "true"
        # Auto-seed on first run if DB empty.
        from mailpalace.db.seed import seed_demo_data

        seed_demo_data()

    uvicorn.run(
        "mailpalace.web.app:app",
        host=host or s.host,
        port=port or s.port,
        log_level="info",
        reload=False,
    )
    return 0

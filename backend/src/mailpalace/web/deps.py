"""FastAPI request-scoped dependencies."""

from __future__ import annotations

from collections.abc import Iterator

from fastapi import Depends
from sqlalchemy.orm import Session

from mailpalace.config import Settings, get_settings as _get_settings
from mailpalace.db.engine import get_session_factory


def get_settings() -> Settings:
    return _get_settings()


def get_session() -> Iterator[Session]:
    factory = get_session_factory()
    session = factory()
    try:
        yield session
    finally:
        session.close()


SettingsDep = Depends(get_settings)
SessionDep = Depends(get_session)

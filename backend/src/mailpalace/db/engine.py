"""SQLAlchemy engine and session factory."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from mailpalace.config import get_settings
from mailpalace.db.schema import Base

_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None


def _enable_wal(dbapi_conn, _connection_record) -> None:
    """SQLite pragmas: WAL for concurrency, foreign_keys for referential integrity."""
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        settings = get_settings()
        settings.db_path.parent.mkdir(parents=True, exist_ok=True)
        _engine = create_engine(
            settings.db_url,
            future=True,
            connect_args={"check_same_thread": False},
        )
        event.listen(_engine, "connect", _enable_wal)
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(bind=get_engine(), expire_on_commit=False)
    return _SessionLocal


@contextmanager
def session_scope() -> Iterator[Session]:
    """Context-managed session; commits on exit, rolls back on exception."""
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def init_db() -> None:
    """Create all tables. v0 uses metadata.create_all; Alembic added in v0.1."""
    Base.metadata.create_all(bind=get_engine())

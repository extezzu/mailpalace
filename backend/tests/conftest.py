"""Pytest fixtures."""

from __future__ import annotations

import gc
import tempfile
from pathlib import Path
from typing import Iterator

import pytest


@pytest.fixture(autouse=True)
def isolated_data_dir(monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    """Each test gets a fresh ~/.mailpalace/ tempdir.

    Windows holds SQLite file handles via SQLAlchemy's connection pool, so we
    must dispose the engine before the tempdir cleanup runs.
    """
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp)
        monkeypatch.setenv("MAILPALACE_DATA_DIR", str(path))

        from mailpalace import config
        from mailpalace.db import engine

        config._settings = None
        engine._engine = None
        engine._SessionLocal = None

        try:
            yield path
        finally:
            if engine._engine is not None:
                engine._engine.dispose()
            engine._engine = None
            engine._SessionLocal = None
            config._settings = None
            gc.collect()

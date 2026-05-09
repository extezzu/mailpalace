"""Schema bootstrap.

v0 uses ``Base.metadata.create_all`` to create the schema in one shot.
Alembic migrations land in v0.1 once the schema is no longer changing under
us; until then a single ``mailpalace migrate`` is enough to bring a fresh
``~/.mailpalace/mail.db`` up to date.
"""

from __future__ import annotations

import logging

from mailpalace.db.engine import init_db

logger = logging.getLogger(__name__)


def run_migrations() -> int:
    init_db()
    logger.info("schema initialized")
    return 0

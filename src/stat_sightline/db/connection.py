"""SQLAlchemy engine factory shared across ETL, features, and dashboard."""
from __future__ import annotations

from functools import lru_cache

from sqlalchemy import Engine, create_engine

from config.settings import database_url


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """Return a process-wide pooled engine. Cached so we open one pool."""
    return create_engine(database_url(), pool_pre_ping=True, future=True)

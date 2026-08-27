"""SQLAlchemy engine factory shared across ETL, features, and dashboard."""
from __future__ import annotations

from functools import lru_cache

from sqlalchemy import Engine, create_engine

from config.settings import database_url


@lru_cache(maxsize=2)
def get_engine(direct: bool = False) -> Engine:
    """Return a process-wide pooled engine. Cached so we open one pool.

    `direct=True` bypasses the provider's connection pooler — see
    `config.settings.database_url`. Used by the schema and ETL scripts only.
    """
    return create_engine(database_url(direct), pool_pre_ping=True, future=True)

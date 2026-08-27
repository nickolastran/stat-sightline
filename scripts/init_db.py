"""Apply the Phase 1 SQL schema to the configured PostgreSQL database.

Usage:
    python scripts/init_db.py
"""
from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import text

# allow running as a plain script: add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.stat_sightline.db.connection import get_engine  # noqa: E402

SCHEMA_FILE = Path(__file__).resolve().parents[1] / "sql" / "01_schema.sql"


def main() -> None:
    sql = SCHEMA_FILE.read_text()
    engine = get_engine(direct=True)  # DDL must not go through a pooler
    with engine.begin() as conn:
        conn.execute(text(sql))
    print(f"Applied schema from {SCHEMA_FILE.name} to {engine.url.database!r}.")


if __name__ == "__main__":
    main()

"""Central configuration. Reads from environment / .env file."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()  # picks up .env at project root if present

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def database_url() -> str:
    """SQLAlchemy URL, either explicit DATABASE_URL or built from PG* vars."""
    explicit = os.getenv("DATABASE_URL")
    if explicit:
        return explicit
    user = os.getenv("PGUSER", "stat_sightline")
    pwd = os.getenv("PGPASSWORD", "")
    host = os.getenv("PGHOST", "localhost")
    port = os.getenv("PGPORT", "5432")
    db = os.getenv("PGDATABASE", "stat_sightline")
    return f"postgresql+psycopg2://{user}:{pwd}@{host}:{port}/{db}"


STATCAST_CACHE_DIR = PROJECT_ROOT / os.getenv("STATCAST_CACHE_DIR", "data/raw")
ETL_CHUNK_DAYS = int(os.getenv("ETL_CHUNK_DAYS", "3"))

# Game results + trained model behind the standings projection. Separate from
# the Statcast cache because this pipeline is DB-free: it reads the MLB Stats
# API and writes flat files.
STANDINGS_DIR = PROJECT_ROOT / os.getenv("STANDINGS_DATA_DIR", "data/standings")

"""Stat Sightline ETL: fetch -> clean -> load Statcast pitch data.

Examples:
    # Default: full 2024 regular season, out-of-the-box
    python scripts/run_etl.py

    # Custom range
    python scripts/run_etl.py --start 2023-04-01 --end 2023-04-30

    # Fetch + cache only, skip the database load
    python scripts/run_etl.py --skip-load

    # Force re-download (ignore parquet cache)
    python scripts/run_etl.py --no-cache
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Defaults: 2024 regular season (Seoul opener -> regular-season finale).
DEFAULT_START = "2024-03-20"
DEFAULT_END = "2024-09-30"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Ingest Statcast data into PostgreSQL.")
    p.add_argument("--start", default=DEFAULT_START, help="start date YYYY-MM-DD (inclusive)")
    p.add_argument("--end", default=DEFAULT_END, help="end date YYYY-MM-DD (inclusive)")
    p.add_argument("--chunk-days", type=int, default=None, help="override ETL_CHUNK_DAYS")
    p.add_argument("--no-cache", action="store_true", help="ignore cached parquet windows")
    p.add_argument("--skip-load", action="store_true", help="fetch + cache only, no DB write")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    from src.stat_sightline.etl.ingest_statcast import fetch_statcast

    print(f"Fetching Statcast {args.start} -> {args.end} ...")
    raw = fetch_statcast(
        args.start,
        args.end,
        chunk_days=args.chunk_days,
        use_cache=not args.no_cache,
    )
    print(f"  fetched {len(raw):,} raw pitches.")

    if args.skip_load:
        print("  --skip-load set; cached parquet only, nothing written to the DB.")
        return 0

    if raw.empty:
        print("  no rows fetched; nothing to load.")
        return 0

    from src.stat_sightline.db.connection import get_engine
    from src.stat_sightline.etl.load import load_all

    counts = load_all(get_engine(), raw)
    print(
        "Loaded -> "
        f"players: {counts['players']:,} | "
        f"games: {counts['games']:,} | "
        f"pitches: {counts['pitches']:,}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Fetch raw Statcast data via pybaseball, with on-disk parquet caching.

We pull in N-day windows (ETL_CHUNK_DAYS) and cache each window so that
re-running an interrupted long pull is cheap and we stay friendly to the
Baseball Savant servers. pybaseball is imported lazily so the rest of the
package (and the offline tests) don't require it.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd

from config.settings import ETL_CHUNK_DAYS, STATCAST_CACHE_DIR


def _parse(d: str | date) -> date:
    if isinstance(d, date):
        return d
    return datetime.strptime(d, "%Y-%m-%d").date()


def _date_windows(start: date, end: date, chunk_days: int):
    """Yield (window_start, window_end) inclusive tuples covering [start, end]."""
    cur = start
    step = timedelta(days=chunk_days - 1)
    while cur <= end:
        win_end = min(cur + step, end)
        yield cur, win_end
        cur = win_end + timedelta(days=1)


def fetch_statcast(
    start: str | date,
    end: str | date,
    *,
    chunk_days: int | None = None,
    cache_dir: str | Path | None = None,
    use_cache: bool = True,
) -> pd.DataFrame:
    """Return raw Statcast pitches for [start, end] (inclusive).

    Windows are cached as parquet under cache_dir; an empty window (e.g. an
    off day) is still cached as an empty frame so we don't re-request it.
    """
    start_d, end_d = _parse(start), _parse(end)
    if end_d < start_d:
        raise ValueError(f"end ({end_d}) precedes start ({start_d})")

    chunk_days = chunk_days or ETL_CHUNK_DAYS
    cache_path = Path(cache_dir or STATCAST_CACHE_DIR)
    cache_path.mkdir(parents=True, exist_ok=True)

    # Imported here so importing this module never hard-requires pybaseball.
    from pybaseball import statcast  # type: ignore
    from tqdm import tqdm

    frames: list[pd.DataFrame] = []
    windows = list(_date_windows(start_d, end_d, chunk_days))
    for win_start, win_end in tqdm(windows, desc="Statcast windows", unit="win"):
        cache_file = cache_path / f"statcast_{win_start}_{win_end}.parquet"
        if use_cache and cache_file.exists():
            frames.append(pd.read_parquet(cache_file))
            continue

        chunk = statcast(
            start_dt=win_start.isoformat(),
            end_dt=win_end.isoformat(),
            verbose=False,
        )
        if chunk is None:
            chunk = pd.DataFrame()
        chunk.to_parquet(cache_file, index=False)
        frames.append(chunk)

    if not frames:
        return pd.DataFrame()
    combined = pd.concat(frames, ignore_index=True)
    return combined

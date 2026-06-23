"""Idempotent loaders: stage a DataFrame, then UPSERT into the warehouse.

Load order respects foreign keys: players + games first, then pitches.
All upserts key on the natural unique constraint so re-running a date range
never duplicates rows (it refreshes them).
"""
from __future__ import annotations

import pandas as pd
from sqlalchemy import Engine, text
from sqlalchemy.types import BigInteger, Date, Float, Text

from src.stat_sightline.etl import clean

SCHEMA = "savant"


def _sqla_dtypes(columns: list[str]) -> dict:
    """Map column names to SQLAlchemy staging types from clean.py's inventory."""
    out: dict = {}
    for col in columns:
        if col in clean.INT_COLS:
            out[col] = BigInteger()
        elif col in clean.FLOAT_COLS:
            out[col] = Float()
        elif col in clean.DATE_COLS:
            out[col] = Date()
        else:
            out[col] = Text()
    return out


def _stage(conn, df: pd.DataFrame, name: str, columns: list[str]) -> None:
    """Write df[columns] to a fresh staging table on the given connection."""
    df.reindex(columns=columns).to_sql(
        f"stg_{name}",
        conn,
        schema=SCHEMA,
        if_exists="replace",
        index=False,
        dtype=_sqla_dtypes(columns),
        method="multi",
        chunksize=5000,
    )


# ---------------------------------------------------------------------
# Best-effort name enrichment (network, optional)
# ---------------------------------------------------------------------

def enrich_player_names(players: pd.DataFrame) -> pd.DataFrame:
    """Fill missing full_name (mostly batters) via Chadwick reverse lookup.

    Best-effort: any failure (offline, pybaseball missing) leaves names as-is.
    """
    needs = players["full_name"].isna()
    if not needs.any():
        return players
    ids = players.loc[needs, "player_id"].dropna().astype(int).tolist()
    if not ids:
        return players
    try:
        from pybaseball import playerid_reverse_lookup  # type: ignore

        lk = playerid_reverse_lookup(ids, key_type="mlbam")
        if lk is not None and not lk.empty:
            lk = lk.assign(
                full_name=(lk["name_last"].str.title() + ", " + lk["name_first"].str.title())
            )[["key_mlbam", "full_name"]]
            name_by_id = dict(zip(lk["key_mlbam"], lk["full_name"]))
            players.loc[needs, "full_name"] = (
                players.loc[needs, "player_id"].map(name_by_id).astype("string")
            )
    except Exception as exc:  # noqa: BLE001 — enrichment is optional
        print(f"  [warn] name enrichment skipped: {exc}")
    return players


# ---------------------------------------------------------------------
# Upserts
# ---------------------------------------------------------------------

def upsert_players(engine: Engine, players: pd.DataFrame) -> int:
    cols = clean.PLAYER_COLUMNS
    with engine.begin() as conn:
        _stage(conn, players, "players", cols)
        result = conn.execute(text(f"""
            INSERT INTO {SCHEMA}.players (player_id, full_name, bats, throws)
            SELECT player_id, full_name, bats, throws FROM {SCHEMA}.stg_players
            ON CONFLICT (player_id) DO UPDATE SET
                full_name = COALESCE(EXCLUDED.full_name, players.full_name),
                bats      = COALESCE(EXCLUDED.bats,      players.bats),
                throws    = COALESCE(EXCLUDED.throws,    players.throws),
                updated_at = now()
        """))
        conn.execute(text(f"DROP TABLE IF EXISTS {SCHEMA}.stg_players"))
    return result.rowcount


def upsert_games(engine: Engine, games: pd.DataFrame) -> int:
    cols = clean.GAME_COLUMNS
    collist = ", ".join(cols)
    with engine.begin() as conn:
        _stage(conn, games, "games", cols)
        result = conn.execute(text(f"""
            INSERT INTO {SCHEMA}.games ({collist})
            SELECT {collist} FROM {SCHEMA}.stg_games
            ON CONFLICT (game_pk) DO NOTHING
        """))
        conn.execute(text(f"DROP TABLE IF EXISTS {SCHEMA}.stg_games"))
    return result.rowcount


def upsert_pitches(engine: Engine, pitches: pd.DataFrame) -> int:
    cols = clean.PITCH_COLUMNS
    collist = ", ".join(cols)
    updates = ", ".join(
        f"{c} = EXCLUDED.{c}" for c in cols if c not in clean.GRAIN_KEYS
    )
    with engine.begin() as conn:
        _stage(conn, pitches, "pitches", cols)
        result = conn.execute(text(f"""
            INSERT INTO {SCHEMA}.pitches ({collist})
            SELECT {collist} FROM {SCHEMA}.stg_pitches
            ON CONFLICT (game_pk, at_bat_number, pitch_number) DO UPDATE SET
                {updates},
                ingested_at = now()
        """))
        conn.execute(text(f"DROP TABLE IF EXISTS {SCHEMA}.stg_pitches"))
    return result.rowcount


def load_all(engine: Engine, raw: pd.DataFrame) -> dict[str, int]:
    """Full clean -> build dimensions -> load, returning row counts."""
    pitches = clean.clean_statcast(raw)
    games = clean.build_games(raw)
    players = enrich_player_names(clean.build_players(raw))

    # FK order: dimensions before the fact table.
    n_players = upsert_players(engine, players)
    n_games = upsert_games(engine, games)
    n_pitches = upsert_pitches(engine, pitches)
    return {"players": n_players, "games": n_games, "pitches": n_pitches}

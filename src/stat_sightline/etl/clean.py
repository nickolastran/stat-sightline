"""Clean raw pybaseball Statcast output and shape it for the warehouse.

This module is pure (no network, no DB) so it can be unit-tested offline.
It is the single source of truth for which columns land in each table and
what type each column is — `load.py` reads these constants to build the
staging tables.
"""
from __future__ import annotations

import pandas as pd

# ---------------------------------------------------------------------
# Column inventory — must mirror sql/01_schema.sql
# ---------------------------------------------------------------------

# Integer-valued columns (nullable). Stored as pandas "Int64" so missing
# values survive as <NA> and reach Postgres as NULL rather than 3.0-style
# floats that a SMALLINT column would reject.
INT_COLS = {
    "game_pk", "at_bat_number", "pitch_number", "batter", "pitcher",
    "inning", "balls", "strikes", "outs_when_up",
    "on_1b", "on_2b", "on_3b", "home_score", "away_score",
    "post_home_score", "post_away_score",
    "zone", "launch_speed_angle",
    # dimensions
    "player_id", "game_year",
}

FLOAT_COLS = {
    "release_speed", "effective_speed", "release_spin_rate", "spin_axis",
    "release_extension", "release_pos_x", "release_pos_y", "release_pos_z",
    "pfx_x", "pfx_z", "plate_x", "plate_z",
    "vx0", "vy0", "vz0", "ax", "ay", "az", "sz_top", "sz_bot",
    "launch_speed", "launch_angle", "hit_distance_sc", "hc_x", "hc_y",
    "bat_speed", "swing_length",
    "estimated_ba_using_speedangle", "estimated_woba_using_speedangle",
    "woba_value", "woba_denom", "babip_value", "iso_value",
    "delta_run_exp", "delta_home_win_exp",
}

TEXT_COLS = {
    "stand", "p_throws", "inning_topbot", "pitch_type", "pitch_name",
    "description", "type", "events", "des", "bb_type",
    # dimensions
    "full_name", "bats", "throws", "home_team", "away_team", "game_type",
}

DATE_COLS = {"game_date"}

# Ordered column list for the `pitches` fact table (excludes serial PK and
# the ingested_at default).
PITCH_COLUMNS = [
    # grain / identity
    "game_pk", "at_bat_number", "pitch_number", "game_date",
    # participants
    "batter", "pitcher", "stand", "p_throws",
    # game state
    "inning", "inning_topbot", "balls", "strikes", "outs_when_up",
    "on_1b", "on_2b", "on_3b", "home_score", "away_score",
    # score after the play — the only source of a final score and of RBI
    # (runs the play drove in = post_bat_score - bat_score)
    "post_home_score", "post_away_score",
    # classification & result
    "pitch_type", "pitch_name", "description", "type", "events", "des", "zone",
    # pitch physics
    "release_speed", "effective_speed", "release_spin_rate", "spin_axis",
    "release_extension", "release_pos_x", "release_pos_y", "release_pos_z",
    "pfx_x", "pfx_z", "plate_x", "plate_z",
    "vx0", "vy0", "vz0", "ax", "ay", "az", "sz_top", "sz_bot",
    # batted ball
    "launch_speed", "launch_angle", "launch_speed_angle", "hit_distance_sc",
    "hc_x", "hc_y", "bb_type",
    # bat tracking (2023+)
    "bat_speed", "swing_length",
    # expected / run value
    "estimated_ba_using_speedangle", "estimated_woba_using_speedangle",
    "woba_value", "woba_denom", "babip_value", "iso_value",
    "delta_run_exp", "delta_home_win_exp",
]

GAME_COLUMNS = ["game_pk", "game_date", "game_year", "game_type",
                "home_team", "away_team"]

PLAYER_COLUMNS = ["player_id", "full_name", "bats", "throws"]

GRAIN_KEYS = ["game_pk", "at_bat_number", "pitch_number"]


# ---------------------------------------------------------------------
# Type coercion helpers
# ---------------------------------------------------------------------

def _coerce_types(df: pd.DataFrame) -> pd.DataFrame:
    """Coerce each known column to its target pandas dtype, in place-ish."""
    for col in df.columns:
        if col in INT_COLS:
            df[col] = pd.to_numeric(df[col], errors="coerce").astype("Int64")
        elif col in FLOAT_COLS:
            df[col] = pd.to_numeric(df[col], errors="coerce").astype("float64")
        elif col in DATE_COLS:
            df[col] = pd.to_datetime(df[col], errors="coerce").dt.date
        elif col in TEXT_COLS:
            df[col] = (
                df[col]
                .astype("string")
                .str.strip()
                .replace({"": pd.NA, "null": pd.NA, "None": pd.NA})
            )
    return df


# ---------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------

def clean_statcast(df: pd.DataFrame) -> pd.DataFrame:
    """Return a tidy pitch-level frame with exactly PITCH_COLUMNS.

    Steps:
      * reindex to the canonical column set (missing source columns -> <NA>,
        so pre-2023 pulls without bat tracking still load cleanly);
      * coerce dtypes;
      * drop rows missing any grain key (can't be uniquely identified);
      * de-duplicate on the grain, keeping the last occurrence.
    """
    if df.empty:
        return pd.DataFrame(columns=PITCH_COLUMNS)

    out = df.reindex(columns=PITCH_COLUMNS)
    out = _coerce_types(out)

    out = out.dropna(subset=GRAIN_KEYS)
    out = out.drop_duplicates(subset=GRAIN_KEYS, keep="last").reset_index(drop=True)
    return out


def build_games(df: pd.DataFrame) -> pd.DataFrame:
    """One row per game for the `games` dimension."""
    if df.empty:
        return pd.DataFrame(columns=GAME_COLUMNS)

    games = df.reindex(columns=GAME_COLUMNS)
    # backfill game_year from game_date when the source omits it
    games = _coerce_types(games)
    missing_year = games["game_year"].isna()
    if missing_year.any():
        years = pd.to_datetime(df["game_date"], errors="coerce").dt.year
        games.loc[missing_year, "game_year"] = years[missing_year].astype("Int64")
    games = games.dropna(subset=["game_pk"]).drop_duplicates("game_pk")
    return games.reset_index(drop=True)


def build_players(df: pd.DataFrame) -> pd.DataFrame:
    """Derive the `players` dimension from observed pitches.

    * pitchers -> throws (p_throws) and name (Statcast's player_name field
      is the pitcher, formatted "Last, First");
    * batters  -> bats, inferred as 'S' when both L and R stances are seen
      for the same batter, otherwise the single observed stance.
    Batter names are left null here and enriched best-effort in load.py.
    """
    if df.empty:
        return pd.DataFrame(columns=PLAYER_COLUMNS)

    pit = (
        df.loc[df["pitcher"].notna(), ["pitcher", "p_throws", "player_name"]]
        .groupby("pitcher", as_index=False)
        .agg(throws=("p_throws", "first"), full_name=("player_name", "first"))
        .rename(columns={"pitcher": "player_id"})
    )

    def _bats(stances: pd.Series) -> str | None:
        seen = set(stances.dropna().unique())
        if len(seen) > 1:
            return "S"
        return next(iter(seen)) if seen else None

    bat = (
        df.loc[df["batter"].notna(), ["batter", "stand"]]
        .groupby("batter")["stand"]
        .apply(_bats)
        .reset_index()
    )
    bat.columns = ["player_id", "bats"]

    players = pd.merge(pit, bat, on="player_id", how="outer")
    players = players.reindex(columns=PLAYER_COLUMNS)
    players["player_id"] = pd.to_numeric(players["player_id"], errors="coerce").astype("Int64")
    players = _coerce_types(players)
    return players.dropna(subset=["player_id"]).reset_index(drop=True)

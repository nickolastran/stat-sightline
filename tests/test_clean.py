"""Offline tests for the cleaning/shaping logic (no network, no DB)."""
from __future__ import annotations

import pandas as pd

from src.stat_sightline.etl import clean


def _raw_frame() -> pd.DataFrame:
    """A tiny synthetic Statcast-like frame covering the tricky cases."""
    return pd.DataFrame(
        {
            "game_pk": [777, 777, 777, 777],
            "at_bat_number": [1, 1, 2, 2],
            "pitch_number": [1, 2, 1, 1],          # last two share a grain -> dup
            "game_date": ["2024-04-01"] * 4,
            "game_year": [2024, 2024, None, None],  # missing -> backfilled
            "game_type": ["R"] * 4,
            "home_team": ["NYY"] * 4,
            "away_team": ["BOS"] * 4,
            "batter": [101, 101, 202, 202],         # 101 switch-hits, 202 R
            "pitcher": [9, 9, 9, 9],
            "stand": ["L", "R", "R", "R"],
            "p_throws": ["R", "R", "R", "R"],
            "player_name": ["Doe, John"] * 4,
            "release_speed": ["95.1", "94.0", "88.2", "88.2"],  # strings -> float
            "launch_speed": [None, 102.3, None, None],
            "zone": [5, 11, 1, 1],
        }
    )


def test_clean_dedupes_on_grain_and_coerces_types():
    out = clean.clean_statcast(_raw_frame())
    # 4 rows in, one duplicate grain -> 3 out
    assert len(out) == 3
    assert list(out.columns) == clean.PITCH_COLUMNS
    assert str(out["release_speed"].dtype) == "float64"
    assert str(out["game_pk"].dtype) == "Int64"
    # bat-tracking columns absent in source are present and null
    assert out["bat_speed"].isna().all()


def test_build_players_infers_switch_hitter():
    players = clean.build_players(_raw_frame())
    by_id = players.set_index("player_id")
    assert by_id.loc[101, "bats"] == "S"   # saw both L and R
    assert by_id.loc[202, "bats"] == "R"
    assert by_id.loc[9, "throws"] == "R"
    assert by_id.loc[9, "full_name"] == "Doe, John"


def test_build_games_backfills_year_and_dedupes():
    games = clean.build_games(_raw_frame())
    assert len(games) == 1
    assert int(games.iloc[0]["game_year"]) == 2024

"""Offline tests for the standings projection (no network, no DB, no model file).

The leakage check is the important one: if a game's features could see its own
result, the chronological holdout in train.py would report a score the live
projection can never reproduce.
"""
from __future__ import annotations

import pandas as pd
import pytest

from src.stat_sightline.standings import features, ingest, project


def _games(n: int = 40) -> pd.DataFrame:
    """A two-team season: home team wins every game 5-3, one game a day."""
    dates = pd.date_range("2026-04-01", periods=n).strftime("%Y-%m-%d")
    return pd.DataFrame({
        "game_pk": range(1, n + 1),
        "date": dates,
        "season": 2026,
        "home_id": [111] * n,
        "home": ["Alpha"] * n,
        "away_id": [222] * n,
        "away": ["Beta"] * n,
        "home_score": [5] * n,
        "away_score": [3] * n,
        "home_sp": ["Ace Alpha"] * n,
        "away_sp": ["Ace Beta"] * n,
    })


def test_features_ignore_the_future():
    """Truncating the schedule must not change the features of earlier games."""
    full = features.build_features(_games(40))
    partial = features.build_features(_games(30))
    shared = partial["game_pk"]
    left = full[full["game_pk"].isin(shared)].set_index("game_pk")[features.FEATURES]
    right = partial.set_index("game_pk")[features.FEATURES]
    pd.testing.assert_frame_equal(left, right)


def test_rolling_stats_exclude_the_current_game():
    df = features.build_features(_games(40))
    first = df.iloc[0]
    # Every game is 5-3, so a window over strictly-earlier games reads exactly
    # 5.0 scored / 3.0 allowed for the home side — no partial credit from itself.
    assert first["home_off"] == 5.0
    assert first["home_def"] == 3.0
    assert first["home_wpct"] == 1.0     # home team has won all of them
    assert first["away_wpct"] == 0.0
    assert first["home_rest"] == 1.0     # a game a day


def test_build_features_is_one_row_per_game():
    df = features.build_features(_games(40))
    assert not df["game_pk"].duplicated().any()


def test_duplicate_game_pk_is_rejected_not_fanned_out():
    doubled = pd.concat([_games(40), _games(40).tail(1)])
    with pytest.raises(ValueError, match="duplicate game_pk"):
        features.build_features(doubled)


def test_min_periods_drops_the_early_games():
    # A window needs MIN_PERIODS earlier games, and shift(1) costs one more.
    df = features.build_features(_games(40))
    assert len(df) == 40 - features.MIN_PERIODS


def test_latest_form_includes_the_most_recent_game():
    form = features.latest_form(_games(40))
    assert set(form.index) == {111, 222}
    assert form.loc[111, "wpct"] == 1.0
    assert form.loc[111, "date"] == pd.Timestamp("2026-05-10")  # 40th day


def test_matchup_features_measure_rest_from_the_last_game():
    form = features.latest_form(_games(40))
    row = features.matchup_features(form, 111, 222, "2026-05-13")
    assert row["home_rest"] == 3
    assert pd.isna(row["home_sp_rest"])  # probables unknown this far ahead


def test_record_played_counts_both_sides():
    teams, as_of = project.record_played(2026, _games(10))
    assert teams[111]["wins"] == 10 and teams[111]["losses"] == 0
    assert teams[222]["wins"] == 0 and teams[222]["losses"] == 10
    assert teams[222]["games_played"] == 10
    assert as_of == "2026-04-10"


def _status(abstract: str, detailed: str) -> dict:
    return {"status": {"abstractGameState": abstract, "detailedState": detailed}}


def test_postponed_slots_are_neither_results_nor_remaining():
    """MLB marks a postponed slot Final once its makeup is played, and the
    makeup carries the same game_pk — so counting it either way double-counts."""
    postponed = _status("Final", "Postponed")
    assert ingest.is_final(postponed) is False
    assert project.is_remaining(postponed) is False


def test_played_and_upcoming_games_are_classified():
    assert ingest.is_final(_status("Final", "Final")) is True
    assert ingest.is_final(_status("Final", "Completed Early")) is True   # rain-shortened
    assert ingest.is_final(_status("Live", "In Progress")) is False
    assert project.is_remaining(_status("Final", "Final")) is False
    assert project.is_remaining(_status("Preview", "Scheduled")) is True
    assert project.is_remaining(_status("Live", "In Progress")) is True


def test_suspended_game_is_kept_once_at_its_resumption_date():
    """One game_pk listed under both the original and resumption dates is one
    game, dated when the result was decided — not two wins."""
    rows = [
        {"game_pk": 632192, "date": "2021-04-11", "home_score": 6},
        {"game_pk": 632192, "date": "2021-08-31", "home_score": 6},
        {"game_pk": 632966, "date": "2021-08-10", "home_score": 8},
    ]
    out = ingest.dedupe(rows)
    assert [(r["game_pk"], r["date"]) for r in out] == [
        (632966, "2021-08-10"),
        (632192, "2021-08-31"),
    ]

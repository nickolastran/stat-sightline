"""Offline tests for the pitcher typeahead (no DB, no network).

The search runs over the roster `run._roster` caches for /ask, so these build
that roster from rows shaped like its query and check the matching and order
the endpoint returned when it was a SQL `ILIKE` over the stored name.
"""

from __future__ import annotations

from src.stat_sightline.query import run as R


def _roster() -> list[dict]:
    return R._index([
        {"player_id": 1, "full_name": "Skenes, Paul", "throws": "R", "bat_n": 0, "pit_n": 2500},
        {"player_id": 2, "full_name": "Martinez, Nick", "throws": "R", "bat_n": 0, "pit_n": 1800},
        {"player_id": 3, "full_name": "Pérez, Martín", "throws": "L", "bat_n": 0, "pit_n": 900},
        {"player_id": 4, "full_name": "O'Brien, Riley", "throws": "R", "bat_n": 0, "pit_n": 400},
        # A hitter who has never pitched is not a pitcher, whatever his name.
        {"player_id": 5, "full_name": "Martin, Richie", "throws": "R", "bat_n": 3000, "pit_n": 0},
    ])


def _ids(q: str, limit: int = 25) -> list[int]:
    return [r["player_id"] for r in R.search_pitchers(q, limit, roster=_roster())]


def test_empty_query_is_every_pitcher_by_workload():
    assert _ids("") == [1, 2, 3, 4]


def test_matches_the_stored_name_case_insensitively():
    assert _ids("SKENES") == [1]
    assert _ids("skenes, p") == [1]
    assert _ids("o'b") == [4]
    assert _ids("zzz") == []


def test_accents_and_first_last_order_match_too():
    assert _ids("martin") == [2, 3], "accent-folded, and the non-pitcher is left out"
    assert _ids("martín") == [2, 3], "the typed accent folds the same way"
    assert _ids("paul skenes") == [1]


def test_limit_keeps_the_heaviest_workloads():
    assert _ids("", limit=2) == [1, 2]

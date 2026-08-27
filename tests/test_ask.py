"""Offline tests for the natural-language query layer (no DB, no network).

Only the pure half is exercised here: parse.py in full, plus the formatting
helpers run.py keeps out of SQL. The SQL itself is covered by hitting the
endpoint against a loaded warehouse.
"""
from __future__ import annotations

from datetime import date

import pytest

from src.stat_sightline.query import parse as P
from src.stat_sightline.query import run as R


def test_parse_demo_suite():
    """The phrasings the parser ships against, asserted in one place."""
    P.demo()


def test_stadium_beats_team_for_location():
    a = P.parse("how many home runs did ohtani hit in dodger stadium this year")
    assert (a.stat, a.venue, a.opponent, a.subjects) == ("home_run", "LAD", None, ["ohtani"])


def test_at_a_club_is_their_park_vs_a_club_is_the_opponent():
    assert P.parse("judge hr at the giants").venue == "SF"
    assert P.parse("judge hr vs the giants").opponent == "SF"


def test_role_cue_overrides_the_default():
    a = P.parse("home runs allowed by tarik skubal")
    assert a.role == "pitcher" and a.stat == "home_run"
    assert P.parse("skubal strikeouts").role is None  # inferred from workload


def test_time_windows():
    # Relative windows stay symbolic here — run.py anchors them to the newest
    # game on record, so a 2024 warehouse doesn't answer "last 30 days" empty.
    a = P.parse("soto rbi last 30 days", today=date(2026, 7, 31))
    assert a.last_days == 30 and a.date_from is None and a.stat == "rbi"
    assert P.parse("soto doubles in june 2024").month == 6
    assert P.parse("soto hits in 2023").season == 2023
    assert P.parse("soto hits").all_seasons is False


def test_unsupported_stats_are_named_not_guessed():
    for q in ("betts stolen bases", "skubal era", "judge runs scored"):
        assert P.STATS[P.parse(q).stat]["unsupported"]


def test_missing_stat_falls_back_and_says_so():
    a = P.parse("aaron judge")
    assert a.stat == "home_run" and a.notes


def test_name_folding_and_display():
    assert R.display_name("Maldonado, Martín") == "Martín Maldonado"
    assert R._fold("Martín Maldonado") == "martin maldonado"
    assert R.display_name(None) == "Unknown"


@pytest.mark.parametrize(
    "stat,expected",
    [("home_run", "1,234"), ("batting_average", ".311")],
)
def test_headline_formatting(stat, expected):
    total, denom = (1234, 1) if stat == "home_run" else (311, 1000)
    assert R._fmt(stat, total, denom)[1] == expected


def test_batting_average_denominator_excludes_walks():
    num, den = R._value_exprs("batting_average")
    assert ":non_ab" in den and ":events" in num
    assert "walk" in R.NON_AB_EVENTS and "hit_by_pitch" in R.NON_AB_EVENTS


def test_ordinals():
    assert [R._ordinal(n) for n in (1, 2, 3, 4, 11, 12, 13, 21)] == [
        "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st"
    ]

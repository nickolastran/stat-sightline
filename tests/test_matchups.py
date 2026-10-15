"""Offline tests for the matchup rates (no DB, no network).

The SQL only counts; summarize() turns the counts into the card's rates, so
that is the half checked here.
"""

from __future__ import annotations

from api.routers.matchups import summarize


def _totals(**kw) -> dict:
    base = dict(batter=1, pitches=20, pa=5, swings=10, whiffs=3, bbe=4,
                ev_sum=380.0, hard_hits=2, xwoba_num=1.6, xwoba_den=5)
    return base | kw


def test_rates_from_counts():
    [m] = summarize([_totals()], [])
    assert (m.whiff_pct, m.avg_ev, m.hard_hit_pct, m.xwoba) == (30.0, 95.0, 50.0, 0.32)


def test_no_denominator_is_none_not_zero():
    [m] = summarize([_totals(swings=0, whiffs=0, bbe=0, ev_sum=0, hard_hits=0, xwoba_den=0)], [])
    assert (m.whiff_pct, m.avg_ev, m.hard_hit_pct, m.xwoba) == (None, None, None, None)


def test_mix_is_top_three_of_this_batters_pitches():
    mix = [
        {"batter": 1, "pitch_type": "CH", "n": 2},
        {"batter": 1, "pitch_type": "FF", "n": 10},
        {"batter": 1, "pitch_type": "SL", "n": 5},
        {"batter": 1, "pitch_type": "CU", "n": 3},
        {"batter": 2, "pitch_type": "SI", "n": 99},  # someone else's
    ]
    [m] = summarize([_totals()], mix)
    assert [(p.pitch_type, p.pct) for p in m.mix] == [("FF", 50.0), ("SL", 25.0), ("CU", 15.0)]

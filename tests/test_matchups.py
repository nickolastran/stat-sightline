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


def test_savant_rows_count_like_the_sql():
    """The snapshot's Python tally must hand summarize() what the SQL would."""
    from scripts.snapshot_matchups import tally

    def row(desc, events="", ev="", den="", xw="", wv="", pt="FF"):
        return dict(batter="7", description=desc, events=events, launch_speed=ev,
                    woba_denom=den, estimated_woba_using_speedangle=xw,
                    woba_value=wv, pitch_type=pt)

    totals, mix = tally([
        row("swinging_strike"),
        row("foul_tip", pt="SL"),
        row("hit_into_play", "single", ev="101.0", den="1", xw="0.700"),
        row("hit_into_play", "field_out", den="1", wv="0"),  # no EV tracked
        row("ball", "walk", den="1", wv="0.69", pt=""),
    ])
    assert totals == [dict(batter=7, pitches=5, pa=3, swings=4, whiffs=2, bbe=1,
                           ev_sum=101.0, hard_hits=1, xwoba_num=1.39, xwoba_den=3)]
    assert sorted((m["pitch_type"], m["n"]) for m in mix) == [("FF", 3), ("SL", 1)]

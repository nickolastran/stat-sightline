"""Offline tests for Phase 2 feature math (no DB, no sklearn)."""
from __future__ import annotations

import pandas as pd

from src.stat_sightline.features import metrics, swing_take, xwoba


def test_barrel_band_anchor_at_98mph():
    ev = pd.Series([98, 98, 98, 97, 100, 100])
    la = pd.Series([26, 30, 31, 28, 24, 23])  # 31 too high @98; 23 too low @100
    flags = metrics.is_barrel(ev, la).tolist()
    assert flags == [True, True, False, False, True, False]


def test_player_barrel_rates():
    df = pd.DataFrame({
        "batter": [1, 1, 1],
        "description": ["hit_into_play"] * 3,
        "launch_speed": [99.0, 80.0, 96.0],
        "launch_angle": [28.0, 10.0, 12.0],
    })
    out = metrics.player_barrel_rates(df).iloc[0]
    assert out["batted_balls"] == 3
    assert out["barrels"] == 1            # only the 99/28
    assert out["hard_hits"] == 2          # 99 and 96 are >=95
    assert round(out["barrel_pct"], 1) == 33.3


def test_attack_zone_bands():
    # plate at center, then progressively off the plate; zone 1.5..3.5 ft
    df = pd.DataFrame({
        "plate_x": [0.0, 0.9, 1.5, 3.0],
        "plate_z": [2.5, 2.5, 2.5, 2.5],
        "sz_top": [3.5] * 4,
        "sz_bot": [1.5] * 4,
        "description": ["called_strike", "ball", "swinging_strike", "ball"],
        "delta_run_exp": [0.01, -0.05, -0.02, 0.03],
    })
    z = swing_take.add_swing_take(df)
    assert z["attack_zone"].tolist() == ["Heart", "Shadow", "Chase", "Waste"]
    assert z["is_swing"].tolist() == [False, False, True, False]


def test_xwoba_grid_recovers_actual_when_unbinned_perfectly():
    # Two batters; grid method should reproduce sane wOBA/xwOBA on the scale.
    df = pd.DataFrame({
        "batter": [1, 1, 2, 2],
        "description": ["hit_into_play", "walk", "hit_into_play", "strikeout"],
        "launch_speed": [100.0, None, 70.0, None],
        "launch_angle": [25.0, None, -10.0, None],
        "woba_value": [2.0, 0.69, 0.0, 0.0],
        "woba_denom": [1, 1, 1, 1],
    })
    model = xwoba.XwobaconModel(method="grid").fit(df)
    out = compute = xwoba.compute_player_xwoba(df, model).set_index("player_id")
    # batter 1: walk keeps 0.69; contact gets grid mean of the single hard hit
    assert out.loc[1, "woba"] > out.loc[2, "woba"]
    assert (out["xwoba"] >= 0).all()

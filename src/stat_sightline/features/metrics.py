"""Batted-ball metrics: barrels, hard-hit, and percentile ranking.

Pure pandas/numpy so it can run inside the ETL, the modeling pipeline, or
behind the API without a database round-trip. The barrel logic is kept
identical to sql/02_feature_views.sql so SQL and Python agree.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

HARD_HIT_THRESHOLD = 95.0  # mph


def is_barrel(launch_speed: pd.Series, launch_angle: pd.Series) -> pd.Series:
    """Boolean Series flagging Statcast barrels.

    Anchor: at 98 mph the barrel band is launch angle 26-30 deg; it widens
    ~1 deg per side for each additional mph. The two linear inequalities
    below reproduce that band.
    """
    ev = pd.to_numeric(launch_speed, errors="coerce")
    la = pd.to_numeric(launch_angle, errors="coerce")
    flag = (
        (ev >= 98)
        & (la.between(8, 50))
        & ((ev * 1.5 - la) >= 117)
        & ((ev + la) >= 124)
    )
    return flag.fillna(False)


def add_batted_ball_flags(df: pd.DataFrame) -> pd.DataFrame:
    """Return df with is_barrel / is_hard_hit columns for in-play pitches."""
    out = df.copy()
    out["is_barrel"] = is_barrel(out["launch_speed"], out["launch_angle"])
    out["is_hard_hit"] = pd.to_numeric(out["launch_speed"], errors="coerce") >= HARD_HIT_THRESHOLD
    return out


def player_barrel_rates(df: pd.DataFrame) -> pd.DataFrame:
    """Aggregate batted balls to per-batter barrel / hard-hit / avg EV."""
    bbe = df[(df["description"] == "hit_into_play") & df["launch_speed"].notna()].copy()
    bbe = add_batted_ball_flags(bbe)
    grp = bbe.groupby("batter")
    out = grp.agg(
        batted_balls=("launch_speed", "size"),
        barrels=("is_barrel", "sum"),
        hard_hits=("is_hard_hit", "sum"),
        avg_exit_velocity=("launch_speed", "mean"),
    ).reset_index()
    out["barrel_pct"] = 100 * out["barrels"] / out["batted_balls"].clip(lower=1)
    out["hard_hit_pct"] = 100 * out["hard_hits"] / out["batted_balls"].clip(lower=1)
    return out.rename(columns={"batter": "player_id"})


def percentile_rank(values: pd.Series, *, higher_is_better: bool = True) -> pd.Series:
    """Savant-style 0-100 percentile for slider visuals.

    higher_is_better=False flips the scale for "lower is better" metrics
    like Whiff% allowed or K% (for a hitter K% a low value is good).
    """
    v = pd.to_numeric(values, errors="coerce")
    pct = v.rank(pct=True) * 100
    if not higher_is_better:
        pct = 100 - pct
    return np.round(pct, 0)

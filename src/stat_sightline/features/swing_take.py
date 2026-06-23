"""Attack-zone segmentation (Heart/Shadow/Chase/Waste) and swing/take run values.

Mirrors sql/02_feature_views.sql. Locations are normalized into "zone units"
where |x|<=1, |z|<=1 is the rulebook strike zone, then bucketed by radial
distance r from the zone center.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# Horizontal half-width of the strike zone in feet (half plate + a ball).
HALF_ZONE_X = 0.83

# Radial thresholds (in normalized zone units). Tunable.
ZONE_BANDS = [(0.67, "Heart"), (1.33, "Shadow"), (2.00, "Chase")]
WASTE = "Waste"

SWING_DESCRIPTIONS = {
    "hit_into_play", "foul", "foul_tip", "foul_bunt", "bunt_foul_tip",
    "swinging_strike", "swinging_strike_blocked", "missed_bunt",
}


def attack_zone(plate_x: pd.Series, plate_z: pd.Series,
                sz_top: pd.Series, sz_bot: pd.Series) -> pd.Series:
    """Classify each pitch into Heart / Shadow / Chase / Waste."""
    px = pd.to_numeric(plate_x, errors="coerce")
    pz = pd.to_numeric(plate_z, errors="coerce")
    top = pd.to_numeric(sz_top, errors="coerce")
    bot = pd.to_numeric(sz_bot, errors="coerce")

    sz_mid = (top + bot) / 2.0
    sz_half = ((top - bot) / 2.0).clip(lower=0.01)
    r = np.maximum(px.abs() / HALF_ZONE_X, (pz - sz_mid).abs() / sz_half)

    zone = pd.Series(WASTE, index=px.index, dtype="object")
    # assign from outer band inward so the tightest threshold wins
    for threshold, label in reversed(ZONE_BANDS):
        zone = zone.mask(r <= threshold, label)
    zone = zone.where(r.notna(), other=pd.NA)
    return zone


def add_swing_take(df: pd.DataFrame) -> pd.DataFrame:
    """Return df with attack_zone, is_swing, and run_value columns."""
    out = df.copy()
    out["attack_zone"] = attack_zone(out["plate_x"], out["plate_z"],
                                     out["sz_top"], out["sz_bot"])
    out["is_swing"] = out["description"].isin(SWING_DESCRIPTIONS)
    # delta_run_exp is from the batting team's perspective (positive = good
    # for the hitter); it is the run value of the batter's decision.
    out["run_value"] = pd.to_numeric(out["delta_run_exp"], errors="coerce")
    return out


def player_swing_take(df: pd.DataFrame) -> pd.DataFrame:
    """Per-batter run value summed by zone and swing/take decision."""
    z = add_swing_take(df).dropna(subset=["attack_zone"])
    z["decision"] = np.where(z["is_swing"], "Swing", "Take")
    grp = z.groupby(["batter", "attack_zone", "decision"])
    out = grp.agg(
        pitches=("run_value", "size"),
        run_value=("run_value", "sum"),
    ).reset_index()
    out["run_value_per_100"] = 100 * out["run_value"] / out["pitches"].clip(lower=1)
    return out.rename(columns={"batter": "player_id"})

"""Custom Expected wOBA (xwOBA).

Structure
---------
xwOBA mirrors wOBA but replaces *what actually happened on contact* with
*what was expected* given how the ball was hit:

    xwOBA = ( SUM(xwOBAcon over batted balls)
              + SUM(woba_value over non-contact PA outcomes: BB, HBP, K) )
            / SUM(woba_denom)

where woba_denom (from Statcast) already encodes the wOBA denominator
(AB + BB - IBB + SF + HBP), and `xwOBAcon` is the model's estimate of the
wOBA value of a batted ball from its launch_speed and launch_angle.

Two estimators for xwOBAcon
---------------------------
* "grid"  (default): the Statcast-faithful method — bin (EV, LA) and use the
  historical mean wOBA value in that bin. Needs only numpy/pandas, so it is
  unit-testable offline.
* "gbm": a HistGradientBoostingRegressor for a smooth surface (optionally
  adding spray angle). Requires scikit-learn.

Non-contact outcomes (BB/HBP/K) are deterministic on the wOBA scale, so we
keep their actual woba_value rather than modeling them.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

# 2024-ish wOBA linear weights — adjust per season as desired.
WOBA_WEIGHTS = {
    "walk": 0.690, "hbp": 0.722,
    "single": 0.883, "double": 1.244, "triple": 1.569, "home_run": 2.004,
}

CONTACT_DESCRIPTION = "hit_into_play"


def spray_angle(hc_x: pd.Series, hc_y: pd.Series) -> pd.Series:
    """Horizontal spray angle in degrees (0 = up the middle, +pull/oppo).

    Uses Statcast's hit-coordinate origin (home plate at ~125.42, 198.27).
    """
    x = pd.to_numeric(hc_x, errors="coerce") - 125.42
    y = 198.27 - pd.to_numeric(hc_y, errors="coerce")
    return np.degrees(np.arctan2(x, y))


@dataclass
class XwobaconModel:
    """Estimator for the wOBA value of a batted ball (xwOBAcon)."""

    method: str = "grid"
    ev_bin: float = 2.0          # mph bucket width for the grid method
    la_bin: float = 3.0          # degree bucket width for the grid method
    use_spray: bool = False      # gbm only
    _grid: dict = field(default_factory=dict, repr=False)
    _global_mean: float = 0.0
    _gbm: object = field(default=None, repr=False)

    # -- helpers -------------------------------------------------------
    def _bin_keys(self, ev: pd.Series, la: pd.Series) -> pd.Series:
        ev_idx = np.floor(ev / self.ev_bin)
        la_idx = np.floor(la / self.la_bin)
        return list(zip(ev_idx, la_idx))

    # -- fit -----------------------------------------------------------
    def fit(self, df: pd.DataFrame) -> "XwobaconModel":
        """Fit on batted balls. Expects launch_speed, launch_angle, woba_value."""
        bbe = df[
            (df["description"] == CONTACT_DESCRIPTION)
            & df["launch_speed"].notna()
            & df["launch_angle"].notna()
            & df["woba_value"].notna()
        ].copy()
        ev = pd.to_numeric(bbe["launch_speed"], errors="coerce")
        la = pd.to_numeric(bbe["launch_angle"], errors="coerce")
        y = pd.to_numeric(bbe["woba_value"], errors="coerce")
        self._global_mean = float(y.mean()) if len(y) else 0.0

        if self.method == "grid":
            tmp = pd.DataFrame({"key": self._bin_keys(ev, la), "y": y})
            self._grid = tmp.groupby("key")["y"].mean().to_dict()
        elif self.method == "gbm":
            from sklearn.ensemble import HistGradientBoostingRegressor

            feats = self._features(bbe)
            self._gbm = HistGradientBoostingRegressor(
                max_depth=4, learning_rate=0.05, max_iter=400
            ).fit(feats, y)
        else:
            raise ValueError(f"unknown method {self.method!r}")
        return self

    def _features(self, df: pd.DataFrame) -> pd.DataFrame:
        feats = pd.DataFrame({
            "launch_speed": pd.to_numeric(df["launch_speed"], errors="coerce"),
            "launch_angle": pd.to_numeric(df["launch_angle"], errors="coerce"),
        })
        if self.use_spray and {"hc_x", "hc_y"}.issubset(df.columns):
            feats["spray_angle"] = spray_angle(df["hc_x"], df["hc_y"]).fillna(0)
        return feats

    # -- predict -------------------------------------------------------
    def predict(self, df: pd.DataFrame) -> pd.Series:
        ev = pd.to_numeric(df["launch_speed"], errors="coerce")
        la = pd.to_numeric(df["launch_angle"], errors="coerce")
        if self.method == "grid":
            keys = self._bin_keys(ev, la)
            vals = [self._grid.get(k, self._global_mean) for k in keys]
            out = pd.Series(vals, index=df.index, dtype="float64")
            return out.mask(ev.isna() | la.isna(), self._global_mean)
        preds = self._gbm.predict(self._features(df).fillna(0))
        return pd.Series(preds, index=df.index)


def compute_player_xwoba(df: pd.DataFrame, model: XwobaconModel) -> pd.DataFrame:
    """Per-batter actual wOBA, xwOBA, and the gap (luck indicator).

    Numerator swaps each batted ball's actual woba_value for the model's
    xwOBAcon; walks/HBP/strikeouts keep their deterministic woba_value.
    """
    work = df[df["woba_denom"].notna() & (df["woba_denom"] > 0)].copy()
    is_contact = (work["description"] == CONTACT_DESCRIPTION) & work["launch_speed"].notna()

    work["x_num"] = pd.to_numeric(work["woba_value"], errors="coerce").fillna(0.0)
    work.loc[is_contact, "x_num"] = model.predict(work[is_contact])
    work["a_num"] = pd.to_numeric(work["woba_value"], errors="coerce").fillna(0.0)
    work["denom"] = pd.to_numeric(work["woba_denom"], errors="coerce")

    grp = work.groupby("batter")
    out = grp.agg(
        events=("denom", "size"),
        denom=("denom", "sum"),
        actual_num=("a_num", "sum"),
        x_num=("x_num", "sum"),
    ).reset_index()
    out["woba"] = out["actual_num"] / out["denom"].clip(lower=1)
    out["xwoba"] = out["x_num"] / out["denom"].clip(lower=1)
    out["woba_diff"] = out["woba"] - out["xwoba"]  # +ve => outperforming (lucky)
    return out[["batter", "events", "woba", "xwoba", "woba_diff"]].rename(
        columns={"batter": "player_id"}
    )

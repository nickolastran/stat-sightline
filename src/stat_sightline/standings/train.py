"""Fit the standings model with chronological validation.

Two heads off one feature set: LogisticRegression for the home team's win
probability and Ridge for the run differential. Linear models beat gradient
boosting on rolling-form features here and — more importantly — come out better
calibrated, which is what matters when the projection *sums* probabilities
across a couple thousand remaining games.

Validation is chronological, never random: fit on seasons before the holdout,
score the holdout. A random split would leak the future into the past through
overlapping rolling windows.

The holdout metrics are saved into the pickle so the API can report how good
the model actually is next to the numbers it projects.
"""
from __future__ import annotations

import pickle
from datetime import datetime, timezone

import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import accuracy_score, log_loss, mean_absolute_error
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from config.settings import STANDINGS_DIR
from src.stat_sightline.standings.features import FEATURES, build_features

MODEL_PKL = STANDINGS_DIR / "model.pkl"


def _pipeline(model):
    """Impute the missing starter-rest values, standardize, then fit."""
    return make_pipeline(SimpleImputer(), StandardScaler(), model)


def train(games: pd.DataFrame, holdout_season: int | None = None) -> dict:
    """Fit both heads and return the model bundle. `holdout_season` defaults to
    the latest season in the data — the one in progress, which no fit touches."""
    df = build_features(games)
    if df.empty:
        raise ValueError("no usable games; run the ingest first")

    holdout = holdout_season if holdout_season is not None else int(df["season"].max())
    train_df = df[df["season"] < holdout]
    test_df = df[df["season"] == holdout]
    if train_df.empty:
        raise ValueError(f"no seasons before {holdout} to train on")

    clf = _pipeline(LogisticRegression()).fit(train_df[FEATURES], train_df["home_win"])
    reg = _pipeline(Ridge()).fit(train_df[FEATURES], train_df["run_diff"])

    metrics: dict[str, float | int] = {
        "train_games": len(train_df),
        "holdout_season": holdout,
        "holdout_games": len(test_df),
    }
    if len(test_df):
        prob = clf.predict_proba(test_df[FEATURES])[:, 1]
        metrics |= {
            "accuracy": round(accuracy_score(test_df["home_win"], prob > 0.5), 4),
            # The bar to clear: always picking the home team.
            "home_baseline": round(float(test_df["home_win"].mean()), 4),
            "log_loss": round(log_loss(test_df["home_win"], prob), 4),
            "run_diff_mae": round(
                mean_absolute_error(test_df["run_diff"], reg.predict(test_df[FEATURES])), 3
            ),
        }

    return {
        "clf": clf,
        "reg": reg,
        "features": FEATURES,
        "metrics": metrics,
        "seasons": sorted(int(s) for s in df["season"].unique()),
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def save(bundle: dict) -> None:
    STANDINGS_DIR.mkdir(parents=True, exist_ok=True)
    with open(MODEL_PKL, "wb") as f:
        pickle.dump(bundle, f)


def load() -> dict:
    with open(MODEL_PKL, "rb") as f:
        return pickle.load(f)

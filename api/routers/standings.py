"""Projected-standings endpoint behind the PROJ / PACE columns in the frontend.

DB-free: this router reads the flat files the standings pipeline writes
(`data/standings/games.csv` + `model.pkl`) and the live MLB schedule, so it
answers even when PostgreSQL is down.

The work is cached per (season, day, artifact mtime): a projection scores every
remaining game on the schedule, which is wasted effort on every page load, and
the inputs only change when a day turns over or the pipeline is re-run.
"""
from __future__ import annotations

from functools import lru_cache

import requests
from fastapi import APIRouter, HTTPException, Query

from api.schemas import StandingsProjection
from src.stat_sightline.standings.ingest import GAMES_CSV, today_et
from src.stat_sightline.standings.project import load_games, project_season
from src.stat_sightline.standings.train import MODEL_PKL
from src.stat_sightline.standings.train import load as load_model

router = APIRouter(prefix="/api/standings", tags=["standings"])

MISSING_ARTIFACTS = (
    "standings model not built yet — run `python scripts/train_standings.py`"
)


def _mtime(path) -> float:
    """Artifact fingerprint, so a retrain invalidates the cache without a restart."""
    return path.stat().st_mtime


@lru_cache(maxsize=8)
def _cached_projection(season: int, day: str, games_at: float, model_at: float) -> dict:
    # day/games_at/model_at are cache keys only; the values come off disk.
    return project_season(season, load_games(), load_model())


@router.get("/projections", response_model=StandingsProjection)
def projections(
    season: int = Query(default_factory=lambda: today_et().year, ge=1901),
) -> StandingsProjection:
    """Projected final wins per club: actual wins + expected wins remaining.

    `pace_wins` is where the projection says a club should be after the games
    it has played, so wins above pace means it is outperforming the model.
    `pace_162` is the plainer figure — today's win rate over a full season.
    """
    try:
        games_at, model_at = _mtime(GAMES_CSV), _mtime(MODEL_PKL)
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail=MISSING_ARTIFACTS) from None

    try:
        payload = _cached_projection(season, today_et().isoformat(), games_at, model_at)
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"MLB schedule unreachable: {exc}") from exc

    if not payload["teams"]:
        raise HTTPException(status_code=404, detail=f"no games on record for {season}")
    return StandingsProjection(**payload)

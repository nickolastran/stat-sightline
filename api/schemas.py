"""Pydantic response models for the Stat Sightline API."""
from __future__ import annotations

from datetime import date

from pydantic import BaseModel


class Pitcher(BaseModel):
    player_id: int
    full_name: str | None = None
    throws: str | None = None
    pitches: int | None = None


class Pitch(BaseModel):
    pitch_type: str | None = None
    pitch_name: str | None = None
    plate_x: float | None = None      # ft, catcher's view (+ = toward 3B side)
    plate_z: float | None = None      # ft, height above ground
    release_speed: float | None = None
    release_spin_rate: float | None = None
    pfx_x: float | None = None
    pfx_z: float | None = None
    description: str | None = None
    stand: str | None = None          # batter handedness this pitch
    game_date: date | None = None
    balls: int | None = None
    strikes: int | None = None
    outs_when_up: int | None = None
    inning: int | None = None
    runners_on: bool | None = None    # any of 1B/2B/3B occupied
    zone: int | None = None           # Statcast 1-14 grid; 1-9 = in zone
    launch_speed: float | None = None # exit velocity, mph
    launch_angle: float | None = None # degrees
    events: str | None = None         # terminal PA outcome, else None


class PitcherPitches(BaseModel):
    pitcher: Pitcher
    count: int
    pitches: list[Pitch]


class ModelInfo(BaseModel):
    """Chronological-holdout quality of the standings model, so the projection
    is shown next to how well it actually predicts."""
    holdout_season: int | None = None
    holdout_games: int | None = None
    train_games: int | None = None
    accuracy: float | None = None
    home_baseline: float | None = None  # always-pick-home, the bar to clear
    log_loss: float | None = None
    run_diff_mae: float | None = None
    trained_at: str | None = None


class TeamProjection(BaseModel):
    team_id: int                 # MLB team id, joins to the standings row
    name: str
    wins: int
    losses: int
    games_played: int
    games_remaining: int
    projected_wins: float        # actual + summed win probability remaining
    projected_losses: float
    pace_wins: float             # the projection prorated to games played
    pace_162: float              # current win rate over a full 162


class StandingsProjection(BaseModel):
    season: int
    as_of: str | None = None     # date of the latest result counted
    model: ModelInfo
    teams: list[TeamProjection]

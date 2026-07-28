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

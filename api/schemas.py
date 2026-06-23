"""Pydantic response models for the Stat Sightline API."""
from __future__ import annotations

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
    pfx_x: float | None = None
    pfx_z: float | None = None
    description: str | None = None
    stand: str | None = None          # batter handedness this pitch


class PitcherPitches(BaseModel):
    pitcher: Pitcher
    count: int
    pitches: list[Pitch]

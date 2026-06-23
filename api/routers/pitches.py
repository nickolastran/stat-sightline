"""Pitcher + pitch-level endpoints that feed the strike-zone scatter chart."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from api.schemas import Pitch, Pitcher, PitcherPitches
from src.stat_sightline.db.connection import get_engine

router = APIRouter(prefix="/api/pitchers", tags=["pitchers"])


@router.get("", response_model=list[Pitcher])
def search_pitchers(
    q: str = Query("", description="case-insensitive name fragment"),
    limit: int = Query(25, le=200),
) -> list[Pitcher]:
    """Typeahead search for pitchers, ordered by workload."""
    sql = text("""
        SELECT p.player_id, p.full_name, p.throws, COUNT(*) AS pitches
        FROM savant.pitches pi
        JOIN savant.players p ON p.player_id = pi.pitcher
        WHERE (:q = '' OR p.full_name ILIKE '%' || :q || '%')
        GROUP BY p.player_id, p.full_name, p.throws
        ORDER BY pitches DESC
        LIMIT :limit
    """)
    with get_engine().connect() as conn:
        rows = conn.execute(sql, {"q": q, "limit": limit}).mappings().all()
    return [Pitcher(**row) for row in rows]


@router.get("/{pitcher_id}/pitches", response_model=PitcherPitches)
def pitcher_pitches(
    pitcher_id: int,
    pitch_type: str | None = Query(None, description="filter to one pitch type, e.g. FF"),
    stand: str | None = Query(None, pattern="^[LR]$", description="batter side L/R"),
    limit: int = Query(2000, le=10000),
) -> PitcherPitches:
    """All located pitches for one pitcher — the strike-zone scatter payload."""
    with get_engine().connect() as conn:
        meta = conn.execute(
            text("""
                SELECT player_id, full_name, throws
                FROM savant.players WHERE player_id = :pid
            """),
            {"pid": pitcher_id},
        ).mappings().first()
        if meta is None:
            raise HTTPException(status_code=404, detail="pitcher not found")

        rows = conn.execute(
            text("""
                SELECT pitch_type, pitch_name, plate_x, plate_z, release_speed,
                       pfx_x, pfx_z, description, stand
                FROM savant.pitches
                WHERE pitcher = :pid
                  AND plate_x IS NOT NULL AND plate_z IS NOT NULL
                  AND (:ptype IS NULL OR pitch_type = :ptype)
                  AND (:stand IS NULL OR stand = :stand)
                LIMIT :limit
            """),
            {"pid": pitcher_id, "ptype": pitch_type, "stand": stand, "limit": limit},
        ).mappings().all()

    pitches = [Pitch(**row) for row in rows]
    return PitcherPitches(
        pitcher=Pitcher(**meta, pitches=len(pitches)),
        count=len(pitches),
        pitches=pitches,
    )

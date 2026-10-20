"""Player + pitch-level endpoints that feed the dashboard modules.

Pitching and hitting are the same pitch table read from either side: a
pitcher's pitches thrown, or a batter's pitches seen.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from api.schemas import Pitch, Pitcher, PitcherPitches
from src.stat_sightline.db.connection import get_engine
from src.stat_sightline.query.run import search_players

router = APIRouter(prefix="/api", tags=["players"])

Role = Literal["pitcher", "batter"]


def _search(q: str, limit: int, workload: str) -> list[Pitcher]:
    return [
        Pitcher(player_id=r["player_id"], full_name=r["full_name"],
                throws=r["throws"], bats=r.get("bats"), pitches=r[workload])
        for r in search_players(q, limit, workload=workload)
    ]


@router.get("/pitchers", response_model=list[Pitcher])
def search_pitchers(
    q: str = Query("", description="case-insensitive name fragment"),
    limit: int = Query(25, le=200),
) -> list[Pitcher]:
    """Typeahead search for pitchers, ordered by pitches thrown."""
    return _search(q, limit, "pit_n")


@router.get("/batters", response_model=list[Pitcher])
def search_batters(
    q: str = Query("", description="case-insensitive name fragment"),
    limit: int = Query(25, le=200),
) -> list[Pitcher]:
    """Typeahead search for batters, ordered by pitches seen."""
    return _search(q, limit, "bat_n")


def _pitches(role: Role, player_id: int, pitch_type: str | None, stand: str | None,
             date_from: str | None, date_to: str | None, limit: int) -> PitcherPitches:
    """All located pitches one player threw (pitcher) or saw (batter) — the
    dashboard's working set.

    The payload carries game state (count, outs, runners, inning) and
    batted-ball tracking so the frontend can slice it client-side without
    a round trip per filter change. `role` picks the column from a fixed
    pair, never from the request text.
    """
    who = "pitcher" if role == "pitcher" else "batter"
    with get_engine().connect() as conn:
        meta = conn.execute(
            text("""
                SELECT player_id, full_name, throws, bats
                FROM savant.players WHERE player_id = :pid
            """),
            {"pid": player_id},
        ).mappings().first()
        if meta is None:
            raise HTTPException(status_code=404, detail=f"{role} not found")

        rows = conn.execute(
            text(f"""
                SELECT pitch_type, pitch_name, plate_x, plate_z, release_speed,
                       release_spin_rate, pfx_x, pfx_z, description, stand, p_throws,
                       sz_top, sz_bot,
                       game_date, balls, strikes, outs_when_up, inning,
                       (on_1b IS NOT NULL OR on_2b IS NOT NULL OR on_3b IS NOT NULL)
                           AS runners_on,
                       zone, launch_speed, launch_angle, events,
                       launch_speed_angle, hc_x, hc_y, hit_distance_sc AS hit_distance,
                       bat_speed, swing_length, delta_run_exp AS run_value,
                       estimated_woba_using_speedangle AS xwoba, woba_value, woba_denom
                FROM savant.pitches
                WHERE {who} = :pid
                  AND plate_x IS NOT NULL AND plate_z IS NOT NULL
                  AND (:ptype IS NULL OR pitch_type = :ptype)
                  AND (:stand IS NULL OR stand = :stand)
                  AND (CAST(:date_from AS date) IS NULL OR game_date >= CAST(:date_from AS date))
                  AND (CAST(:date_to AS date) IS NULL OR game_date <= CAST(:date_to AS date))
                ORDER BY game_date, at_bat_number, pitch_number
                LIMIT :limit
            """),
            {
                "pid": player_id,
                "ptype": pitch_type,
                "stand": stand,
                "date_from": date_from,
                "date_to": date_to,
                "limit": limit,
            },
        ).mappings().all()

    pitches = [Pitch(**row) for row in rows]
    return PitcherPitches(
        pitcher=Pitcher(**meta, pitches=len(pitches)),
        count=len(pitches),
        pitches=pitches,
    )


@router.get("/pitchers/{pitcher_id}/pitches", response_model=PitcherPitches)
def pitcher_pitches(
    pitcher_id: int,
    pitch_type: str | None = Query(None, description="filter to one pitch type, e.g. FF"),
    stand: str | None = Query(None, pattern="^[LR]$", description="batter side L/R"),
    date_from: str | None = Query(None, description="ISO date lower bound (inclusive)"),
    date_to: str | None = Query(None, description="ISO date upper bound (inclusive)"),
    limit: int = Query(5000, le=20000),
) -> PitcherPitches:
    """Every located pitch one pitcher threw."""
    return _pitches("pitcher", pitcher_id, pitch_type, stand, date_from, date_to, limit)


@router.get("/batters/{batter_id}/pitches", response_model=PitcherPitches)
def batter_pitches(
    batter_id: int,
    pitch_type: str | None = Query(None, description="filter to one pitch type, e.g. FF"),
    stand: str | None = Query(None, pattern="^[LR]$", description="batter side L/R (switch hitters)"),
    date_from: str | None = Query(None, description="ISO date lower bound (inclusive)"),
    date_to: str | None = Query(None, description="ISO date upper bound (inclusive)"),
    limit: int = Query(5000, le=20000),
) -> PitcherPitches:
    """Every located pitch one batter saw."""
    return _pitches("batter", batter_id, pitch_type, stand, date_from, date_to, limit)

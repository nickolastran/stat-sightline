"""Pitch-level batter-vs-pitcher matchups for the gamecast's pregame lineups.

MLB's own vsPlayer total is a box-score line (H-AB, HR, K). What only the
warehouse knows is *how* the meetings went pitch by pitch: what he was thrown,
how often he missed, how hard he hit it, and the expected outcome of that
contact. One grouped query per call; the rates are worked out in Python so
they're testable without a database.
"""

from __future__ import annotations

from fastapi import APIRouter, Query
from sqlalchemy import text

from api.schemas import Matchup
from src.stat_sightline.db.connection import get_engine
from src.stat_sightline.features.metrics import HARD_HIT_THRESHOLD
from src.stat_sightline.features.swing_take import SWING_DESCRIPTIONS

router = APIRouter(prefix="/api/matchups", tags=["matchups"])

# Savant's whiff: a swing that missed, the foul tip counting as one.
WHIFF_DESCRIPTIONS = {"swinging_strike", "swinging_strike_blocked", "foul_tip"}
MIX_TOP = 3  # pitch types named in the mix; the rest are a long tail
MAX_BATTERS = 30  # two lineups and a bench, never a whole league


def summarize(totals: list[dict], mix: list[dict]) -> list[Matchup]:
    """Turn per-batter counts into the card's rates.

    A rate with no denominator (no swings, no batted balls) is None rather
    than 0 — never having swung at him is not a 0% whiff rate.
    """
    by_batter: dict[int, list[dict]] = {}
    for m in mix:
        by_batter.setdefault(m["batter"], []).append(m)

    def pct(n: int, d: int) -> float | None:
        return round(100 * n / d, 1) if d else None

    out = []
    for t in totals:
        types = sorted(by_batter.get(t["batter"], []), key=lambda m: -m["n"])
        out.append(Matchup(
            batter=t["batter"],
            pitches=t["pitches"],
            pa=t["pa"],
            whiff_pct=pct(t["whiffs"], t["swings"]),
            avg_ev=round(t["ev_sum"] / t["bbe"], 1) if t["bbe"] else None,
            hard_hit_pct=pct(t["hard_hits"], t["bbe"]),
            xwoba=round(t["xwoba_num"] / t["xwoba_den"], 3) if t["xwoba_den"] else None,
            mix=[
                {"pitch_type": m["pitch_type"], "pct": pct(m["n"], t["pitches"])}
                for m in types[:MIX_TOP]
            ],
        ))
    return out


@router.get("", response_model=list[Matchup])
def matchups(
    pitcher: int = Query(..., description="MLBAM id of the pitcher"),
    batters: str = Query(..., description="comma-separated MLBAM batter ids"),
) -> list[Matchup]:
    """Every listed batter's pitch-level line against one pitcher.

    A batter who has never faced him is simply absent from the list.
    """
    ids = sorted({int(b) for b in batters.split(",") if b.strip().isdigit()})[:MAX_BATTERS]
    if not ids:
        return []
    params = {
        "pid": pitcher,
        "ids": ids,
        "swings": list(SWING_DESCRIPTIONS),
        "whiffs": list(WHIFF_DESCRIPTIONS),
        "hh": HARD_HIT_THRESHOLD,
    }
    # xwOBA: Statcast's expected value on contact, the actual wOBA value on
    # every other PA ending (BB, HBP, K), over the wOBA denominator.
    with get_engine().connect() as conn:
        totals = conn.execute(text("""
            SELECT batter,
                   COUNT(*)                                             AS pitches,
                   COUNT(*) FILTER (WHERE events IS NOT NULL)           AS pa,
                   COUNT(*) FILTER (WHERE description = ANY(:swings))   AS swings,
                   COUNT(*) FILTER (WHERE description = ANY(:whiffs))   AS whiffs,
                   COUNT(launch_speed) FILTER (WHERE description = 'hit_into_play') AS bbe,
                   COALESCE(SUM(launch_speed) FILTER (WHERE description = 'hit_into_play'), 0) AS ev_sum,
                   COUNT(*) FILTER (WHERE description = 'hit_into_play'
                                      AND launch_speed >= :hh)          AS hard_hits,
                   COALESCE(SUM(COALESCE(estimated_woba_using_speedangle, woba_value))
                            FILTER (WHERE woba_denom > 0), 0)           AS xwoba_num,
                   COALESCE(SUM(woba_denom), 0)                         AS xwoba_den
            FROM savant.pitches
            WHERE pitcher = :pid AND batter = ANY(:ids)
            GROUP BY batter
        """), params).mappings().all()
        mix = conn.execute(text("""
            SELECT batter, pitch_type, COUNT(*) AS n
            FROM savant.pitches
            WHERE pitcher = :pid AND batter = ANY(:ids) AND pitch_type IS NOT NULL
            GROUP BY batter, pitch_type
        """), params).mappings().all()
    return summarize([dict(r) for r in totals], [dict(r) for r in mix])

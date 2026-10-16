"""Write the pregame card's pitch-level matchups into a frontend snapshot, for
a site with no API.

The deployed frontend has no FastAPI backend (and the warehouse holds only a
slice of one season), so the lineup card's PITCH view reads
`frontend/data/matchups.json`: per probable starter, the line of every hitter
on the opposing active roster who has faced him, in `/api/matchups` rows.
Rosters rather than lineups because lineups post hours after the daily Action
(`.github/workflows/matchups.yml`) runs; the frontend picks the nine out.

Pitches come straight from Baseball Savant, one search per starter — every
Statcast season, regular season and postseason — and are counted the way the
router's SQL counts them, then rated by its own `summarize()`. The file holds
only today's and tomorrow's starters; it is rewritten whole each run.

Examples:
    python scripts/snapshot_matchups.py              # today + tomorrow (ET)
    python scripts/snapshot_matchups.py 2026-10-17   # one day
"""
from __future__ import annotations

import csv
import io
import json
import sys
import time
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from api.routers.matchups import MAX_BATTERS, WHIFF_DESCRIPTIONS, summarize  # noqa: E402
from src.stat_sightline.features.metrics import HARD_HIT_THRESHOLD  # noqa: E402
from src.stat_sightline.features.swing_take import SWING_DESCRIPTIONS  # noqa: E402

OUT = ROOT / "frontend" / "data" / "matchups.json"
STATSAPI = "https://statsapi.mlb.com/api/v1"
SAVANT = "https://baseballsavant.mlb.com/statcast_search/csv"
FIRST_SEASON = 2015  # Statcast's first; exit velocity and xwOBA start here


def _num(v: str) -> float | None:
    return float(v) if v not in ("", "null", None) else None


def tally(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    """Savant CSV rows → the (totals, mix) the router's SQL returns, so
    `summarize()` rates them identically. Savant writes a missing value as ''."""
    totals: dict[int, dict] = {}
    mix: dict[tuple[int, str], int] = {}
    for r in rows:
        b = int(r["batter"])
        t = totals.setdefault(b, dict(
            batter=b, pitches=0, pa=0, swings=0, whiffs=0, bbe=0,
            ev_sum=0.0, hard_hits=0, xwoba_num=0.0, xwoba_den=0,
        ))
        desc, ev, den = r["description"], _num(r["launch_speed"]), _num(r["woba_denom"])
        t["pitches"] += 1
        t["pa"] += bool(r["events"])
        t["swings"] += desc in SWING_DESCRIPTIONS
        t["whiffs"] += desc in WHIFF_DESCRIPTIONS
        if desc == "hit_into_play" and ev is not None:
            t["bbe"] += 1
            t["ev_sum"] += ev
            t["hard_hits"] += ev >= HARD_HIT_THRESHOLD
        if den:
            x = _num(r["estimated_woba_using_speedangle"])
            t["xwoba_num"] += x if x is not None else _num(r["woba_value"]) or 0.0
            t["xwoba_den"] += int(den)
        if r["pitch_type"]:
            mix[b, r["pitch_type"]] = mix.get((b, r["pitch_type"]), 0) + 1
    return (
        list(totals.values()),
        [{"batter": b, "pitch_type": p, "n": n} for (b, p), n in mix.items()],
    )


def main(argv: list[str]) -> int:
    import requests

    from src.stat_sightline.standings.ingest import today_et

    days = [date.fromisoformat(d) for d in argv] or [today_et() + timedelta(n) for n in (0, 1)]
    http = requests.Session()

    def get(url: str, **params) -> requests.Response:
        res = http.get(url, params=params, timeout=60)
        res.raise_for_status()
        return res

    sched = get(
        f"{STATSAPI}/schedule", sportId=1, hydrate="probablePitcher",
        startDate=days[0].isoformat(), endDate=days[-1].isoformat(),
    ).json()
    # (starter, the club he faces), each once — a doubleheader's or tomorrow's
    # repeat of a pairing is the same answer.
    starts = {
        (p["id"], g["teams"][opp]["team"]["id"])
        for d in sched.get("dates", [])
        for g in d["games"]
        for side, opp in (("home", "away"), ("away", "home"))
        if (p := g["teams"][side].get("probablePitcher"))
    }

    hitters: dict[int, list[int]] = {}
    seasons = "|".join(str(y) for y in range(days[-1].year, FIRST_SEASON - 1, -1)) + "|"
    snap = {}
    for pitcher, club in sorted(starts):
        if club not in hitters:
            roster = get(f"{STATSAPI}/teams/{club}/roster", rosterType="active").json()
            hitters[club] = [
                r["person"]["id"] for r in roster.get("roster", [])
                if r["position"]["type"] != "Pitcher"
            ][:MAX_BATTERS]
        if not hitters[club]:
            continue
        res = get(
            SAVANT, all="true", type="details", player_type="pitcher",
            hfSea=seasons, hfGT="R|PO|",
            **{"pitchers_lookup[]": pitcher, "batters_lookup[]": hitters[club]},
        )
        reader = csv.DictReader(io.StringIO(res.content.decode("utf-8-sig")))
        # An empty search still sends the header; anything without one is an
        # error page, and must not be written down as "nobody has faced him".
        if "batter" not in (reader.fieldnames or []):
            raise RuntimeError(f"Savant sent no CSV for pitcher {pitcher}")
        snap[str(pitcher)] = [m.model_dump() for m in summarize(*tally(list(reader)))]
        print(f"pitcher {pitcher} vs {club}: {len(snap[str(pitcher)])} hitters")
        time.sleep(1)  # one search a second — Savant is a free service

    OUT.write_text(json.dumps(snap, indent=1, sort_keys=True) + "\n")
    print(f"{len(snap)} starters → {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

"""Regular-season game results from the free MLB Stats API -> data/standings/games.csv.

No key and no database: the standings projection is trained on final scores and
probable starters alone, which keeps it independent of the Statcast/Postgres
pipeline the rest of the platform runs on. Re-running a season replaces its
rows, so an in-season refresh is just `--seasons <current>`.

Teams are keyed by MLB `team_id` rather than club name, so a franchise rename
(Indians -> Guardians, Oakland Athletics -> Athletics) does not split one team's
form history in two. The name column is display text only.
"""
from __future__ import annotations

import csv
from collections.abc import Iterable
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

import requests

from config.settings import STANDINGS_DIR

SCHEDULE = "https://statsapi.mlb.com/api/v1/schedule"
MLB_TZ = ZoneInfo("America/New_York")
COLS = [
    "game_pk", "date", "season",
    "home_id", "home", "away_id", "away",
    "home_score", "away_score", "home_sp", "away_sp",
]
GAMES_CSV = STANDINGS_DIR / "games.csv"


def today_et() -> date:
    """MLB's current game day. Pinned to Eastern, like the frontend's `todayET`,
    so a late West-coast finish doesn't put server and browser on different days
    (or, on New Year's Eve, in different seasons)."""
    return datetime.now(MLB_TZ).date()


def get_schedule(season: int, **params: Any) -> dict:
    """One season of the regular-season schedule, probable starters hydrated."""
    query = {
        "sportId": 1,
        "gameTypes": "R",
        "season": season,
        "hydrate": "probablePitcher",
        **params,
    }
    res = requests.get(SCHEDULE, params=query, timeout=60)
    res.raise_for_status()
    return res.json()


def iter_games(payload: dict) -> Iterable[tuple[str, dict]]:
    """(date, game) for every game in a schedule payload."""
    for day in payload.get("dates", []):
        for game in day.get("games", []):
            yield day["date"], game


# A postponed or cancelled game stays on the schedule as a placeholder, and its
# makeup is listed separately under the *same* game_pk. Both are marked Final
# once the makeup is played, so the state alone can't tell them apart.
NOT_PLAYED = ("Postponed", "Cancelled", "Canceled")


def is_placeholder(game: dict) -> bool:
    """A schedule entry for a game that was never played at that slot."""
    detailed = game.get("status", {}).get("detailedState", "")
    return any(word in detailed for word in NOT_PLAYED)


def is_final(game: dict) -> bool:
    """Played through to a result at this slot."""
    if is_placeholder(game):
        return False
    return game.get("status", {}).get("abstractGameState") == "Final"


def _row(game_date: str, season: int, game: dict) -> dict | None:
    home, away = game["teams"]["home"], game["teams"]["away"]
    if home.get("score") is None or away.get("score") is None:
        return None  # called before a score was posted; not usable as a result
    return {
        "game_pk": game["gamePk"],
        "date": game_date,
        "season": season,
        "home_id": home["team"]["id"],
        "home": home["team"].get("name", ""),
        "away_id": away["team"]["id"],
        "away": away["team"].get("name", ""),
        "home_score": home["score"],
        "away_score": away["score"],
        "home_sp": home.get("probablePitcher", {}).get("fullName", ""),
        "away_sp": away.get("probablePitcher", {}).get("fullName", ""),
    }


def fetch_season(season: int) -> list[dict]:
    """Every completed regular-season game of one season."""
    rows = []
    for game_date, game in iter_games(get_schedule(season)):
        if not is_final(game):
            continue
        row = _row(game_date, season, game)
        if row is not None:
            rows.append(row)
    return rows


def dedupe(rows: list[dict]) -> list[dict]:
    """One row per game, date-ordered.

    A game suspended and resumed later is listed under both dates carrying one
    game_pk, so the raw feed hands out the same result twice — a phantom win and
    a phantom game played for both clubs. Keep the later date: that is when the
    result was actually decided, which is what the rolling form must not see
    early.
    """
    latest: dict[int, dict] = {}
    for row in sorted(rows, key=lambda r: (str(r["date"]), int(r["game_pk"]))):
        latest[int(row["game_pk"])] = row
    return sorted(latest.values(), key=lambda r: (str(r["date"]), int(r["game_pk"])))


def ingest(seasons: list[int]) -> int:
    """Fetch `seasons` and merge them into games.csv, replacing those seasons'
    existing rows. Returns the total row count on disk afterwards."""
    STANDINGS_DIR.mkdir(parents=True, exist_ok=True)
    kept: list[dict] = []
    if GAMES_CSV.exists():
        with open(GAMES_CSV, newline="") as f:
            kept = [r for r in csv.DictReader(f) if int(r["season"]) not in seasons]

    fetched = [row for season in seasons for row in fetch_season(season)]
    rows = dedupe(kept + fetched)

    with open(GAMES_CSV, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLS)
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)

"""Project final standings: actual wins plus the expected wins still to come.

For every game left on the schedule the model gives the home club a win
probability p; that game contributes p to the home team's projected total and
1 - p to the away team's. Summing expectations rather than drawing Monte Carlo
seasons is exact for the *mean* — a 95.4-win projection is the expected value —
it just carries no spread, so this cannot answer "playoff odds" (that needs
draws, and correlated ones at that).

Current form is frozen at today's rolling window for every future game; the
model does not re-learn as the projected season unfolds.
"""
from __future__ import annotations

import pandas as pd

from src.stat_sightline.standings.features import FEATURES, latest_form, matchup_features
from src.stat_sightline.standings.ingest import (
    GAMES_CSV,
    get_schedule,
    is_final,
    is_placeholder,
    iter_games,
)


# `is_remaining`, `record_played` and `blank` are public because odds.py draws
# its simulated seasons from the same schedule and the same actual records —
# two answers off one set of rules, rather than two sets that can disagree.


def load_games() -> pd.DataFrame:
    """The ingested results. Raises FileNotFoundError until the ingest has run."""
    return pd.read_csv(GAMES_CSV)


def is_remaining(game: dict) -> bool:
    """Still to be played. Postponed and cancelled slots are dropped — the
    makeup game is listed separately, so counting the placeholder too would
    inflate every affected club's games remaining."""
    return not is_placeholder(game) and not is_final(game)


def blank(team_id: int, name: str) -> dict:
    return {
        "team_id": int(team_id), "name": name,
        "wins": 0, "losses": 0, "games_played": 0, "games_remaining": 0,
        "projected_wins": 0.0,
    }


def record_played(season: int, games: pd.DataFrame) -> tuple[dict[int, dict], str | None]:
    """Actual W-L per club for `season`, and the date of the latest game in it."""
    played = games[games["season"] == season]
    teams: dict[int, dict] = {}
    for _, g in played.iterrows():
        for side, other in (("home", "away"), ("away", "home")):
            tid = int(g[f"{side}_id"])
            team = teams.setdefault(tid, blank(tid, g[side]))
            team["name"] = g[side]  # freshest spelling of the club's name
            team["games_played"] += 1
            if g[f"{side}_score"] > g[f"{other}_score"]:
                team["wins"] += 1
                team["projected_wins"] += 1
            else:
                team["losses"] += 1
    as_of = str(played["date"].max()) if len(played) else None
    return teams, as_of


def project_season(season: int, games: pd.DataFrame, bundle: dict) -> dict:
    """Per-club projected finish for `season`, plus the model's holdout metrics.

    Trained on every season in `games`; only `season`'s own results are counted
    as actual wins.
    """
    teams, as_of = record_played(season, games)
    form = latest_form(games)

    # One feature row per remaining game, scored in a single batched call —
    # per-game predict() on a 1-row frame is ~50x slower over a full schedule.
    rows, sides = [], []
    seen: set[int] = set()
    for game_date, game in iter_games(get_schedule(season)):
        if not is_remaining(game) or game["gamePk"] in seen:
            continue
        seen.add(game["gamePk"])  # one entry per game, as in the results feed
        home = game["teams"]["home"]["team"]
        away = game["teams"]["away"]["team"]
        if home["id"] not in form.index or away["id"] not in form.index:
            continue  # no completed games on record: nothing to build form from
        rows.append(matchup_features(form, home["id"], away["id"], game_date))
        sides.append((home, away))

    if rows:
        probs = bundle["clf"].predict_proba(pd.DataFrame(rows)[FEATURES])[:, 1]
        for (home, away), p in zip(sides, probs):
            for team, share in ((home, float(p)), (away, 1.0 - float(p))):
                row = teams.setdefault(team["id"], blank(team["id"], team.get("name", "")))
                row["projected_wins"] += share
                row["games_remaining"] += 1

    for team in teams.values():
        played = team["games_played"]
        scheduled = played + team["games_remaining"]
        # Where the projection says a club should be after this many games —
        # so actual wins above pace means it is outrunning the projection.
        team["pace_wins"] = (
            round(team["projected_wins"] * played / scheduled, 1) if scheduled else 0.0
        )
        # The other kind of pace: today's win rate stretched over a full season.
        team["pace_162"] = round(team["wins"] / played * 162, 1) if played else 0.0
        team["projected_losses"] = round(scheduled - team["projected_wins"], 1)
        team["projected_wins"] = round(team["projected_wins"], 1)

    return {
        "season": season,
        "as_of": as_of,
        "model": {**bundle.get("metrics", {}), "trained_at": bundle.get("trained_at")},
        "teams": sorted(teams.values(), key=lambda t: -t["projected_wins"]),
    }

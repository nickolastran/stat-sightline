"""Playoff odds by Monte Carlo over the remaining schedule and the bracket.

project.py sums win probabilities, which is exact for the mean and carries no
spread — its own docstring says as much, and says that is why it cannot answer
"playoff odds". This draws seasons instead. Every remaining game is one
Bernoulli trial at the model's probability for it; a drawn season is seeded
into the twelve-team bracket and played out series by series. A club's odds
are the share of drawn seasons in which it wins its division, takes a bye, or
wins the World Series.

The draws are correlated the only way that matters here: a club's simulated
wins and its rivals' losses come out of the *same* drawn games, so beating the
club above you costs them a win in the same season it earns you one. What is
not modelled is form moving — every future game is scored off today's rolling
window, the same freeze project.py works under.

Two knobs worth knowing. Ties are broken by a coin flip rather than by MLB's
head-to-head ladder, which over thousands of draws is the right answer on
average and the wrong one for any single standings page. And the postseason is
played at the model's own per-matchup probabilities, so a bracket is no better
calibrated than the regular season it came from.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
import requests

from src.stat_sightline.standings.features import FEATURES, latest_form, matchup_features
from src.stat_sightline.standings.ingest import get_schedule, iter_games, today_et
from src.stat_sightline.standings.project import is_remaining, record_played

TEAMS_URL = "https://statsapi.mlb.com/api/v1/teams"

#: Drawn seasons. Five thousand holds a percentage point steady to about ±0.7,
#: which is the precision the table prints at.
# ponytail: fixed count, not a convergence check — raise it if the last digit
# is ever load-bearing.
SIMS = 5000

#: Clubs per league in the field, and how many of them skip the first round.
BERTHS = 6
BYES = 2
DIVISION_WINNERS = 3

#: Which club is at home for each game of a series, as MLB schedules them:
#: the wild-card round is played entirely at the higher seed, the division
#: series 2-2-1 and the two seven-game rounds 2-3-2.
HOME_PATTERN = {
    3: (True, True, True),
    5: (True, True, False, False, True),
    7: (True, True, False, False, False, True, True),
}


def get_divisions(season: int) -> dict[int, tuple[int, int, str, str]]:
    """team_id -> (league_id, division_id, club name, division name)."""
    res = requests.get(
        TEAMS_URL, params={"sportId": 1, "season": season}, timeout=60
    )
    res.raise_for_status()
    out: dict[int, tuple[int, int, str, str]] = {}
    for team in res.json().get("teams", []):
        league, division = team.get("league", {}), team.get("division", {})
        if not league.get("id") or not division.get("id"):
            continue
        out[int(team["id"])] = (
            int(league["id"]),
            int(division["id"]),
            team.get("teamName") or team.get("name", ""),
            division.get("nameShort") or division.get("name", ""),
        )
    return out


@dataclass
class Field:
    """One season reduced to arrays: who is playing whom, and how likely."""

    ids: np.ndarray            # (n,) MLB team ids, the column order throughout
    names: list[str]
    league: np.ndarray         # (n,) league id
    division: np.ndarray       # (n,) division id
    division_name: list[str]
    wins: np.ndarray           # (n,) games already won
    losses: np.ndarray
    home: np.ndarray           # (g,) column index of the home club
    away: np.ndarray           # (g,) column index of the away club
    p_home: np.ndarray         # (g,) model probability the home club wins
    matchup: np.ndarray        # (n, n) same, for any hypothetical pairing
    as_of: str | None

    @property
    def n(self) -> int:
        return len(self.ids)


def _score(bundle: dict, rows: list[dict]) -> np.ndarray:
    """Home win probability per feature row, in one batched call."""
    if not rows:
        return np.zeros(0)
    return bundle["clf"].predict_proba(pd.DataFrame(rows)[FEATURES])[:, 1]


def build_field(season: int, games: pd.DataFrame, bundle: dict) -> Field:
    """Everything a draw needs, resolved once: records, schedule, probabilities."""
    played, as_of = record_played(season, games)
    divisions = get_divisions(season)
    form = latest_form(games)

    # Only clubs the model can actually score — a club with no completed games
    # has no rolling form to build a matchup from.
    ids = sorted(tid for tid in divisions if tid in form.index)
    at = {tid: i for i, tid in enumerate(ids)}

    wins = np.array([played.get(t, {}).get("wins", 0) for t in ids], dtype=float)
    losses = np.array([played.get(t, {}).get("losses", 0) for t in ids], dtype=float)

    rows, pairs = [], []
    seen: set[int] = set()
    for game_date, game in iter_games(get_schedule(season)):
        if not is_remaining(game) or game["gamePk"] in seen:
            continue
        seen.add(game["gamePk"])
        h = game["teams"]["home"]["team"]["id"]
        a = game["teams"]["away"]["team"]["id"]
        if h not in at or a not in at:
            continue
        rows.append(matchup_features(form, h, a, game_date))
        pairs.append((at[h], at[a]))

    p_home = _score(bundle, rows)

    # Every pairing scored once, for the postseason games that have no date on
    # the schedule — 900 rows, against a per-series call inside every draw.
    today = pd.Timestamp(today_et())
    grid, cells = [], []
    for i, home in enumerate(ids):
        for j, away in enumerate(ids):
            if i == j:
                continue
            grid.append(matchup_features(form, home, away, today))
            cells.append((i, j))
    matchup = np.full((len(ids), len(ids)), 0.5)
    for (i, j), p in zip(cells, _score(bundle, grid)):
        matchup[i, j] = p

    return Field(
        ids=np.array(ids),
        names=[divisions[t][2] for t in ids],
        league=np.array([divisions[t][0] for t in ids]),
        division=np.array([divisions[t][1] for t in ids]),
        division_name=[divisions[t][3] for t in ids],
        wins=wins,
        losses=losses,
        home=np.array([p[0] for p in pairs], dtype=int),
        away=np.array([p[1] for p in pairs], dtype=int),
        p_home=np.asarray(p_home, dtype=float),
        matchup=matchup,
        as_of=as_of,
    )


def draw_seasons(field: Field, sims: int, rng: np.random.Generator) -> np.ndarray:
    """(sims, n) simulated final win totals.

    One draw per remaining game, shared by both clubs in it: the same coin that
    hands a win to one hands a loss to the other, which is what makes a race
    behave like a race rather than two independent walks.
    """
    total = np.repeat(field.wins[None, :], sims, axis=0)
    if len(field.home):
        home_won = rng.random((sims, len(field.home))) < field.p_home
        np.add.at(total.T, field.home, home_won.T.astype(float))
        np.add.at(total.T, field.away, (~home_won).T.astype(float))
    return total


def _series(rng, hi: int, lo: int, best_of: int, matchup: np.ndarray) -> int:
    """Play one series out. `hi` is the higher seed, which carries home field."""
    need = best_of // 2 + 1
    hi_wins = lo_wins = 0
    for at_home in HOME_PATTERN[best_of]:
        p = matchup[hi, lo] if at_home else 1.0 - matchup[lo, hi]
        if rng.random() < p:
            hi_wins += 1
        else:
            lo_wins += 1
        if hi_wins == need or lo_wins == need:
            break
    return hi if hi_wins == need else lo


def _seed(order: np.ndarray, league: np.ndarray, division: np.ndarray, lg: int) -> list[int]:
    """One league's six seeds, best first, off a single drawn season.

    `order` is every club's index sorted best-record-first with ties already
    broken, so "the best team left" is just the first one still unplaced.
    """
    in_league = [i for i in order if league[i] == lg]
    winners, seen = [], set()
    for i in in_league:
        if division[i] not in seen:
            seen.add(division[i])
            winners.append(i)
        if len(winners) == DIVISION_WINNERS:
            break
    wild = [i for i in in_league if i not in winners][: BERTHS - DIVISION_WINNERS]
    return winners + wild


def simulate(field: Field, sims: int = SIMS, seed: int = 0) -> dict[str, np.ndarray]:
    """Counts, per club, of the outcomes across `sims` drawn seasons."""
    rng = np.random.default_rng(seed)
    totals = draw_seasons(field, sims, rng)
    n = field.n
    leagues = sorted(set(field.league.tolist()))

    made = np.zeros(n)
    div = np.zeros(n)
    bye = np.zeros(n)
    ring = np.zeros(n)

    # The coin flip that settles a tie, drawn once per club per season so a
    # club can't be simultaneously ahead of and behind the same rival.
    jitter = rng.random((sims, n)) * 1e-6

    for s in range(sims):
        ranked = np.argsort(-(totals[s] + jitter[s]), kind="stable")
        champions = []
        for lg in leagues:
            seeds = _seed(ranked, field.league, field.division, lg)
            if len(seeds) < BERTHS:
                continue
            for i in seeds:
                made[i] += 1
            for i in seeds[:DIVISION_WINNERS]:
                div[i] += 1
            for i in seeds[:BYES]:
                bye[i] += 1

            # 3-6 and 4-5 in the wild-card round; the 1 seed then draws the
            # 4/5 winner and the 2 seed the 3/6 winner, MLB's own pairing.
            low = _series(rng, seeds[2], seeds[5], 3, field.matchup)
            high = _series(rng, seeds[3], seeds[4], 3, field.matchup)
            one = _series(rng, seeds[0], high, 5, field.matchup)
            two = _series(rng, seeds[1], low, 5, field.matchup)
            champions.append(_series(rng, *_rank(one, two, totals[s], jitter[s]), 7, field.matchup))

        if len(champions) == 2:
            a, b = _rank(champions[0], champions[1], totals[s], jitter[s])
            ring[_series(rng, a, b, 7, field.matchup)] += 1

    return {"made": made, "div": div, "bye": bye, "ring": ring, "totals": totals}


def _rank(a: int, b: int, totals: np.ndarray, jitter: np.ndarray) -> tuple[int, int]:
    """The pair, better record first — which is who gets home field."""
    return (a, b) if totals[a] + jitter[a] >= totals[b] + jitter[b] else (b, a)


def _rate(num: np.ndarray, den: int) -> np.ndarray:
    return np.round(num / den, 4) if den else np.zeros_like(num)


def playoff_odds(season: int, games: pd.DataFrame, bundle: dict, sims: int = SIMS) -> dict:
    """The odds table: one row per club, grouped by division by the caller."""
    field = build_field(season, games, bundle)
    out = simulate(field, sims)
    totals = out["totals"]

    played = field.wins + field.losses
    remaining = np.zeros(field.n)
    ros_wins = np.zeros(field.n)
    # Strength of what is left: the average quality of the opponents still to
    # be faced, measured as their own projected win rate.
    opp_sum = np.zeros(field.n)

    proj_w = totals.mean(axis=0)
    scheduled = played + np.bincount(
        np.concatenate([field.home, field.away]), minlength=field.n
    )
    proj_pct = np.divide(proj_w, scheduled, out=np.full(field.n, 0.5), where=scheduled > 0)

    for g in range(len(field.home)):
        h, a, p = field.home[g], field.away[g], field.p_home[g]
        remaining[h] += 1
        remaining[a] += 1
        ros_wins[h] += p
        ros_wins[a] += 1 - p
        opp_sum[h] += proj_pct[a]
        opp_sum[a] += proj_pct[h]

    ros = np.divide(ros_wins, remaining, out=np.full(field.n, 0.0), where=remaining > 0)
    sos = np.divide(opp_sum, remaining, out=np.full(field.n, 0.5), where=remaining > 0)

    # Games back, inside each division.
    gb = np.zeros(field.n)
    for d in set(field.division.tolist()):
        rows = np.flatnonzero(field.division == d)
        lead = rows[np.argmax(field.wins[rows] - field.losses[rows])]
        gb[rows] = (
            (field.wins[lead] - field.wins[rows]) + (field.losses[rows] - field.losses[lead])
        ) / 2

    made, div = _rate(out["made"], sims), _rate(out["div"], sims)
    bye, ring = _rate(out["bye"], sims), _rate(out["ring"], sims)
    teams = [
        {
            "team_id": int(field.ids[i]),
            "name": field.names[i],
            "league_id": int(field.league[i]),
            "division_id": int(field.division[i]),
            "division": field.division_name[i],
            "wins": int(field.wins[i]),
            "losses": int(field.losses[i]),
            "win_pct": round(
                float(field.wins[i] / played[i]) if played[i] else 0.0, 3
            ),
            "games_back": round(float(gb[i]), 1),
            "games_remaining": int(remaining[i]),
            "projected_wins": round(float(proj_w[i]), 1),
            "projected_losses": round(float(scheduled[i] - proj_w[i]), 1),
            "ros_win_pct": round(float(ros[i]), 3),
            "strength_of_schedule": round(float(sos[i]), 3),
            "win_division": float(div[i]),
            "clinch_bye": float(bye[i]),
            # A wild card is a berth that wasn't the division — the two add up
            # to making the playoffs at all, which is how the table reads.
            "clinch_wild_card": round(float(made[i] - div[i]), 4),
            "make_playoffs": float(made[i]),
            "win_world_series": float(ring[i]),
        }
        for i in range(field.n)
    ]
    teams.sort(key=lambda t: (-t["projected_wins"], -t["wins"]))
    return {
        "season": season,
        "as_of": field.as_of,
        "simulations": sims,
        "model": {**bundle.get("metrics", {}), "trained_at": bundle.get("trained_at")},
        "teams": teams,
    }

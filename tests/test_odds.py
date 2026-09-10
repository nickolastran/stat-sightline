"""Offline tests for the playoff-odds simulation (no network, no model file).

The invariants are the point. A drawn season has to hand out exactly twelve
berths, six division titles, four byes and one ring — if the seeding or the
bracket is wrong, those totals drift, and a table of plausible-looking
percentages is the one bug you cannot see by reading it.

Everything here builds a `Field` by hand, so nothing touches the MLB API or
the pickle.
"""
from __future__ import annotations

import numpy as np
import pytest

from src.stat_sightline.standings import odds


def _field(n_per_division: int = 5, remaining: int = 20, p: float = 0.5) -> odds.Field:
    """Two leagues, three divisions each, every club playing inside its own.

    Records are staggered so the seeding has something to sort, and every
    remaining game is a coin flip unless a test says otherwise.
    """
    ids, league, division, names, div_names = [], [], [], [], []
    tid = 100
    for lg in (103, 104):
        for d in range(3):
            for _ in range(n_per_division):
                ids.append(tid)
                league.append(lg)
                division.append(200 + (0 if lg == 103 else 3) + d)
                names.append(f"Club {tid}")
                div_names.append(f"{'AL' if lg == 103 else 'NL'} {d}")
                tid += 1
    n = len(ids)
    wins = np.array([80 - (i % n_per_division) * 4 for i in range(n)], dtype=float)

    rng = np.random.default_rng(1)
    home = rng.integers(0, n, remaining * n // 2)
    away = (home + 1 + rng.integers(0, n - 1, len(home))) % n  # never itself

    return odds.Field(
        ids=np.array(ids),
        names=names,
        league=np.array(league),
        division=np.array(division),
        division_name=div_names,
        wins=wins,
        losses=162 - wins - remaining,
        home=home,
        away=away,
        p_home=np.full(len(home), p),
        matchup=np.full((n, n), 0.5),
        as_of="2026-09-10",
    )


def test_every_drawn_season_fills_the_bracket_exactly():
    """Twelve berths, six division winners, four byes, one champion."""
    field = _field()
    sims = 400
    out = odds.simulate(field, sims=sims, seed=7)
    assert out["made"].sum() == pytest.approx(12 * sims)
    assert out["div"].sum() == pytest.approx(6 * sims)
    assert out["bye"].sum() == pytest.approx(4 * sims)
    assert out["ring"].sum() == pytest.approx(sims)


def test_a_bye_is_a_division_title_and_a_berth():
    """No club can take a bye it didn't win a division for, or a ring it
    didn't make the field for — the three are nested, not independent."""
    out = odds.simulate(_field(), sims=300, seed=3)
    assert np.all(out["bye"] <= out["div"] + 1e-9)
    assert np.all(out["div"] <= out["made"] + 1e-9)
    assert np.all(out["ring"] <= out["made"] + 1e-9)


def test_wins_and_losses_come_out_of_the_same_coin():
    """A drawn game hands a win to one club and nothing to the other, so a
    league's simulated wins total exactly the games actually played."""
    field = _field(remaining=20)
    totals = odds.draw_seasons(field, 50, np.random.default_rng(0))
    added = totals - field.wins
    assert added.sum(axis=1) == pytest.approx(np.full(50, float(len(field.home))))
    assert np.all(added >= 0)


def test_a_certain_schedule_is_drawn_certainly():
    """p=1 on every remaining game: the home club always wins it."""
    field = _field(remaining=10, p=1.0)
    totals = odds.draw_seasons(field, 5, np.random.default_rng(0))
    expected = field.wins + np.bincount(field.home, minlength=field.n)
    for row in totals:
        assert row == pytest.approx(expected)


def test_the_better_seed_carries_home_field():
    """A one-sided matchup resolves to the favourite whichever length is
    played — the series code must not lose track of which side is home."""
    sure = np.full((2, 2), 1.0)  # the home club always wins
    rng = np.random.default_rng(0)
    for best_of in (3, 5, 7):
        # Seed 0 hosts the majority of games, so it takes the series.
        assert odds._series(rng, 0, 1, best_of, sure) == 0


def test_a_series_cannot_run_past_its_length():
    """Best-of-N ends the moment somebody reaches N//2 + 1."""
    for best_of, pattern in odds.HOME_PATTERN.items():
        assert len(pattern) == best_of
        assert sum(pattern) > best_of // 2  # home field is worth having


def test_seeding_takes_division_winners_first():
    """A club with the third-best record in the league still seeds ahead of a
    100-win rival if it won its division and the rival didn't."""
    league = np.array([103] * 6)
    division = np.array([1, 1, 2, 2, 3, 3])
    # Index 0 and 1 are in one division; 1 is the best club in the league.
    order = np.array([1, 0, 2, 3, 4, 5])
    seeds = odds._seed(order, league, division, 103)
    assert seeds[:3] == [1, 2, 4], "one winner per division, best record first"
    assert set(seeds[3:]) == {0, 3, 5}, "the rest fill the wild cards"
    assert len(seeds) == odds.BERTHS

"""Leakage-safe rolling-form features for the standings model.

One row per game, framed home-vs-away with the target `home_win`, so the model
learns home-field advantage from the framing itself rather than a flag.

Every rolling stat is shift(1)-ed within its team (or pitcher) group, so a
game's features are built only from games strictly *before* it. That is what
makes a chronological holdout honest, and `tests/test_standings.py` asserts it
by truncating the future and checking past features are unchanged.

Pure pandas: no network, no database, so it unit-tests offline.
"""
from __future__ import annotations

import pandas as pd

ROLL = 30           # games in the rolling window
MIN_PERIODS = 5     # games before a rolling stat is reported at all

FEATURES = [
    "home_off", "home_def", "home_wpct", "home_rest", "home_sp_rest",
    "away_off", "away_def", "away_wpct", "away_rest", "away_sp_rest",
]


def _long(games: pd.DataFrame) -> pd.DataFrame:
    """Two rows per game — one per club — with runs scored, allowed, and won."""
    games = games.copy()
    games["date"] = pd.to_datetime(games["date"])
    sides = []
    for side, rs, ra in [("home", "home_score", "away_score"),
                         ("away", "away_score", "home_score")]:
        s = games[["game_pk", "date", f"{side}_id", rs, ra]].copy()
        s.columns = ["game_pk", "date", "team_id", "rs", "ra"]
        sides.append(s)
    long = (
        pd.concat(sides)
        .sort_values(["team_id", "date", "game_pk"])
        .reset_index(drop=True)
    )
    long["won"] = (long["rs"] > long["ra"]).astype(float)
    return long


def _form(long: pd.DataFrame, *, shifted: bool) -> pd.DataFrame:
    """Rolling form per team-game.

    shifted=True excludes the current game (training features); shifted=False
    includes it (current form, for projecting games not yet played).
    """
    def roll(s: pd.Series) -> pd.Series:
        if shifted:
            s = s.shift(1)
        return s.rolling(ROLL, min_periods=MIN_PERIODS).mean()

    out = long[["game_pk", "date", "team_id"]].copy()
    by_team = long.groupby("team_id")
    out["off"] = by_team["rs"].transform(roll)
    out["def"] = by_team["ra"].transform(roll)
    out["wpct"] = by_team["won"].transform(roll)
    out["rest"] = by_team["date"].diff().dt.days
    return out


def _starter_rest(games: pd.DataFrame) -> pd.DataFrame:
    """Days since each probable starter's previous start — a fatigue proxy.

    Left NaN when no starter was announced; the model's imputer absorbs that.
    """
    sides = []
    for side in ("home", "away"):
        s = games[["game_pk", "date", f"{side}_sp"]].copy()
        s.columns = ["game_pk", "date", "sp"]
        s["side"] = side
        sides.append(s)
    sp = pd.concat(sides)
    sp = sp[sp["sp"].fillna("") != ""].copy()
    sp["date"] = pd.to_datetime(sp["date"])
    sp = sp.sort_values(["sp", "date"])
    sp["sp_rest"] = sp.groupby("sp")["date"].diff().dt.days
    return sp[["game_pk", "side", "sp_rest"]]


def build_features(games: pd.DataFrame) -> pd.DataFrame:
    """Training frame: one row per game, FEATURES plus targets home_win/run_diff."""
    # The merges below key on game_pk, so a repeated one fans out into several
    # near-identical training rows — silent, and it inflates every metric.
    # ingest.dedupe() guarantees this; a games.csv from before it will not.
    if games["game_pk"].duplicated().any():
        raise ValueError(
            "duplicate game_pk in games.csv — re-run `python scripts/train_standings.py`"
        )

    form = _form(_long(games), shifted=True)
    starter_rest = _starter_rest(games)

    df = games.copy()
    df["date"] = pd.to_datetime(df["date"])
    for side in ("home", "away"):
        f = form.rename(columns={
            "team_id": f"{side}_id",
            "off": f"{side}_off",
            "def": f"{side}_def",
            "wpct": f"{side}_wpct",
            "rest": f"{side}_rest",
        })
        df = df.merge(f.drop(columns="date"), on=["game_pk", f"{side}_id"], how="left")
        r = starter_rest[starter_rest["side"] == side].rename(
            columns={"sp_rest": f"{side}_sp_rest"}
        )
        df = df.merge(r.drop(columns="side"), on="game_pk", how="left")

    df["home_win"] = (df["home_score"] > df["away_score"]).astype(int)
    df["run_diff"] = df["home_score"] - df["away_score"]
    # Early-season rows have no window yet and carry no signal; a missing
    # sp_rest is fine and stays in.
    return (
        df.dropna(subset=["home_off", "away_off"])
        .sort_values("date")
        .reset_index(drop=True)
    )


def latest_form(games: pd.DataFrame) -> pd.DataFrame:
    """Each club's form as of its most recent game, indexed by team_id.

    Unshifted on purpose: for a game that has not happened, every completed
    game is legitimately in the past.
    """
    form = _form(_long(games), shifted=False)
    return form.sort_values("date").groupby("team_id").tail(1).set_index("team_id")


def matchup_features(form: pd.DataFrame, home_id: int, away_id: int, game_date) -> dict:
    """Feature row for a game not yet played.

    Starter rest is NaN — projecting weeks ahead means the probables are not
    announced, so the model imputes it rather than inventing a rotation.
    """
    home, away = form.loc[home_id], form.loc[away_id]
    day = pd.Timestamp(game_date)
    return {
        "home_off": home["off"], "home_def": home["def"], "home_wpct": home["wpct"],
        "home_rest": (day - home["date"]).days, "home_sp_rest": float("nan"),
        "away_off": away["off"], "away_def": away["def"], "away_wpct": away["wpct"],
        "away_rest": (day - away["date"]).days, "away_sp_rest": float("nan"),
    }

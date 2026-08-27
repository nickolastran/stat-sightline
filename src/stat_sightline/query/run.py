"""Answer a parsed `Ask` against the Statcast warehouse.

The DB half of the query engine (parse.py is the pure half). Everything the
frontend renders — the headline number, its rank, the split bar, the game log
— comes out of the one filtered event set built in `_event_cte`, so a filter
can never mean one thing in the total and another in the log.
"""
from __future__ import annotations

import difflib
import unicodedata
from calendar import monthrange
from datetime import date, timedelta
from functools import lru_cache

from sqlalchemy import text

from src.stat_sightline.db.connection import get_engine
from src.stat_sightline.query.parse import STATS, TEAM_ALIASES, VENUE_ALIASES, Ask, parse

LOG_LIMIT = 200          # rows handed to the frontend; it windows from there
MIN_AB_FOR_RATE = 50     # qualifier for a batting-average leaderboard

# Plate appearances that don't count as an at-bat (batting-average denominator).
NON_AB_EVENTS = (
    "walk", "intent_walk", "hit_by_pitch", "sac_fly", "sac_bunt",
    "sac_fly_double_play", "sac_bunt_double_play", "catcher_interf",
    "truncated_pa",
)

TEAM_NAMES = {code: aliases[0].title() for code, aliases in TEAM_ALIASES.items()}


# ---------------------------------------------------------------------
# Name handling
# ---------------------------------------------------------------------

def _fold(s: str) -> str:
    """Lowercase and strip accents, so 'Martín' matches a typed 'martin'."""
    return "".join(
        c for c in unicodedata.normalize("NFKD", s.lower()) if not unicodedata.combining(c)
    )


def display_name(stored: str | None) -> str:
    """'Verlander, Justin' -> 'Justin Verlander'."""
    if not stored:
        return "Unknown"
    last, _, first = stored.partition(", ")
    return f"{first} {last}".strip() if first else last


@lru_cache(maxsize=1)
def _roster() -> list[dict]:
    """Every player with their batting/pitching workload, for name matching.

    ponytail: cached for the process lifetime — a fresh ETL needs an API
    restart to show up. Swap in an mtime/row-count cache key if loads get
    frequent enough to notice.
    """
    sql = text("""
        SELECT pl.player_id, pl.full_name,
               COALESCE(b.n, 0) AS bat_n, COALESCE(t.n, 0) AS pit_n
        FROM savant.players pl
        LEFT JOIN (SELECT batter  AS id, COUNT(*) n FROM savant.pitches GROUP BY 1) b
               ON b.id = pl.player_id
        LEFT JOIN (SELECT pitcher AS id, COUNT(*) n FROM savant.pitches GROUP BY 1) t
               ON t.id = pl.player_id
        WHERE pl.full_name IS NOT NULL
    """)
    with get_engine().connect() as conn:
        rows = [dict(r) for r in conn.execute(sql).mappings()]
    for r in rows:
        r["display"] = display_name(r["full_name"])
        r["folded"] = _fold(r["display"])
        r["last"] = _fold(r["full_name"].partition(",")[0])
    return rows


def resolve_player(name: str) -> tuple[dict | None, list[str]]:
    """Match typed text to one player. Returns (player, suggestions).

    Substring first (people type last names), then a fuzzy pass for typos.
    Ties break on workload — the Ohtani everyone means is the one with the
    plate appearances.
    """
    q = _fold(name)
    roster = _roster()
    if not q or not roster:
        return None, []

    hits = [r for r in roster if r["folded"] == q or r["last"] == q]
    if not hits:
        hits = [r for r in roster if q in r["folded"]]
    if not hits:
        close = set(difflib.get_close_matches(q, [r["folded"] for r in roster], n=5, cutoff=0.72))
        close |= set(difflib.get_close_matches(q, [r["last"] for r in roster], n=5, cutoff=0.8))
        hits = [r for r in roster if r["folded"] in close or r["last"] in close]
    if not hits:
        return None, []

    hits.sort(key=lambda r: r["bat_n"] + r["pit_n"], reverse=True)
    return hits[0], [r["display"] for r in hits[1:6]]


def suggest(name: str) -> list[str]:
    """Closest names to text that matched nobody — the 'did you mean' list."""
    roster = _roster()
    close = difflib.get_close_matches(_fold(name), [r["folded"] for r in roster], n=5, cutoff=0.5)
    by_folded = {r["folded"]: r["display"] for r in roster}
    return [by_folded[c] for c in close]


def resolve_subject(name: str) -> dict | None:
    """A subject is a club if the text names one, otherwise a player."""
    folded = _fold(name)
    for code, aliases in TEAM_ALIASES.items():
        if folded in aliases:
            return {"kind": "team", "id": code, "display": TEAM_NAMES[code]}
    player, _ = resolve_player(name)
    if player:
        return {"kind": "player", "id": player["player_id"], "display": player["display"],
                "bat_n": player["bat_n"], "pit_n": player["pit_n"]}
    return None


# ---------------------------------------------------------------------
# SQL assembly
# ---------------------------------------------------------------------

def _value_exprs(stat: str) -> tuple[str, str]:
    """(numerator, denominator) SQL for one stat, over an `ev` row."""
    spec = STATS[stat]
    if spec.get("sum") == "rbi":
        # Runs that crossed on the play. Differs from official RBI when a run
        # scores on an error or a double play — no bookkeeping column for that.
        return "COALESCE(rbi, 0)", "1"
    num = "(CASE WHEN events = ANY(:events) THEN 1 ELSE 0 END)"
    if spec.get("rate"):
        return num, "(CASE WHEN events = ANY(:non_ab) THEN 0 ELSE 1 END)"
    return num, "1"


def _event_cte(
    ask: Ask, role: str, subject: dict | None, team: dict | None = None
) -> tuple[str, dict]:
    """The filtered event set. Every downstream query selects from `evf`.

    `team` narrows to one club independently of `subject`, which is what
    "best home runs by yankees hitters" needs: a leaderboard, scoped.
    """
    num, den = _value_exprs(ask.stat)
    # The subject's own club and the hand it faced flip with the role.
    mine, theirs = ("bat_team", "fld_team") if role == "batter" else ("fld_team", "bat_team")
    opp_hand = "p_throws" if role == "batter" else "stand"

    where = ["pi.events IS NOT NULL", "g.game_type = :game_type"]
    params: dict = {"game_type": ask.game_type}

    if subject and subject["kind"] == "player":
        where.append(f"pi.{role} = :subject_id")
        params["subject_id"] = subject["id"]
    if ask.season:
        where.append("g.game_year = :season")
        params["season"] = ask.season
    if ask.date_from:
        where.append("pi.game_date >= :date_from")
        params["date_from"] = ask.date_from
    if ask.date_to:
        where.append("pi.game_date <= :date_to")
        params["date_to"] = ask.date_to
    if ask.venue:
        where.append("g.home_team = :venue")
        params["venue"] = ask.venue
    if ask.vs_hand:
        where.append(f"pi.{opp_hand} = :vs_hand")
        params["vs_hand"] = ask.vs_hand
    params["events"] = list(STATS[ask.stat]["events"] or ())
    params["non_ab"] = list(NON_AB_EVENTS)

    cte = f"""
        WITH ev AS (
            SELECT pi.game_pk, pi.game_date, pi.batter, pi.pitcher, pi.events,
                   pi.des, pi.inning, pi.inning_topbot, pi.stand, pi.p_throws,
                   pi.launch_speed, pi.launch_angle, pi.hit_distance_sc,
                   g.home_team, g.away_team,
                   CASE WHEN pi.inning_topbot = 'Top' THEN g.away_team ELSE g.home_team END AS bat_team,
                   CASE WHEN pi.inning_topbot = 'Top' THEN g.home_team ELSE g.away_team END AS fld_team,
                   CASE WHEN pi.inning_topbot = 'Top'
                        THEN pi.post_away_score - pi.away_score
                        ELSE pi.post_home_score - pi.home_score END AS rbi
            FROM savant.pitches pi
            JOIN savant.games g ON g.game_pk = pi.game_pk
            WHERE {' AND '.join(where)}
        ),
        ev2 AS (
            SELECT *, {mine} AS my_team, {theirs} AS opp_team,
                   ({mine} = home_team) AS is_home,
                   {opp_hand} AS opp_hand,
                   {num} AS val, {den} AS den
            FROM ev
        ),
        evf AS (SELECT * FROM ev2 WHERE TRUE
    """
    # Filters that need my_team/opp_team, so they live one level down.
    if ask.opponent:
        cte += " AND opp_team = :opponent"
        params["opponent"] = ask.opponent
    if ask.home_away:
        cte += " AND is_home = :want_home"
        params["want_home"] = ask.home_away == "home"
    scope = team or (subject if subject and subject["kind"] == "team" else None)
    if scope:
        cte += " AND my_team = :subject_team"
        params["subject_team"] = scope["id"]
    cte += ")"
    return cte, params


def _fmt(stat: str, total: float, denom: float) -> tuple[float, str]:
    """(machine value, display string) for the headline number."""
    if STATS[stat].get("rate"):
        v = round(total / denom, 3) if denom else 0.0
        return v, f"{v:.3f}".lstrip("0") or ".000"
    v = int(total or 0)
    return v, f"{v:,}"


# ---------------------------------------------------------------------
# The queries
# ---------------------------------------------------------------------

def _totals(conn, cte: str, params: dict) -> dict:
    row = conn.execute(text(cte + """
        SELECT COALESCE(SUM(val), 0)                              AS total,
               COALESCE(SUM(den), 0)                              AS denom,
               COALESCE(SUM(val) FILTER (WHERE is_home), 0)       AS home,
               COALESCE(SUM(val) FILTER (WHERE NOT is_home), 0)   AS road,
               COALESCE(SUM(val) FILTER (WHERE opp_hand = 'L'), 0) AS vs_lhp,
               COALESCE(SUM(val) FILTER (WHERE opp_hand = 'R'), 0) AS vs_rhp,
               COUNT(DISTINCT game_pk)                            AS games,
               MIN(game_date) AS first_date, MAX(game_date) AS last_date
        FROM evf
    """), params).mappings().one()
    return dict(row)


def _game_log(conn, cte: str, params: dict, role: str) -> tuple[list[dict], bool]:
    """Every event that contributed, newest first, with its game context."""
    other = "pitcher" if role == "batter" else "batter"
    rows = conn.execute(text(cte + f"""
        SELECT evf.game_pk, evf.game_date, evf.my_team, evf.opp_team, evf.is_home,
               evf.home_team, evf.inning, evf.events, evf.des, evf.val,
               evf.launch_speed, evf.launch_angle, evf.hit_distance_sc,
               evf.opp_hand, evf.{other} AS other_id, pl.full_name AS other_name
        FROM evf
        LEFT JOIN savant.players pl ON pl.player_id = evf.{other}
        WHERE evf.val > 0
        ORDER BY evf.game_date DESC, evf.inning DESC
        LIMIT :log_limit
    """), {**params, "log_limit": LOG_LIMIT + 1}).mappings().all()

    truncated = len(rows) > LOG_LIMIT
    rows = rows[:LOG_LIMIT]
    if not rows:
        return [], False

    finals = {
        r["game_pk"]: (r["h"], r["a"])
        for r in conn.execute(
            text("""SELECT game_pk, MAX(post_home_score) AS h, MAX(post_away_score) AS a
                    FROM savant.pitches WHERE game_pk = ANY(:pks) GROUP BY game_pk"""),
            {"pks": [r["game_pk"] for r in rows]},
        ).mappings()
    }

    log = []
    for r in rows:
        home_runs_, away_runs_ = finals.get(r["game_pk"], (None, None))
        mine = home_runs_ if r["is_home"] else away_runs_
        theirs = away_runs_ if r["is_home"] else home_runs_
        result = None
        if mine is not None and theirs is not None:
            result = f"{'W' if mine > theirs else 'L' if mine < theirs else 'T'} {mine}-{theirs}"
        log.append({
            "date": r["game_date"],
            "day_of_week": r["game_date"].strftime("%a").upper(),
            "game_pk": r["game_pk"],
            "team": r["my_team"],
            "opponent": r["opp_team"],
            "is_home": r["is_home"],
            "venue_team": r["home_team"],
            "result": result,
            "inning": r["inning"],
            "event": (r["events"] or "").replace("_", " "),
            "detail": r["des"],
            "count": int(r["val"]),
            "other_id": r["other_id"],
            "other_name": display_name(r["other_name"]),
            "other_hand": r["opp_hand"],
            "launch_speed": r["launch_speed"],
            "launch_angle": r["launch_angle"],
            "distance": r["hit_distance_sc"],
        })
    return log, truncated


def _leaderboard(
    conn, ask: Ask, role: str, limit: int = 10, team: dict | None = None
) -> list[dict]:
    """Same filters, every player — the comparative answer and the rank source."""
    cte, params = _event_cte(ask, role, None, team=team)
    rate = STATS[ask.stat].get("rate")
    # A rate needs a qualifier, or one 1-for-1 day tops the batting title.
    having = f"HAVING SUM(evf.den) >= {MIN_AB_FOR_RATE}" if rate else ""
    order = (
        "SUM(evf.val) / NULLIF(SUM(evf.den), 0)" if rate else "SUM(evf.val)"
    )
    rows = conn.execute(text(cte + f"""
        SELECT evf.{role} AS player_id, pl.full_name,
               SUM(evf.val) AS total, SUM(evf.den) AS denom
        FROM evf JOIN savant.players pl ON pl.player_id = evf.{role}
        GROUP BY evf.{role}, pl.full_name
        {having}
        ORDER BY {order} DESC NULLS LAST
    """), params).mappings().all()

    out = []
    for i, r in enumerate(rows, start=1):
        value, display = _fmt(ask.stat, float(r["total"]), float(r["denom"]))
        out.append({"rank": i, "player_id": r["player_id"],
                    "name": display_name(r["full_name"]), "value": value, "display": display})
    return out[:limit] if limit else out


def _ordinal(n: int) -> str:
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _describe(ask: Ask, role: str) -> tuple[str, list[str]]:
    """Human labels for the timeframe and the active filters."""
    if ask.date_from or ask.date_to:
        timeframe = f"{ask.date_from or '…'} → {ask.date_to or '…'}"
    else:
        timeframe = f"{ask.season} Season" if ask.season else "All Seasons On Record"
    if ask.game_type == "S":
        timeframe += " (Spring Training)"

    filters = []
    if ask.venue:
        filters.append(f"at {VENUE_ALIASES[ask.venue][0].title()}")
    if ask.home_away:
        filters.append("home games" if ask.home_away == "home" else "road games")
    if ask.opponent:
        filters.append(f"vs {TEAM_NAMES[ask.opponent]}")
    if ask.vs_hand:
        side = "left" if ask.vs_hand == "L" else "right"
        filters.append(f"vs {side}-handed {'pitching' if role == 'batter' else 'batters'}")
    return timeframe, filters


# ---------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------

def answer(question: str, today: date | None = None) -> dict:
    """Question in, StatMuse-shaped payload out."""
    ask = parse(question, today=today)
    spec = STATS[ask.stat]
    out: dict = {
        "query": ask.raw, "query_type": "player_stat", "answer": None,
        "comparison": [], "game_log": [], "truncated": False,
        "summary_stats": None, "notes": list(ask.notes), "suggestions": [],
        "data_through": None,
    }
    if spec.get("unsupported"):
        out["notes"].append(f"{spec['label']}: {spec['unsupported']}.")
        return out

    with get_engine().connect() as conn:
        out["data_through"] = conn.execute(
            text("SELECT MAX(game_date) FROM savant.pitches")
        ).scalar()

        # Relative windows resolve against the data, not the wall clock: in a
        # warehouse that stops in September, "last 30 days" means the last 30
        # days *played*, and "in july" means the July that's loaded.
        if ask.season is None and not ask.all_seasons:
            ask.season = conn.execute(
                text("SELECT MAX(game_year) FROM savant.games WHERE game_type = :gt"),
                {"gt": ask.game_type},
            ).scalar()
        if ask.month:
            year = ask.season or (out["data_through"] or date.today()).year
            ask.date_from = date(year, ask.month, 1)
            ask.date_to = date(year, ask.month, monthrange(year, ask.month)[1])
        if ask.last_days and out["data_through"]:
            ask.date_from = out["data_through"] - timedelta(days=ask.last_days)
            ask.season = None   # the window is the timeframe, not the season

        subjects = []
        for name in ask.subjects:
            found = resolve_subject(name)
            if found:
                subjects.append(found)
            else:
                out["notes"].append(f"couldn't find “{name}” in the warehouse")
                out["suggestions"] += suggest(name)
        if not subjects and not ask.leaderboard:
            return out

        # Role: an explicit cue wins, otherwise whoever the subject mostly is.
        role = ask.role
        if role is None:
            player = next((s for s in subjects if s["kind"] == "player"), None)
            role = "pitcher" if player and player["pit_n"] > player["bat_n"] else "batter"
        timeframe, filters = _describe(ask, role)

        # ── leaderboard, optionally scoped to one club ─────────────────
        club = next((s for s in subjects if s["kind"] == "team"), None)
        if not subjects or (ask.leaderboard and club):
            out["query_type"] = "comparative"
            board = _leaderboard(conn, ask, role, team=club)
            if not board:
                out["notes"].append("no plays match those filters")
                return out
            out["comparison"] = board
            top = board[0]
            out["answer"] = {
                "value": top["value"], "display": top["display"], "label": spec["label"],
                "subject": top["name"], "subject_id": top["player_id"], "subject_kind": "player",
                "role": role, "timeframe": timeframe,
                "filters": filters + ([club["display"]] if club else []), "rank": "1st",
            }
            single = Ask(**{**ask.__dict__, "subjects": []})
            cte, params = _event_cte(
                single, role, {"kind": "player", "id": top["player_id"]}, team=club
            )
            out["summary_stats"] = _summary(_totals(conn, cte, params))
            out["game_log"], out["truncated"] = _game_log(conn, cte, params, role)
            return out

        # ── one or more named subjects ────────────────────────────────
        if len(subjects) > 1:
            out["query_type"] = "comparative"
        elif subjects[0]["kind"] == "team":
            out["query_type"] = "team_stat"

        for subject in subjects:
            cte, params = _event_cte(ask, role, subject)
            totals = _totals(conn, cte, params)
            value, display = _fmt(ask.stat, float(totals["total"]), float(totals["denom"]))
            entry = {
                "value": value, "display": display, "label": spec["label"],
                "subject": subject["display"], "subject_id":
                    subject["id"] if subject["kind"] == "player" else None,
                "subject_kind": subject["kind"], "role": role,
                "timeframe": timeframe, "filters": filters, "rank": None,
            }
            if out["answer"] is None:
                out["answer"] = entry
                out["summary_stats"] = _summary(totals)
                out["game_log"], out["truncated"] = _game_log(conn, cte, params, role)
            out["comparison"].append(entry)

        # Rank only makes sense for a single player against the same filters.
        if len(subjects) == 1 and subjects[0]["kind"] == "player":
            board = _leaderboard(conn, ask, role, limit=0)
            spot = next((r for r in board if r["player_id"] == subjects[0]["id"]), None)
            if spot and spot["value"]:
                out["answer"]["rank"] = f"{_ordinal(spot['rank'])} of {len(board)}"

        if out["answer"] and out["answer"]["value"] == 0:
            out["notes"].append("no plays match those filters — try widening them")
    return out


def _summary(totals: dict) -> dict:
    return {
        "total": int(totals["total"] or 0),
        "denom": int(totals["denom"] or 0),
        "home": int(totals["home"] or 0),
        "road": int(totals["road"] or 0),
        "vs_lhp": int(totals["vs_lhp"] or 0),
        "vs_rhp": int(totals["vs_rhp"] or 0),
        "games": int(totals["games"] or 0),
        "first_date": totals["first_date"],
        "last_date": totals["last_date"],
    }

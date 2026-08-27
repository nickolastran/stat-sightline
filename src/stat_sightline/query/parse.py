"""Natural-language baseball question -> a structured `Ask` over the warehouse.

Pure module: no network, no DB, so the vocabulary and every parse rule is
unit-testable offline. Mirrors the split etl/clean.py keeps from etl/load.py —
this file decides *what* was asked, query/run.py answers it.

The parser is deliberately a keyword consumer, not a grammar: it strips the
spans it recognises (time window, venue, opponent, stat, role) and whatever
text survives is the subject to look up. That handles the phrasings people
actually type ("ohtani homers against giants") without a parse tree.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

# ---------------------------------------------------------------------
# Vocabulary
# ---------------------------------------------------------------------

# Statcast club codes (savant.games.home_team) -> the aliases people type.
TEAM_ALIASES: dict[str, tuple[str, ...]] = {
    "ATH": ("athletics", "a's", "as", "oakland", "oak", "ath"),
    "ATL": ("braves", "atlanta", "atl"),
    "AZ":  ("diamondbacks", "d-backs", "dbacks", "arizona", "ari", "az"),
    "BAL": ("orioles", "o's", "baltimore", "bal"),
    "BOS": ("red sox", "boston", "bos"),
    "CHC": ("cubs", "chicago cubs", "chc"),
    "CIN": ("reds", "cincinnati", "cin"),
    "CLE": ("guardians", "indians", "cleveland", "cle"),
    "COL": ("rockies", "colorado", "col"),
    "CWS": ("white sox", "chicago white sox", "cws", "chw"),
    "DET": ("tigers", "detroit", "det"),
    "HOU": ("astros", "houston", "hou"),
    "KC":  ("royals", "kansas city", "kc", "kcr"),
    "LAA": ("angels", "anaheim", "laa"),
    "LAD": ("dodgers", "los angeles dodgers", "lad"),
    "MIA": ("marlins", "miami", "mia"),
    "MIL": ("brewers", "milwaukee", "mil"),
    "MIN": ("twins", "minnesota", "min"),
    "NYM": ("mets", "new york mets", "nym"),
    "NYY": ("yankees", "yanks", "new york yankees", "nyy"),
    "PHI": ("phillies", "phils", "philadelphia", "phi"),
    "PIT": ("pirates", "bucs", "pittsburgh", "pit"),
    "SD":  ("padres", "san diego", "sd", "sdp"),
    "SEA": ("mariners", "seattle", "sea"),
    "SF":  ("giants", "san francisco", "sf", "sfg"),
    "STL": ("cardinals", "cards", "st louis", "st. louis", "stl"),
    "TB":  ("rays", "tampa bay", "tampa", "tb", "tbr"),
    "TEX": ("rangers", "texas", "tex"),
    "TOR": ("blue jays", "jays", "toronto", "tor"),
    "WSH": ("nationals", "nats", "washington", "wsh", "was"),
}

# Ballpark -> the club that hosts there. The warehouse has no venue column;
# a park is exactly "the home team's games", which games.home_team already is.
VENUE_ALIASES: dict[str, tuple[str, ...]] = {
    "ATH": ("oakland coliseum", "sutter health park"),
    "ATL": ("truist park",),
    "AZ":  ("chase field",),
    "BAL": ("camden yards", "oriole park"),
    "BOS": ("fenway park", "fenway"),
    "CHC": ("wrigley field", "wrigley"),
    "CIN": ("great american ball park",),
    "CLE": ("progressive field",),
    "COL": ("coors field", "coors"),
    "CWS": ("guaranteed rate field", "rate field", "comiskey"),
    "DET": ("comerica park",),
    "HOU": ("minute maid park", "daikin park"),
    "KC":  ("kauffman stadium", "the k"),
    "LAA": ("angel stadium",),
    "LAD": ("dodger stadium", "chavez ravine"),
    "MIA": ("loandepot park", "marlins park"),
    "MIL": ("american family field", "miller park"),
    "MIN": ("target field",),
    "NYM": ("citi field",),
    "NYY": ("yankee stadium",),
    "PHI": ("citizens bank park",),
    "PIT": ("pnc park",),
    "SD":  ("petco park", "petco"),
    "SEA": ("t-mobile park", "safeco field"),
    "SF":  ("oracle park", "oracle", "at&t park"),
    "STL": ("busch stadium", "busch"),
    "TB":  ("tropicana field", "the trop", "steinbrenner field"),
    "TEX": ("globe life field",),
    "TOR": ("rogers centre", "skydome"),
    "WSH": ("nationals park",),
}

# Terminal `events` values behind each supported stat. `None` marks a stat we
# recognise but cannot answer from a pitch table — better a straight "no" than
# a wrong number (stolen bases and runs scored are not terminal PA events).
HIT_EVENTS = ("single", "double", "triple", "home_run")

STATS: dict[str, dict] = {
    "home_run":       {"label": "Home Runs",       "events": ("home_run",)},
    "hit":            {"label": "Hits",            "events": HIT_EVENTS},
    "single":         {"label": "Singles",         "events": ("single",)},
    "double":         {"label": "Doubles",         "events": ("double",)},
    "triple":         {"label": "Triples",         "events": ("triple",)},
    "extra_base_hit": {"label": "Extra-Base Hits", "events": ("double", "triple", "home_run")},
    "strikeout":      {"label": "Strikeouts",      "events": ("strikeout", "strikeout_double_play")},
    "walk":           {"label": "Walks",           "events": ("walk", "intent_walk")},
    "rbi":            {"label": "RBI",             "events": None, "sum": "rbi"},
    "batting_average": {"label": "Batting Average", "events": HIT_EVENTS, "rate": True},
    "stolen_base":    {"label": "Stolen Bases",    "events": None, "unsupported":
                       "stolen bases aren't a plate-appearance outcome, so the pitch warehouse can't count them"},
    "run":            {"label": "Runs Scored",     "events": None, "unsupported":
                       "runs scored aren't tied to a batter's plate appearance here — ask for RBI instead"},
    "era":            {"label": "ERA",             "events": None, "unsupported":
                       "ERA needs innings pitched and earned-run bookkeeping, which the pitch table doesn't carry"},
}

# Longest phrase first so "extra base hits" wins over "hits".
STAT_ALIASES: tuple[tuple[str, str], ...] = (
    ("extra base hits", "extra_base_hit"), ("extra-base hits", "extra_base_hit"),
    ("extra base hit", "extra_base_hit"), ("xbh", "extra_base_hit"),
    ("batting average", "batting_average"), ("avg", "batting_average"),
    ("average", "batting_average"),
    ("ba", "batting_average"),
    ("home runs", "home_run"), ("home run", "home_run"), ("homers", "home_run"),
    ("homer", "home_run"), ("dingers", "home_run"), ("dinger", "home_run"),
    ("long balls", "home_run"), ("hr", "home_run"), ("hrs", "home_run"),
    ("runs batted in", "rbi"), ("rbis", "rbi"), ("rbi", "rbi"),
    ("stolen bases", "stolen_base"), ("stolen base", "stolen_base"),
    ("steals", "stolen_base"), ("sb", "stolen_base"),
    ("strikeouts", "strikeout"), ("strikeout", "strikeout"),
    ("punchouts", "strikeout"), ("whiffs", "strikeout"),
    ("ks", "strikeout"), ("k", "strikeout"),
    ("walks", "walk"), ("walk", "walk"), ("bb", "walk"),
    ("base on balls", "walk"),
    ("doubles", "double"), ("double", "double"),
    ("triples", "triple"), ("triple", "triple"),
    ("singles", "single"), ("single", "single"),
    ("era", "era"),
    ("hits", "hit"), ("hit", "hit"),
    ("runs", "run"), ("run", "run"),
)

MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11,
    "december": 12,
}

# Question scaffolding that carries no filter — dropped before the residual
# text is treated as a name.
STOPWORDS = frozenset("""
a an and any all as at by did do does for from get give given had has have how
in into is it its many me much of off on or show many the their there this
those to total up was were what when which who whom whose with
against versus vs season seasons year years game games did-he he she they
number count stats stat splits log logs record records
""".split())

ROLE_PITCHER_CUES = (
    "allowed by", "given up by", "surrendered by", "thrown by", "pitched by",
    "as a pitcher", "pitching", "pitchers",
)
ROLE_BATTER_CUES = (
    "hit by", "as a hitter", "as a batter", "batting", "hitting",
    "hitters", "batters", "sluggers",
)

LEADER_CUES = ("most", "top", "leaders", "leaderboard", "best", "who has", "who hit", "who led")

# Stat words double as verbs ("did ohtani *hit*"), so a second copy left in the
# residual is scaffolding, never part of a name.
STAT_WORDS = frozenset(a for a, _ in STAT_ALIASES if " " not in a)


@dataclass
class Ask:
    """One parsed question. Every field is a filter query/run.py applies."""

    raw: str
    stat: str = "home_run"
    subjects: list[str] = field(default_factory=list)  # residual text to resolve
    role: str | None = None            # 'batter' | 'pitcher' | None = infer from data
    opponent: str | None = None        # club code the subject faced
    venue: str | None = None           # club code whose park hosted
    home_away: str | None = None       # 'home' | 'away' for the subject's club
    season: int | None = None          # None = latest season on record
    date_from: date | None = None
    date_to: date | None = None
    month: int | None = None           # "in july" — the year comes from the data
    last_days: int | None = None       # "last 30 days" — counted back from the
                                       # newest game on record, not from today
    vs_hand: str | None = None         # opposing hand, 'L' | 'R'
    game_type: str = "R"
    all_seasons: bool = False    # "career" — otherwise the latest season on record
    leaderboard: bool = False
    notes: list[str] = field(default_factory=list)


def _strip(text: str, phrase: str) -> str:
    """Remove one whole-word occurrence of `phrase`, leaving a space behind."""
    return re.sub(rf"(?<!\w){re.escape(phrase)}(?!\w)", " ", text, count=1)


def _find_club(text: str, table: dict[str, tuple[str, ...]]) -> tuple[str, str] | None:
    """Longest alias in `table` that appears in `text` -> (code, alias)."""
    best: tuple[str, str] | None = None
    for code, aliases in table.items():
        for alias in aliases:
            if re.search(rf"(?<!\w){re.escape(alias)}(?!\w)", text) and (
                best is None or len(alias) > len(best[1])
            ):
                best = (code, alias)
    return best


def parse(question: str, today: date | None = None) -> Ask:
    """Parse a question into an `Ask`. Never raises — unknowns become notes."""
    today = today or date.today()
    ask = Ask(raw=question.strip())
    t = " " + re.sub(r"[^\w\s'&.\-]", " ", question.lower()) + " "
    t = re.sub(r"\s+", " ", t)

    # ── time window ────────────────────────────────────────────────────
    for cue in ("career", "all time", "all-time", "all seasons", "ever", "lifetime"):
        if cue in t:
            ask.all_seasons = True
            t = _strip(t, cue)
            break
    if m := re.search(r"(?<!\w)(19|20)\d{2}(?!\w)", t):
        ask.season = int(m.group(0))
        t = t[: m.start()] + " " + t[m.end():]
    if m := re.search(r"last (\d+) days", t):
        ask.last_days = int(m.group(1))
        t = _strip(t, m.group(0))
    for name, num in MONTHS.items():
        if re.search(rf"(?<!\w)(in|during) {name}(?!\w)", t):
            ask.month = num
            t = _strip(t, name)
            break
    if "postseason" in t or "playoffs" in t:
        ask.notes.append("postseason isn't in the warehouse — answering over the regular season")
        t = _strip(_strip(t, "postseason"), "playoffs")
    if "spring training" in t:
        ask.game_type = "S"
        t = _strip(t, "spring training")

    # ── opposing handedness ────────────────────────────────────────────
    for cue, hand in (
        ("lefties", "L"), ("left-handers", "L"), ("left handed", "L"),
        ("left-handed", "L"), ("lhp", "L"), ("southpaws", "L"),
        ("righties", "R"), ("right-handers", "R"), ("right handed", "R"),
        ("right-handed", "R"), ("rhp", "R"),
    ):
        if cue in t:
            ask.vs_hand = hand
            t = _strip(t, cue)
            break

    # ── venue ──────────────────────────────────────────────────────────
    if hit := _find_club(t, VENUE_ALIASES):
        ask.venue, alias = hit
        t = _strip(t, alias)
        t = _strip(t, "stadium")  # "…stadium"/"…park" leftovers, harmless if absent
        t = _strip(t, "park")
    elif " at home " in t or " home games " in t:
        ask.home_away = "home"
        t = _strip(_strip(t, "at home"), "home games")
    elif " on the road " in t or " away games " in t or " road games " in t:
        ask.home_away = "away"
        for p in ("on the road", "away games", "road games"):
            t = _strip(t, p)

    # ── opponent / "at <club>" ─────────────────────────────────────────
    # "at the giants" is a venue (their park); "vs the giants" is an opponent.
    if m := re.search(r"(?<!\w)(at|in) (the )?([\w'&.\- ]{2,24}?)(?=\s|$)", t):
        if (hit := _find_club(" " + m.group(3) + " ", TEAM_ALIASES)) and ask.venue is None:
            ask.venue = hit[0]
            t = _strip(_strip(t, hit[1]), m.group(1))
    if m := re.search(r"(?<!\w)(vs\.?|versus|against|facing) (the )?([\w'&.\- ]{2,24}?)(?=\s|$)", t):
        if hit := _find_club(" " + m.group(3) + " ", TEAM_ALIASES):
            ask.opponent = hit[0]
            t = _strip(_strip(t, hit[1]), m.group(1))

    # ── stat ───────────────────────────────────────────────────────────
    for alias, key in STAT_ALIASES:
        if re.search(rf"(?<!\w){re.escape(alias)}(?!\w)", t):
            ask.stat = key
            t = _strip(t, alias)
            break
    else:
        ask.notes.append("no stat named in the question — showing home runs")

    # ── role ───────────────────────────────────────────────────────────
    for cue in ROLE_PITCHER_CUES:
        if cue in t:
            ask.role = "pitcher"
            t = _strip(t, cue)
            break
    else:
        for cue in ROLE_BATTER_CUES:
            if cue in t:
                ask.role = "batter"
                t = _strip(t, cue)
                break

    # ── leaderboard vs. a named subject ────────────────────────────────
    for cue in LEADER_CUES:
        if cue in t:
            ask.leaderboard = True
            t = _strip(t, cue)
            break

    # ── residual = the subject(s) ──────────────────────────────────────
    # Split on a *surviving* "vs" — the team-opponent case already consumed
    # its own, so anything left separates two people ("judge vs ohtani").
    for part in re.split(r"(?<!\w)(?:vs\.?|versus|compared to|and)(?!\w)", t):
        words = [
            w for w in part.split()
            if w not in STOPWORDS and w not in STAT_WORDS and not w.isdigit()
        ]
        name = " ".join(words).strip(" .-'")
        if name:
            ask.subjects.append(name)
    if not ask.subjects and not ask.leaderboard:
        ask.leaderboard = True  # "most home runs at fenway" style, no name given

    return ask


def demo() -> None:
    """Self-check: the phrasings the parser has to get right."""
    a = parse("how many home runs did ohtani hit in dodger stadium this year")
    assert a.stat == "home_run" and a.venue == "LAD" and a.subjects == ["ohtani"], a

    a = parse("ohtani homers against giants")
    assert a.stat == "home_run" and a.opponent == "SF" and a.subjects == ["ohtani"], a

    a = parse("ohtani vs dodger stadium 2024 strikeouts")
    assert a.stat == "strikeout" and a.venue == "LAD" and a.season == 2024, a
    assert a.subjects == ["ohtani"], a

    a = parse("home runs allowed by gerrit cole vs lefties")
    assert a.role == "pitcher" and a.vs_hand == "L" and a.subjects == ["gerrit cole"], a

    a = parse("judge vs ohtani home runs")
    assert a.subjects == ["judge", "ohtani"] and a.opponent is None, a

    a = parse("most home runs at fenway park")
    assert a.leaderboard and a.venue == "BOS", a

    a = parse("aaron judge batting average on the road")
    assert a.stat == "batting_average" and a.home_away == "away", a

    a = parse("soto extra base hits in july")
    assert a.stat == "extra_base_hit" and a.month == 7 and a.date_from is None, a

    a = parse("soto hits last 30 days")
    assert a.last_days == 30 and a.date_from is None, a

    a = parse("best home runs by yankees hitters")
    assert a.leaderboard and a.role == "batter" and a.subjects == ["yankees"], a

    a = parse("ohtani career home runs")
    assert a.all_seasons and a.season is None and a.subjects == ["ohtani"], a

    a = parse("betts stolen bases")
    assert STATS[a.stat].get("unsupported"), a

    print("parse.demo: ok")


if __name__ == "__main__":
    demo()

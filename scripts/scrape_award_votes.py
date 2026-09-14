#!/usr/bin/env python3
"""
The BBWAA ballots, since MLB's own feed has none.

`/awards/ALMVP/recipients` names the winner and stops there — no points, no
runners-up. bbwaa.com publishes the whole ballot for MVP, Cy Young and Rookie
of the Year back to 2003, so this pulls those pages once, matches each name to
its MLBAM id off that season's player list, and writes the flat table the site
reads. Re-run it each November when the new results are posted:

    python3 scripts/scrape_award_votes.py

Managers come along too. A manager has no player page and no season line, so
his row carries his club's record instead, read off that season's standings.
"""

from __future__ import annotations

import json
import re
import sys
import time
import unicodedata
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "frontend" / "data" / "award-votes.json"

FIRST_YEAR, LAST_YEAR = 2003, 2025

# slug piece -> (MLB award id suffix, points a first-place vote is worth), which
# is what turns a points total into the share Baseball-Reference prints.
AWARDS = {
    "mvp": ("MVP", 14),
    "cy": ("CY", 7),
    "roy": ("ROY", 5),
    "mgr": ("MOY", 5),
}

# The slug isn't quite stable across years — 2006's rookie pages are "-rook".
ALSO = {"roy": ("rook",), "cy": ("cya",), "mgr": ("nmgr", "mgr-of-the-year")}


def get(url: str) -> str:
    """One page, unhurried — 140-odd requests in a row will otherwise start
    coming back 403, and a second pass at the same speed just does it again."""
    req = urllib.request.Request(url, headers={"User-Agent": "stat-sightline/1.0"})
    for wait in (0, 5, 20):
        time.sleep(wait or 0.5)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", "ignore")
        except urllib.error.HTTPError as e:
            if e.code != 403:
                raise
    raise RuntimeError(f"403 after three tries: {url}")


def cells(row: str) -> list[str]:
    return [
        re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", c)).replace("\xa0", " ").strip()
        for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)
    ]


# What the writers spelled one way and MLB another. Nicknames, married-up
# surnames, and a handful of plain misspellings on the ballot — each checked
# against the season it appears in.
ALIASES = {
    "johannsantana": "johansantana",
    "faustocarmona": "robertohernandez",
    "jefffrancouer": "jefffrancoeur",
    "natemcclouth": "natemclouth",
    "jordanpachecho": "jordanpacheco",
    "jordanzimmerman": "jordanzimmermann",
    "deegordon": "deestrangegordon",
    "geovannysoto": "geovanysoto",
}


def key(name: str) -> str:
    """A name stripped to what two spellings of it share — accents, case, and
    the spaces and hyphens that make one Hyun-jin Ryu into two."""
    flat = unicodedata.normalize("NFKD", name)
    flat = "".join(c for c in flat if not unicodedata.combining(c))
    flat = re.sub(r"[^a-z]", "", flat.lower())
    return ALIASES.get(flat, flat)


def ballot(slug: str) -> list[dict] | None:
    """One award page's voting table, or None where the page isn't up yet."""
    try:
        html = get(f"https://bbwaa.com/{slug}/")
    except Exception as e:  # 404 for a year they never posted
        print(f"  {slug}: {e}", file=sys.stderr)
        return None

    for table in re.findall(r"<table.*?</table>", html, re.S):
        rows = [cells(r) for r in re.findall(r"<tr.*?</tr>", table, re.S)]
        if not rows:
            continue
        head = rows[0]
        # The second table on newer pages is every writer's own ballot.
        if "Affiliation" in head:
            continue
        # 2015 spells the places out — "First", not "1st".
        place = next((h for h in ("1st", "First") if h in head), None)
        if place is None or "Points" not in head:
            continue
        # Two layouts: "Name, Club" in one column (2005-), or the name and the
        # club in two, under whichever noun that year's page chose (2003-04).
        lead = 2 if len(head) > 1 and head[1] == "Club" else 1
        firsts, points = head.index(place), head.index("Points")
        out = []
        for r in rows[1:]:
            if len(r) <= points or not r[0]:
                continue
            if lead == 2:
                name, club = r[0], r[1]
            else:
                # rpartition, not partition: "Ronald Acuna, Jr., Braves".
                name, sep, club = r[0].rpartition(",")
                if not sep:
                    name, club = club, ""
            num = lambda s: int(s) if s.strip().isdigit() else 0
            out.append(
                {
                    "name": name.strip().title() if name.isupper() else name.strip(),
                    "club": club.strip(),
                    "first": num(r[firsts]),
                    "points": num(r[points]),
                }
            )
        return out
    return None


def season_players(year: int) -> dict[str, list[dict]]:
    """Every player in the majors that season, by flattened name."""
    data = json.loads(get(f"https://statsapi.mlb.com/api/v1/sports/1/players?season={year}"))
    by_name: dict[str, list[dict]] = {}
    for p in data.get("people", []):
        by_name.setdefault(key(p.get("fullName", "")), []).append(p)
    return by_name


def match(row: dict, by_name: dict[str, list[dict]]) -> int | None:
    """The MLBAM id behind a ballot line. Where a season ran two players of the
    same name — 2021's two Will Smiths — the club on the ballot splits them."""
    found = by_name.get(key(row["name"]), [])
    if len(found) == 1:
        return found[0]["id"]
    if not found:
        return None
    club = row["club"].lower()
    for p in found:
        team = (p.get("currentTeam") or {}).get("name", "").lower()
        if club and team.endswith(club.split()[-1]):
            return p["id"]
    return None


SUFFIXES = {"jr", "sr", "ii", "iii", "iv"}


def surname(name: str) -> str:
    """The family name, past any Jr. — MLB carries the suffix and the ballots
    mostly don't, and the last word is the wrong one either way round."""
    parts = [w for w in re.split(r"[\s,.]+", name) if key(w) not in SUFFIXES and w]
    return parts[-1] if parts else ""


def by_surname(row: dict, people: list[dict]) -> int | None:
    """Last resort: the surname and the club. The ballots carry first names MLB
    doesn't use — Mike Soroka for Michael, Alexis Rios for Alex — and the
    surname is the half both spell the same."""
    last = key(surname(row["name"]))
    club = row["club"].lower().split()
    hits = [
        p
        for p in people
        if last
        and (lambda s: s.startswith(last) or last.startswith(s))(
            key(surname(p.get("fullName", "")))
        )
    ]
    if len(hits) == 1:
        return hits[0]["id"]
    for p in hits:
        team = (p.get("currentTeam") or {}).get("name", "").lower()
        if club and team.endswith(club[-1]):
            return p["id"]
    return None


def season_clubs(year: int) -> tuple[dict[str, dict], dict[int, dict]]:
    """That season's clubs by every name a ballot might print them under, and
    each one's final record — the pages say "Guardians" now and "Cleveland" in
    2003, and a manager's row is his club's line."""
    teams = json.loads(get(f"https://statsapi.mlb.com/api/v1/teams?sportId=1&season={year}"))
    by_name: dict[str, dict] = {}
    for t in teams.get("teams", []):
        for name in (t.get("teamName"), t.get("locationName"), t.get("name"), t.get("shortName")):
            if name:
                by_name.setdefault(key(name), t)
    # What the ballots call a club and MLB doesn't: a nickname MLB abbreviates
    # itself, and the mouthful the Angels were briefly registered under.
    for ours, theirs in (("diamondbacks", "dbacks"), ("losangelesangelsofanaheim", "angels")):
        if theirs in by_name:
            by_name.setdefault(ours, by_name[theirs])

    standings = json.loads(
        get(
            "https://statsapi.mlb.com/api/v1/standings?leagueId=103,104"
            f"&season={year}&standingsTypes=regularSeason"
        )
    )
    record: dict[int, dict] = {}
    for div in standings.get("records", []):
        for r in div.get("teamRecords", []):
            g, w, l = r.get("gamesPlayed", 0), r.get("wins", 0), r.get("losses", 0)
            record[r["team"]["id"]] = {
                "w": w,
                "l": l,
                "ties": max(g - w - l, 0),
                "g": g,
                "pct": r.get("winningPercentage", ""),
                "finish": int(r.get("divisionRank") or 0) or None,
            }
    return by_name, record


def main() -> None:
    """Merges rather than replaces: a run that loses a page to a 403 keeps what
    the last one got for it, so a rerun can only ever add."""
    kept = json.loads(OUT.read_text()) if OUT.exists() else []
    rows: list[dict] = []
    missed: list[str] = []
    for year in range(FIRST_YEAR, LAST_YEAR + 1):
        roster: dict[str, list[dict]] | None = None
        for lg in ("al", "nl"):
            for slug_part, (suffix, first_pts) in AWARDS.items():
                lines = None
                for part in (slug_part, *ALSO.get(slug_part, ())):
                    slug = f"{year % 100:02d}-{lg}-{part}"
                    lines = ballot(slug)
                    if lines:
                        break
                if not lines:
                    continue
                if roster is None:
                    roster = season_players(year)
                    everyone = [p for ps in roster.values() for p in ps]
                    clubs, records = season_clubs(year)
                voters = sum(l["first"] for l in lines)
                most = voters * first_pts
                # Ties share a rank, and the next man down skips — the way a
                # ballot is printed.
                lines.sort(key=lambda l: -l["points"])
                rank, seen = 0, None
                for i, l in enumerate(lines):
                    if l["points"] != seen:
                        rank, seen = i + 1, l["points"]
                    row = {
                        "award": f"{lg.upper()}{suffix}",
                        "season": year,
                        "rank": rank,
                        "id": None,
                        "name": l["name"],
                        "club": l["club"],
                        "points": l["points"],
                        "max": most,
                        "first": l["first"],
                    }
                    if suffix == "MOY":
                        # A manager is his club: the row is the club's record,
                        # and there is no player behind the name to link to.
                        club = clubs.get(key(l["club"]))
                        if club is None:
                            missed.append(f"{year} {lg}{suffix}: {l['name']} ({l['club']})")
                        else:
                            row["teamId"] = club["id"]
                            row["team"] = club.get("abbreviation", "")
                            row.update(records.get(club["id"], {}))
                    else:
                        row["id"] = match(l, roster) or by_surname(l, everyone)
                        if row["id"] is None:
                            missed.append(f"{year} {lg}{suffix}: {l['name']} ({l['club']})")
                    rows.append(row)
                print(f"{slug}: {len(lines)}")

    fresh = {(r["award"], r["season"]) for r in rows}
    held = [r for r in kept if (r["award"], r["season"]) not in fresh]
    if held:
        print(f"kept {len(held)} lines from the last run for pages that failed")
    rows = sorted(rows + held, key=lambda r: (-r["season"], r["award"], r["rank"]))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(rows, separators=(",", ":")) + "\n")
    print(f"\n{len(rows)} lines -> {OUT} ({OUT.stat().st_size // 1024} KB)")
    if missed:
        print(f"{len(missed)} unmatched:", file=sys.stderr)
        for m in missed:
            print("  " + m, file=sys.stderr)


if __name__ == "__main__":
    main()

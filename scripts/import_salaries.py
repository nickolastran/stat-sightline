"""Import salaries from mlb-player-value into frontend/data/salaries.csv.

That repo already scrapes Baseball-Reference (its scripts/scrape.py) into
player-seasons.csv, with mlbam.json mapping each Baseball-Reference id to an
MLB id. This reads both straight off GitHub and writes them in the format
lib/salaries.ts reads.

Left out: salaries that repo estimated at the league minimum (pre-arb years
Baseball-Reference doesn't list), and seasons with no salary at all. Only
listed figures are kept.

    python scripts/import_salaries.py
"""
from __future__ import annotations

import csv
import io
import json
import urllib.request
from pathlib import Path

RAW = "https://raw.githubusercontent.com/nickolastran/mlb-player-value/main"
OUT = Path(__file__).resolve().parents[1] / "frontend" / "data" / "salaries.csv"

# Baseball-Reference team codes that differ from MLB's own.
TEAMS = {"ARI": "AZ", "CHW": "CWS", "KCR": "KC", "SDP": "SD", "SFG": "SF", "TBR": "TB", "WSN": "WSH"}


def get(path: str) -> str:
    with urllib.request.urlopen(f"{RAW}/{path}", timeout=60) as r:
        return r.read().decode("utf-8")


def convert(seasons: list[dict], ids: dict[str, int]) -> list[dict]:
    out = []
    for r in seasons:
        if not r["Salary"] or r["Salary_est"] == "True":
            continue
        out.append({
            "year": int(r["Season"]),
            "name": r["Player"],
            "team": TEAMS.get(r["Team"], r["Team"]),
            "position": r["Pos"],
            "salary": int(float(r["Salary"])),
            "mlb_id": ids.get(r["bref_id"], ""),
        })
    return sorted(out, key=lambda r: (-r["year"], -r["salary"], r["name"]))


def main() -> None:
    seasons = list(csv.DictReader(io.StringIO(get("player-seasons.csv"))))
    ids = json.loads(get("public/data/mlbam.json"))
    rows = convert(seasons, ids)
    with OUT.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["year", "name", "team", "position", "salary", "mlb_id"])
        w.writeheader()
        w.writerows(rows)
    print(f"Wrote {len(rows)} salaries to {OUT.relative_to(OUT.parents[2])}")


if __name__ == "__main__":
    # Self-check: estimates and blanks dropped, team codes mapped to MLB's.
    got = convert(
        [
            {"Season": "2026", "Player": "A", "Team": "SDP", "Pos": "SP", "Salary": "1000000.0", "Salary_est": "False", "bref_id": "a01"},
            {"Season": "2026", "Player": "B", "Team": "NYY", "Pos": "RP", "Salary": "780000", "Salary_est": "True", "bref_id": "b01"},
            {"Season": "2026", "Player": "C", "Team": "NYY", "Pos": "C", "Salary": "", "Salary_est": "False", "bref_id": "c01"},
        ],
        {"a01": 1},
    )
    assert got == [{"year": 2026, "name": "A", "team": "SD", "position": "SP", "salary": 1_000_000, "mlb_id": 1}], got
    main()

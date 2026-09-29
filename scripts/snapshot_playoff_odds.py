"""Write playoff odds and projections into the frontend's snapshots, for a site
with no API.

The deployed frontend has no FastAPI backend to call, so `/playoffs` reads the
odds out of `frontend/data/playoff-odds.json`, and the standings' PROJ / PACE /
P162 columns read `frontend/data/projections.json` — keyed by season, one
`/api/standings/odds` or `/api/standings/projections` payload each. Past seasons stay as they were last
written; the daily GitHub Action (`.github/workflows/playoff-odds.yml`)
retrains and refreshes the current one.

Run after `train_standings.py`, against the games.csv + model.pkl it built.

Examples:
    python scripts/snapshot_playoff_odds.py             # the current season
    python scripts/snapshot_playoff_odds.py 2023 2024   # backfill
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

DATA = ROOT / "frontend" / "data"


def main(argv: list[str]) -> int:
    from src.stat_sightline.standings.ingest import today_et
    from src.stat_sightline.standings.odds import playoff_odds
    from src.stat_sightline.standings.project import load_games, project_season
    from src.stat_sightline.standings.train import load as load_model

    seasons = [int(s) for s in argv] or [today_et().year]
    games, bundle = load_games(), load_model()

    for name, build in (("playoff-odds", playoff_odds), ("projections", project_season)):
        out = DATA / f"{name}.json"
        snap = json.loads(out.read_text()) if out.exists() else {}
        for season in seasons:
            payload = build(season, games, bundle)
            if not payload["teams"]:
                print(f"{name} {season}: no games on record, skipped")
                continue
            # Both are deterministic (the odds draws are seeded), so unchanged
            # teams means nothing was played — keep the old entry (and its
            # trained_at), and the commit, quiet.
            if snap.get(str(season), {}).get("teams") == payload["teams"]:
                print(f"{name} {season}: unchanged")
                continue
            snap[str(season)] = payload
            print(f"{name} {season}: as of {payload['as_of']}")
        out.write_text(json.dumps(snap, indent=1, sort_keys=True, default=float) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

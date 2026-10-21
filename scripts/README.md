# scripts/

Command-line entry points, run from the repo root. Each one keeps its logic
in `src/stat_sightline/` and only parses arguments and wires steps together.
Every file's docstring has its full usage.

| Script | What it does | Writes to |
| --- | --- | --- |
| `init_db.py` | Applies `sql/01_schema.sql` over the direct (unpooled) URL | Postgres |
| `run_etl.py` | Statcast fetch → clean → upsert. Defaults to the 2024 regular season; `--start/--end`, `--skip-load`, `--no-cache` | Postgres, `data/raw/` |
| `train_standings.py` | MLB results ingest, then fits the standings model. `--seasons`, `--skip-ingest` | `data/standings/` |
| `snapshot_playoff_odds.py` | Playoff odds and projections for a site with no API. Run daily by `.github/workflows/playoff-odds.yml`; pass years to backfill | `frontend/data/playoff-odds.json`, `projections.json` |
| `snapshot_matchups.py` | Today's and tomorrow's starters against the opposing active rosters, straight off Savant. Run daily by `.github/workflows/matchups.yml` | `frontend/data/matchups.json` |
| `scrape_award_votes.py` | BBWAA ballots (MVP, Cy Young, Rookie, Manager of the Year back to 2003), names matched to MLBAM ids. Re-run each November | `frontend/data/award-votes.json` |

```bash
python scripts/init_db.py
python scripts/run_etl.py --start 2026-03-26 --end 2026-04-30
python scripts/train_standings.py --seasons 2026
python scripts/snapshot_matchups.py 2026-10-17
```

Each snapshot file is written in a single write once it's built, so a build
that fails leaves that file as it was. `snapshot_playoff_odds.py` merges into
the seasons already in its files, leaving unchanged seasons alone (so a quiet
day makes no commit). `snapshot_matchups.py` rewrites its file whole each
run, and raises rather than writing "nobody has faced him" when Savant sends
back an error page.

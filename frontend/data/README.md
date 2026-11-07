# frontend/data/

Files the site imports directly. Most are snapshots of what the API would
answer, so the deployed site works without one. Don't edit them by hand: each
has a writer.

| File | Written by | Read by | Holds |
| --- | --- | --- | --- |
| `playoff-odds.json` | `scripts/snapshot_playoff_odds.py`, daily (`playoff-odds.yml`) | `lib/api.ts` → `/playoffs`, World Series SIM TITLE ODDS | Playoff and title odds per club, keyed by season (2022 on) |
| `projections.json` | the same script and Action | `lib/api.ts` → the standings' PROJ / PACE / P162 columns | Projected final records, keyed by season |
| `matchups.json` | `scripts/snapshot_matchups.py`, daily (`matchups.yml`) | `lib/api.ts` `getMatchups` → the pregame lineup card, the matchup head-to-head tiles | Today's and tomorrow's starters against the opposing active rosters, keyed by pitcher id |
| `award-votes.json` | `scripts/scrape_award_votes.py`, each November | `lib/mlb/career.ts` → award pages and player ballot finishes | BBWAA ballots back to 2003, names matched to MLBAM ids |
| `salaries.csv` | `scripts/import_salaries.py`, by hand each offseason (from the mlb-player-value repo's Baseball-Reference scrape) | `lib/salaries.ts` → `/salaries`, `/free-agents` PREV SALARY | `year,name,team,position,salary,mlb_id`, 2016–2026 (no 2020), listed salaries only, no league-minimum estimates |

`lib/api.ts` reads a snapshot only when the API call fails. Locally, with the
API running, the snapshots are bypassed.

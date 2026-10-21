# .github/workflows/

The deployed site has no hosted API. These two daily Actions keep its
snapshots in `frontend/data/` fresh instead. Each one commits only when a
number moved; that commit is what triggers the Vercel redeploy.

| Workflow | Schedule (UTC) | Runs | Refreshes |
| --- | --- | --- | --- |
| `playoff-odds.yml` | `0 12 * * *` (8am ET, after last night's games are final) | `scripts/train_standings.py` (rebuilds `games.csv` + `model.pkl` from scratch, about 10s), then `scripts/snapshot_playoff_odds.py` | `playoff-odds.json`, `projections.json`: `/playoffs` and the standings' PROJ / PACE / P162 columns |
| `matchups.yml` | `15 12 * * *` (8:15am ET, once the day's probables are set) | `scripts/snapshot_matchups.py` | `matchups.json`: the pregame lineup card's PITCH view |

Neither needs secrets or the warehouse: the odds job reads only the public
MLB Stats API, and the matchups job reads MLB plus Baseball Savant. Both can also be started by hand (`workflow_dispatch`).

Both commit to the same branch. `matchups.yml` runs 15 minutes after the odds
job, so it does `git pull --rebase` before pushing in case that job landed a
commit since checkout. They touch different files, so the rebase never
conflicts.

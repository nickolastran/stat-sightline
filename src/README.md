# src/stat_sightline/

The backend's library code: everything the API and the scripts import. No
`__init__.py` anywhere: each folder is a PEP 420 namespace package, imported
as `src.stat_sightline.<pkg>` from the repo root (see the root README's
Layout section).

| Package | What it holds |
| --- | --- |
| `db/` | `connection.py`: the one cached SQLAlchemy engine, pooled or direct |
| `etl/` | `ingest_statcast.py` fetches Statcast through pybaseball with a parquet cache; `clean.py` shapes it for the warehouse; `load.py` stages a DataFrame and upserts it, so reloading a range is idempotent |
| `features/` | Batted-ball metrics (barrels, hard-hit, percentiles), attack-zone swing/take run values, and a custom xwOBA model |
| `query/` | The `/ask` engine. `parse.py` turns a question into a structured `Ask` and is pure (no DB), so every phrasing is unit-tested; `run.py` answers it in SQL and also backs the player typeahead |
| `standings/` | The database-free projection pipeline: `ingest.py` (MLB results → `games.csv`), `features.py` (leakage-safe rolling form), `train.py` (chronological validation), `project.py` (actual wins plus expected wins to come), `odds.py` (playoff odds by Monte Carlo over the schedule and bracket) |

Rules that hold across packages:

- Pure logic stays separate from I/O, so `tests/` can cover it with no
  database or network.
- Anything built from rolling windows is `shift(1)`-ed within its group, so a
  game only ever sees earlier games. `tests/test_standings.py` checks this.
- Standings validation is chronological, never a random split.

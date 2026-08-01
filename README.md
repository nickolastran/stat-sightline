# Stat Sightline

MLB advanced metrics platform, Baseball Savant–style. Statcast pitch data is
pulled with `pybaseball`, cleaned, and upserted into PostgreSQL; a FastAPI
service serves it to a Next.js frontend that renders strike-zone plots,
league standings, and leaderboards. A second, database-free pipeline projects
each club's final record and hangs those columns off the standings tables.

```
pybaseball ──► ETL (pandas) ──► PostgreSQL ──► FastAPI ──► Next.js
                                (schema: savant)   :8000      :3000
                                                     ▲          ▲
      MLB Stats API ─► standings pipeline ──────────-┘          │
      (results/schedule)  (games.csv + model.pkl)               │
                     └──── scoreboard / standings / leaders ────┘
```

## Layout

| Path | What's there |
| --- | --- |
| `src/stat_sightline/etl/` | Statcast fetch + parquet cache, cleaning, idempotent UPSERT loaders |
| `src/stat_sightline/features/` | Barrels & hard-hit rates, attack zones / swing-take, custom xwOBA model |
| `src/stat_sightline/standings/` | Standings projection: MLB results ingest, rolling-form features, model training, season projection |
| `src/stat_sightline/db/` | Cached SQLAlchemy engine |
| `sql/` | `01_schema.sql` (tables + indexes), `02_feature_views.sql` (barrel, attack-zone, swing-take views) |
| `api/` | FastAPI app + `/api/pitchers` and `/api/standings` routers |
| `frontend/` | Next.js 16 app (App Router, Tailwind v4, Recharts) |
| `scripts/` | `init_db.py`, `run_etl.py`, `train_standings.py` |
| `tests/` | pytest for cleaning, feature math, and projection leakage |

`src/app/` is a leftover `create-next-app` scaffold; the live frontend is
`frontend/`.

Packages carry no `__init__.py`: every import (`api.*`, `src.stat_sightline.*`,
`config.*`) resolves as a PEP 420 namespace package off the repo root, which
pytest gets from `pythonpath = ["."]` in `pyproject.toml`. Add `__init__.py`
back — and a `[build-system]` — if this ever needs to be `pip install`ed.

## Setup

Requires Python 3.10+, Node 20+ (Next 16), and a PostgreSQL database.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

Config comes from the environment or a `.env` at the project root:

```bash
DATABASE_URL=postgresql+psycopg2://user:pass@localhost:5432/stat_sightline
# …or the PG* vars: PGUSER PGPASSWORD PGHOST PGPORT PGDATABASE
STATCAST_CACHE_DIR=data/raw     # parquet cache, relative to project root
ETL_CHUNK_DAYS=3                # days per Statcast request window
STANDINGS_DATA_DIR=data/standings        # games.csv + model.pkl for the projection
FRONTEND_ORIGINS=http://localhost:3000   # CORS allowlist for the API
```

## Load the data

```bash
python scripts/init_db.py                       # apply sql/01_schema.sql
python scripts/run_etl.py                       # defaults to the 2024 regular season
python scripts/run_etl.py --start 2023-04-01 --end 2023-04-30
python scripts/run_etl.py --skip-load           # fetch + cache parquet only
python scripts/run_etl.py --no-cache            # ignore the parquet cache
```

The full-season pull is slow on first run and cached afterwards. Feature views
are applied separately:

```bash
psql "$DATABASE_URL" -f sql/02_feature_views.sql
```

## Standings projection

The PROJ / PACE / P162 columns on the standings tables come from their own
pipeline — no database, no Statcast, just the free MLB Stats API and flat files
in `data/standings/`:

```bash
python scripts/train_standings.py                  # 2021 → current season, then fit
python scripts/train_standings.py --seasons 2026   # in-season refresh: re-pull + retrain
python scripts/train_standings.py --skip-ingest    # retrain offline on games.csv
```

**Features** (`features.py`) — per club, per game: 30-game rolling runs scored
and allowed, 30-game rolling win%, days of rest, and days since the probable
starter's last start. Every rolling stat is `shift(1)`-ed within its team or
pitcher group, so a game's features come only from strictly earlier games.
`tests/test_standings.py` asserts this by truncating the future and checking
that earlier games' features are unchanged.

**Model** (`train.py`) — LogisticRegression for the home team's win probability,
Ridge for run differential, both behind impute→scale pipelines. Linear beats
gradient boosting on these features and is better *calibrated*, which is what
matters because the projection sums probabilities. Validation is chronological
(fit on prior seasons, score the season in progress), never random — a random
split leaks the future through overlapping rolling windows. Holdout metrics land
in the pickle and are shown under the standings tables.

Rolling team form alone is close to a coin flip on individual games: expect
~51–52% accuracy, which does not reliably beat always picking the home team.
Log loss under 0.693 is the honest signal that it's better than a coin flip, and
calibration is what the projection actually relies on. The known upgrade path is
starting-pitcher quality and bullpen workload features.

**Projection** (`project.py`) — projected wins = actual wins + the summed win
probability of every remaining game on the schedule. That is an expected value
with today's form frozen, not a Monte Carlo, so it has no spread and cannot
answer playoff odds. `pace_wins` prorates the projection to games played (wins
above pace = outrunning the model); `pace_162` is the plainer current win rate
over a full season.

Two quirks of the MLB feed are handled explicitly, because both silently
double-count: a suspended game is listed under both its original and resumption
dates with one `game_pk` (deduped, keeping the resumption date), and a postponed
slot stays on the schedule next to its makeup game, marked `Final` once the
makeup is played (dropped from both results and games remaining).

## Run it

```bash
uvicorn api.main:app --reload --port 8000    # docs at /docs
cd frontend && npm install && npm run dev    # http://localhost:3000
```

Set `NEXT_PUBLIC_API_URL` if the API isn't on `http://localhost:8000`.

Neither `data/standings/` nor the Statcast cache is committed. Without the
Statcast tables the pitcher pages are empty; without `train_standings.py` the
standings render in full, just without the projection columns.

## API

| Endpoint | Notes |
| --- | --- |
| `GET /health` | liveness |
| `GET /api/pitchers?q=&limit=` | name typeahead, ordered by pitch count |
| `GET /api/pitchers/{id}/pitches` | full pitch payload; filters `pitch_type`, `stand`, `date_from`, `date_to`, `limit` (≤20000) |
| `GET /api/standings/projections?season=` | per club: actual W-L, games remaining, projected final W-L, both paces, plus the model's holdout metrics. Defaults to the current season (Eastern). `503` until `train_standings.py` has run |

The pitcher endpoint returns location, velo, spin, movement, count/base-out
state, and batted-ball tracking in one response — the frontend filters that
working set in memory rather than re-querying per control.

The projections endpoint is cached per (season, day, artifact mtime): it scores
every remaining game to answer, and a retrain invalidates it without a restart.

## Frontend routes

- `/` — landing page with pitcher search
- `/dashboard` — league overview: today's scoreboard, standings (with projected
  finishes), stat leaders — live from the public MLB Stats API plus our own
  projections endpoint, server-rendered; each source fails independently
- `/league/[section]` — the reference sections pinned in the league bar:
  `leaders`, `probables`, `standings` (division / league / all-MLB scopes, every
  stat column click-sortable, plus the projected-finish columns when our own API
  answers — they are dropped rather than blanked when it doesn't, so standings
  never depend on it), `teams` (all 30 clubs' season hitting and pitching lines,
  click-sortable)
- `/team/[id]` — one club's season: standings line, team hitting and pitching
  lines, and its roster, linking on to the player pages
- `/pitcher/[id]` — pitch-level analysis: strike-zone scatter, filter panel,
  summary metrics. A non-numeric id falls back to the highest-workload pitcher.
- `/api/games` — same-origin proxy for the schedule, used by the client
  scoreboard bar (a date-picker calendar + arrow-paged rail of the day's
  games, shown on the front page only)
- `/api/games/{gamePk}` — same-origin proxy for one game's box score
  (linescore + both teams' batting/pitching lines), fetched when a card in
  that rail is clicked

## Tests

```bash
pytest
```

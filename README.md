# Stat Sightline

MLB advanced metrics platform, Baseball Savant–style. Statcast pitch data is
pulled with `pybaseball`, cleaned, and upserted into PostgreSQL; a FastAPI
service serves it to a Next.js frontend that renders strike-zone plots,
league standings, and leaderboards.

```
pybaseball ──► ETL (pandas) ──► PostgreSQL ──► FastAPI ──► Next.js
                                (schema: savant)   :8000      :3000
                                                                ▲
                          MLB Stats API (scoreboard/standings) ─┘
```

## Layout

| Path | What's there |
| --- | --- |
| `src/stat_sightline/etl/` | Statcast fetch + parquet cache, cleaning, idempotent UPSERT loaders |
| `src/stat_sightline/features/` | Barrels & hard-hit rates, attack zones / swing-take, custom xwOBA model |
| `src/stat_sightline/db/` | Cached SQLAlchemy engine |
| `sql/` | `01_schema.sql` (tables + indexes), `02_feature_views.sql` (barrel, attack-zone, swing-take views) |
| `api/` | FastAPI app + `/api/pitchers` router |
| `frontend/` | Next.js 16 app (App Router, Tailwind v4, Recharts) |
| `scripts/` | `init_db.py`, `run_etl.py` |
| `tests/` | pytest for cleaning + feature math |

`src/stat_sightline/{modeling,viz,dashboard}/` are empty placeholders — the
predictive models advertised on the landing page aren't built yet.
`src/app/` is a leftover `create-next-app` scaffold; the live frontend is
`frontend/`.

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

## Run it

```bash
uvicorn api.main:app --reload --port 8000    # docs at /docs
cd frontend && npm install && npm run dev    # http://localhost:3000
```

Set `NEXT_PUBLIC_API_URL` if the API isn't on `http://localhost:8000`.

## API

| Endpoint | Notes |
| --- | --- |
| `GET /health` | liveness |
| `GET /api/pitchers?q=&limit=` | name typeahead, ordered by pitch count |
| `GET /api/pitchers/{id}/pitches` | full pitch payload; filters `pitch_type`, `stand`, `date_from`, `date_to`, `limit` (≤20000) |

The pitcher endpoint returns location, velo, spin, movement, count/base-out
state, and batted-ball tracking in one response — the frontend filters that
working set in memory rather than re-querying per control.

## Frontend routes

- `/` — landing page with pitcher search
- `/dashboard` — league overview: today's scoreboard, standings, stat leaders
  (live from the public MLB Stats API, server-rendered; each source fails
  independently)
- `/pitcher/[id]` — pitch-level analysis: strike-zone scatter, filter panel,
  summary metrics. A non-numeric id falls back to the highest-workload pitcher.
- `/api/games` — same-origin proxy for the schedule, used by the client
  scoreboard bar

## Tests

```bash
pytest
```

# Stat Sightline

MLB advanced metrics platform, Baseball Savant–style. Statcast pitch data is
pulled with `pybaseball`, cleaned, and upserted into PostgreSQL; a FastAPI
service serves it to a Next.js frontend that renders strike-zone plots and
plain-English answers alongside a full league site — scoreboard, standings,
leaders, team and player pages, and live gamecasts — read straight from the
public MLB Stats API. A second, database-free pipeline projects each club's
final record and hangs those columns off the standings tables.

```
pybaseball ──► ETL (pandas) ──► PostgreSQL ──► FastAPI ──► Next.js
                                (schema: savant)   :8000      :3000
                                                     ▲          ▲
      MLB Stats API ─► standings pipeline ──────────-┘          │
      (results/schedule)  (games.csv + model.pkl)               │
                     └─ scoreboard / standings / teams / games ─┘
```

## Layout

| Path | What's there |
| --- | --- |
| `src/stat_sightline/etl/` | Statcast fetch + parquet cache, cleaning, idempotent UPSERT loaders |
| `src/stat_sightline/features/` | Barrels & hard-hit rates, attack zones / swing-take, custom xwOBA model |
| `src/stat_sightline/query/` | Plain-English question parsing (`parse.py`, pure) and the SQL that answers it (`run.py`) |
| `src/stat_sightline/standings/` | Standings projection: MLB results ingest, rolling-form features, model training, season projection |
| `src/stat_sightline/db/` | Cached SQLAlchemy engine |
| `sql/` | `01_schema.sql` (tables + indexes), `02_feature_views.sql` (barrel, attack-zone, swing-take views) |
| `api/` | FastAPI app + `/api/ask`, `/api/matchups`, `/api/pitchers` + `/api/batters` and `/api/standings` routers |
| `frontend/` | Next.js 16 app (App Router, Tailwind v4, Recharts, Framer Motion); `lib/mlb/` is the MLB Stats API client every league / team / player / game page reads through |
| `scripts/` | `init_db.py`, `run_etl.py`, `train_standings.py` |
| `tests/` | pytest for cleaning, feature math, question parsing, and projection leakage |

Each of these folders has a README of its own, file by file:
[`api/`](api/README.md), [`config/`](config/README.md),
[`scripts/`](scripts/README.md), [`sql/`](sql/README.md),
[`src/`](src/README.md), [`tests/`](tests/README.md),
[`.github/workflows/`](.github/workflows/README.md), and
[`frontend/`](frontend/README.md) with its [`app/`](frontend/app/README.md),
[`components/`](frontend/components/README.md), [`lib/`](frontend/lib/README.md)
and [`data/`](frontend/data/README.md).

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
DATABASE_URL_UNPOOLED=          # optional; see "Pooled vs direct" below
# …or the PG* vars: PGUSER PGPASSWORD PGHOST PGPORT PGDATABASE
STATCAST_CACHE_DIR=data/raw     # parquet cache, relative to project root
ETL_CHUNK_DAYS=3                # days per Statcast request window
STANDINGS_DATA_DIR=data/standings        # games.csv + model.pkl for the projection
FRONTEND_ORIGINS=http://localhost:3000   # CORS allowlist for the API
```

### Neon (Lakebase Postgres)

The warehouse is hosted on Neon; `neon link` writes the branch's URLs into
`.env` and pins the branch in a git-ignored `.neon`:

```bash
npm i -g neon && neon auth
neon link --org-id <org> --project-id <project>   # pulls DATABASE_URL + _UNPOOLED
neon checkout <branch>                            # per feature; pulls that branch's env
```

**Pooled vs direct.** Neon serves two URLs and `config/settings.py` knows the
difference: `database_url()` returns the pooled one (PgBouncer) for ordinary
queries, and `database_url(direct=True)` returns `DATABASE_URL_UNPOOLED` for
work a transaction pooler can't carry. `scripts/init_db.py` (DDL) and
`scripts/run_etl.py` (staging table + bulk upsert) ask for direct; the API does
not. With no `DATABASE_URL_UNPOOLED` set, direct falls back to the pooled URL,
so a plain local Postgres is unaffected.

Lakebase Postgres is the only Neon service this app uses — no Auth, Object
Storage, Functions, or AI Gateway. The landing-page sign-in is a stubbed
client-side form (`components/landing/AccessCta.tsx`), not a backend.

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

Set `NEXT_PUBLIC_API_URL` if the API isn't on `http://localhost:8000`. That
default applies to `next dev` only: a production build with it unset makes no
API calls and falls back to the snapshots. It is inlined at build time, so
changing it on Vercel takes a redeploy.

Neither `data/standings/` nor the Statcast cache is committed. Without the
Statcast tables the pitcher pages are empty; without `train_standings.py` the
standings render in full, just without the projection columns.

## API

| Endpoint | Notes |
| --- | --- |
| `GET /health` | liveness |
| `GET /api/pitchers?q=&limit=` | name typeahead, ordered by pitch count |
| `GET /api/batters?q=&limit=` | the same, ordered by pitches seen |
| `GET /api/pitchers/{id}/pitches` | full pitch payload; filters `pitch_type`, `stand`, `date_from`, `date_to`, `limit` (≤20000), and `vs` — one batter's id, for only the pitches between the two |
| `GET /api/batters/{id}/pitches` | the same read from the hitter's side — every pitch he saw; `vs` takes a pitcher's id |
| `GET /api/pitchers/{id}/mix?season=` | pitch counts by type against each batter side, `{"L": {"FF": 412, …}, "R": {…}}` — the matchup forecast's platoon split |
| `GET /api/matchups?pitcher=&batters=` | each listed hitter's pitch-level line against one pitcher (PA, whiff%, EV, hard-hit%, xwOBA, top pitches); a hitter who never faced him is absent |
| `GET /api/ask?q=` | plain-English question → headline number, splits, and the game log behind it. Always `200`: a stat the pitch table can't carry, or a name that matches nobody, comes back in `notes`/`suggestions` rather than as an error |
| `GET /api/standings/projections?season=` | per club: actual W-L, games remaining, projected final W-L, both paces, plus the model's holdout metrics. Defaults to the current season (Eastern). `503` until `train_standings.py` has run |

## Ask

`/ask` answers questions like *"how many home runs did aaron judge hit at
fenway park"* off the same warehouse. Parsing is a keyword consumer, not a
model: `parse.py` strips the spans it recognises — timeframe, ballpark,
opponent, home/road, opposing handedness, role, stat — and whatever text
survives is the name to look up. That is the whole vocabulary, and it is pure,
so `tests/test_ask.py` covers every phrasing offline.

Names resolve against `savant.players` by substring first (people type last
names), then `difflib` for typos, breaking ties on workload. A ballpark is not
a column — the warehouse has no venue — it is `games.home_team`, which is the
same thing. Filters flip with the role: a batter's opponent is the fielding
club and the hand faced is `p_throws`; a pitcher's are the reverse.

Answerable: HR, hits, singles/doubles/triples, extra-base hits, RBI,
strikeouts, walks, batting average. Deliberately refused rather than guessed:
stolen bases and runs scored (not plate-appearance outcomes) and ERA (needs
innings-pitched bookkeeping the pitch table doesn't carry). RBI is derived from
`post_bat_score - bat_score`, so it counts runs that crossed on the play — it
differs from official RBI when a run scores on an error or a double play.

The pitcher endpoint returns location, velo, spin, movement, count/base-out
state, and batted-ball tracking in one response — the frontend filters that
working set in memory rather than re-querying per control.

The projections endpoint is cached per (season, day, artifact mtime): it scores
every remaining game to answer, and a retrain invalidates it without a restart.

## Frontend routes

- `/` — landing page with pitcher search
- `/ask` — the question box and its answer card: headline number with its rank
  under the same filters, home/road and platoon splits, a leaderboard when the
  question is comparative, and the game log of every play behind the number.
  The question lives in the URL, so answers are shareable
- `/dashboard` — league overview: today's scoreboard, standings (with projected
  finishes), stat leaders — live from the public MLB Stats API plus our own
  projections endpoint, server-rendered; each source fails independently
- `/league/[section]` — the reference sections, declared once in
  `lib/leagueSections.ts` so a new one is added in a single place:
  `gamefeed`, `scoreboard`, `leaders`, `probables`, `standings` (division /
  league / all-MLB scopes, every stat column click-sortable, plus the
  projected-finish columns when our own API answers — they are dropped rather
  than blanked when it doesn't, so standings never depend on it), `wildcard`
  (the same table read as a race, reached from standings rather than the bar),
  `teams`, `players`, `abs`. The game feed is one day as eight boards of five —
  exit velocity, batted-ball distance, pitch velocity, swings and misses, hits,
  strikeouts, and win probability added for batters and pitchers. Most of those
  exist nowhere but the play log, so they are folded out of one `playByPlay`
  and one `winProbability` read per game (`lib/gamefeed.ts`); hits and
  strikeouts are a single whole-league box score read each. A game whose log
  can't be had drops out rather than taking the tab down
- `/team/[id]/[[...tab]]` — one club: `home`, `schedule`, `stats`, `roster`,
  `splits`, `injuries`, `transactions`. Each tab is a link to its own
  server-rendered payload rather than local state, so it prefetches and the URL
  is shareable
- `/player/[id]/[[...tab]]` — one player: `overview`, `stats`, `bio`, `splits`,
  `gamelog`. Same trade as the club tabs, except these carry the query string
  across — season and stat group are picked once, for whichever section is
  being read
- `/game/[pk]` — one game as three views over one payload (`gamecast`, `box`,
  `plays`): before first pitch, lineups, probables, season series and the
  clubs' form; while it's on, the count and base-out state, the live pitch
  plot, MLB's win-probability line play by play, and the play log (all plays or
  scoring only); afterwards, the box score. Re-fetches itself on a timer only
  while the game is in progress
- `/stats/[view]` — the advanced boards: `player-batting`, `player-pitching`,
  `league-batting`, `league-pitching`, `top` (the leader cards) and `custom`.
  Columns are stitched from MLB's own season and advanced lines, FanGraphs'
  WAR/wRC+, and up to four Savant leaderboards, joined on player id — a Savant
  board that stops answering costs its own columns and nothing else.
  `custom` is the board a reader builds: group, season, minimum, league,
  division, club, position, a `ROOKIES` toggle that swaps MLB's rookie pool in
  for the qualified one, and any subset of the group's catalogue (78 columns
  for batters, 88 for pitchers, 18 for fielders). Every control
  stages into a draft and `UPDATE` applies the lot in one request, because a
  board is one MLB read and up to four to Savant. The whole selection lives in
  the query string, so a board is a link — which is also how `DOWNLOAD CSV`
  works: it points at `/stats/custom/csv` with the same parameters, and
  `app/stats/[view]/csv/route.ts` rebuilds the board and writes it out
  (`csvOf` in `lib/advanced.ts`, the inverse of the Savant CSV reader beside
  it). Figures are written as stored — no thousands separators, an untracked
  figure left blank rather than an em dash — so a spreadsheet can add the
  column up
- `/pitcher/[id]`, `/hitter/[id]` — the PITCHING and HITTING modules: one
  player's pitches thrown or seen, filtered in memory (dates, pitch type,
  count, batter side, pitcher hand, situation) with the whole slice in the URL,
  so a filtered view is a link. Headline tiles, the strike-zone plot (scatter /
  density / hot-cold), movement, arsenal table and pitch log all read the same
  slice. HITTING swaps in a spray chart, swing decisions and bat tracking, and
  its movement chart mirrors left-handers' horizontal break so pitches from
  both hands don't land opposite each other. COMPARE TO sets a second date
  range — HALVES, SPLIT AT a date, or any two ranges — and every tile shows
  its change from it, green or red by whether that's good news for the role,
  left uncolored and flagged under 50 of the tile's own sample. A non-numeric
  id falls back to the highest-workload player. With no API, the payload comes
  from Savant's Statcast search instead
- `/matchup?pitcher=&batter=` — MATCHUP FORECAST: projected xwOBA for any
  hitter against any pitcher, weighted by the pitcher's pitch mix against the
  side the hitter bats from (switch-hitters turn around; the split is pulled
  toward the season mix by 100 pitches), with the per-pitch breakdown. Under
  it, the head-to-head: the warehouse line and every pitch the two have
  exchanged on the zone plot, colored by result
- `/query` — CUSTOM QUERIES: a leaderboard over any pitch-level slice. Pick
  pitchers or hitters, a season back to 2015, one of fifteen stats, a minimum
  sample in that stat's own unit, and the modules' pitch filters; get the
  league ranked best-first for the role, sortable, as a CSV, each row opening
  that player's module on the same slice. One grouped Savant search per board,
  so it needs no API. No runners-on filter — Savant's search doesn't honor one
- `/playoffs` — title odds, schedule, bracket, wild card, and the WORLD SERIES
  forecast: each game called off the clubs' run-based strength and the
  starters' pitch-mix matchups, played out exactly. Once a game is final it
  shows the call from before Game 1 beside how it stands — tiles, a before /
  after row of outcomes with the one that happened ticked, and each game's
  pre-series odds next to its score. Seasons from 2022 carry every tab;
  2017–2021, back to Savant's first arsenal board, the World Series alone
- `/api/games`, `/api/search` — same-origin proxies for the day's schedule and
  the header typeahead, both reusing `lib/mlb/`'s cached server fetch so the
  client scoreboard bar and search box never hit statsapi cross-origin

Everything under `/league`, `/team`, `/player` and `/game` comes from the public
MLB Stats API through `lib/mlb/`. Only `/ask`, the modules (`/pitcher`,
`/hitter`, `/matchup`) and the projection columns touch our own API, and the
modules fall back to Savant when it doesn't answer — the deployed site has
none. `/query` reads Savant alone.

## Tests

```bash
pytest                                        # cleaning, feature math, ask parsing, projection leakage
cd frontend && for f in lib/*.check.ts; do npx tsx "$f"; done
```

Each `lib/*.check.ts` is a plain `node:assert` script — no runner, no fixtures —
covering the frontend logic that isn't a straight field read, where a plausible
wrong answer is worse than a crash:

| Check | What it pins down |
| --- | --- |
| `mlb.check.ts` | clinch marks, games back, head-to-head, log5 win probability, leaderboard merging, draft/signing text, park factors, heat shading, day math |
| `advanced.check.ts` | the Savant CSV reader (`"Last, First"` shifts every column if commas are split naively), the column catalogues, the custom board's query parsing, and the CSV writer round-tripping back through the reader |
| `gamefeed.check.ts` | which pitch counts as a swing and miss, one row per player rather than one per batted ball, and which side of a win-probability swing the batter is on |
| `abs.check.ts` | pulling Savant's ABS table out of the 1.6 MB page it is embedded in, next to a second array a loose regex would grab instead |
| `metrics.check.ts` | the zone grid's batter-normalized pitch height, the BA denominator (walks and sacs are plate appearances but not at-bats), pitch-result buckets (reaching on an error isn't a hit), mirroring lefties' break, and a compared tile's change — points not percent, and colored only on a big enough sample |
| `filters.check.ts` | a filtered slice round-tripping through its own URL, junk in a pasted one rejected, an empty `?b=` read as any count rather than 0, and SPLIT AT / HALVES leaving no day in both ranges or between them |
| `matchupEdge.check.ts` | small samples pulled toward the league, the best and worst pitch the right way round, and the platoon split: a lefty weighted by the mix lefties see, a switch-hitter on the side opposite the pitcher |
| `customQuery.check.ts` | the modules' filters as Savant parameters (two strikes is every two-strike count), pitcher boards led by the lowest allowed, and the sample floor |
| `worldSeries.check.ts` | log5 and home field, the starters' swing, the rotation projection, and the series played out exactly |
| `playoffs.check.ts` | the seeding: a division winner outranks every club that didn't win one, and the bracket doesn't reseed after the wild-card round |

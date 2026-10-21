# api/

The FastAPI service between the Postgres warehouse (`savant` schema) and the
Next.js frontend. It runs locally only: the deployed site has no hosted API,
so every page that calls it falls back to Savant or to a snapshot in
`frontend/data/`.

```bash
uvicorn api.main:app --reload --port 8000    # docs at http://localhost:8000/docs
```

| File | What it serves |
| --- | --- |
| `main.py` | The app: CORS from `FRONTEND_ORIGINS`, `/health`, and the four routers |
| `schemas.py` | Pydantic response models for every endpoint |
| `routers/pitches.py` | Player typeahead (`/api/pitchers`, `/api/batters`), one player's full pitch payload thrown or seen (`/pitches`, with a `vs` filter for one opponent), and a pitcher's mix by batter side (`/mix`) |
| `routers/matchups.py` | Batter-vs-pitcher lines for the pregame lineup card. The counting is SQL; the rates are `summarize()` in Python, so they're testable without a database |
| `routers/ask.py` | `/api/ask`: a thin wrapper. Parsing is `src/stat_sightline/query/parse.py`, the SQL is `run.py` |
| `routers/standings.py` | The standings projection and playoff odds, worked out from the files `scripts/train_standings.py` writes plus MLB's live schedule. No database needed; cached per season, day and model file; `503` until the script has run |

The full endpoint list, with parameters, is in the root README's API table.

Conventions: every query is parameterised. Where a column name has to vary
(pitcher or batter), it's picked from a fixed pair in code, never taken from
the request. Routers open a connection per request from the cached engine in
`src/stat_sightline/db/`.

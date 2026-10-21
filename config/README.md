# config/

`settings.py` is the one place configuration is read: environment variables,
or a `.env` at the project root. Everything in the backend imports from it
rather than reading `os.environ` itself.

| Setting | Default | Used by |
| --- | --- | --- |
| `DATABASE_URL` (or the `PG*` vars) | — | the API and every script that touches Postgres |
| `DATABASE_URL_UNPOOLED` | falls back to `DATABASE_URL` | DDL and bulk loads: `database_url(direct=True)` |
| `STATCAST_CACHE_DIR` | `data/raw` | the ETL's parquet cache |
| `ETL_CHUNK_DAYS` | `3` | days per Statcast request window |
| `STANDINGS_DATA_DIR` | `data/standings` | `games.csv` + `model.pkl` for the projection |
| `FRONTEND_ORIGINS` | `http://localhost:3000` | the API's CORS allowlist |

Why there are two database URLs (Neon's pooled vs. direct) is under "Pooled
vs direct" in the root README.

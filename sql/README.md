# sql/

The warehouse schema, applied in order. Everything lives in the `savant`
schema.

| File | What it creates | How it's applied |
| --- | --- | --- |
| `01_schema.sql` | `pitches`: one row per pitch, Statcast's own grain, keyed on `(game_pk, at_bat_number, pitch_number)`. Plus the `players` and `games` dimensions, and the indexes the API filters on | `python scripts/init_db.py` |
| `02_feature_views.sql` | Views over `pitches`: batted balls with the barrel call, attack zones (heart / shadow / chase / waste), and swing/take run values | `psql "$DATABASE_URL" -f sql/02_feature_views.sql` |

Both are safe to re-run. The ETL's upserts (`src/stat_sightline/etl/load.py`)
rely on the grain key in `01_schema.sql`, so a reload replaces rows rather
than duplicating them.

Storage: on Neon's 1 GB plan, a full season of pitches is roughly 390 MB, so
the hosted warehouse keeps one season at a time.

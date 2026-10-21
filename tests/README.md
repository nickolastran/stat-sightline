# tests/

pytest for the Python side. Every test is offline: no database, no network,
no model file. They build the rows a query or feed would return and test the
logic on top of them.

```bash
pytest          # from the repo root; pyproject.toml sets pythonpath and testpaths
```

| File | What it pins down |
| --- | --- |
| `test_clean.py` | Shaping raw Statcast output for the warehouse |
| `test_features.py` | Barrel and hard-hit calls, attack zones, swing/take run values |
| `test_ask.py` | Question parsing: every phrasing `/ask` understands, and the ones it refuses |
| `test_pitchers.py` | The player typeahead: accent-folded matching, name order, workload ranking |
| `test_matchups.py` | Batter-vs-pitcher rates and the "top three pitches" mix |
| `test_standings.py` | The projection, including that rolling features never read the future |
| `test_odds.py` | The playoff-odds simulation |

The frontend has its own checks: plain `node:assert` scripts at
`frontend/lib/*.check.ts`, described in `frontend/lib/README.md`.

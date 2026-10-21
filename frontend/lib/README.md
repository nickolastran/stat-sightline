# frontend/lib/

Every data read and every calculation the pages make. Components import from
here and render the result. Each file opens with a comment on what it reads,
from where, and why it's shaped that way.

## Data clients

| File | Reads |
| --- | --- |
| `mlb/` | The public MLB Stats API: `core.ts` (fetch + shared helpers), then one file per area: `schedule`, `standings`, `teams`, `players`, `playerDetail`, `career`, `leaders`, `boxscore`, `game`, `awards`, `search`, `stats`. Import from `@/lib/mlb` (`index.ts` re-exports all of them) |
| `api.ts` | Our FastAPI warehouse, with snapshot fallbacks from `data/` |
| `advanced.ts` | Savant leaderboards (CSV) joined to MLB's and FanGraphs' lines; the stats boards and custom board; `parseCsv` / `csvOf` |
| `statcast.ts` | Savant's Statcast search: one player's season of pitches, or one pitcher-batter pair |
| `abs.ts`, `batTracking.ts`, `spray.ts` | Savant's ABS page, bat-tracking board, and batted-ball coordinates |
| `draft.ts`, `injuries.ts`, `minors.ts`, `salaries.ts` | One board each, off MLB (salaries off `data/salaries.csv`) |

## Models and calculations

| File | Does |
| --- | --- |
| `metrics.ts` | Pitch-slice summaries (whiff, chase, CSW, xwOBA…), the zone grid, arsenal rows, pitch-result buckets, the comparison delta and its good/bad call, `fmt` |
| `filters.ts` | The modules' filter state, its URL form, and the comparison ranges |
| `matchupEdge.ts` | Hitter vs. pitcher by pitch mix, with the platoon split |
| `worldSeries.ts` | The World Series called game by game and played out exactly |
| `customQuery.ts` | Custom Queries: stats catalogue, filters → Savant parameters, ranking |
| `playoffs.ts`, `cwpa.ts` | Seeding, the bracket, series odds; championship WPA |
| `rolling.ts`, `sequencing.ts`, `swingTake.ts`, `timesThrough.ts`, `gamefeed.ts` | Statcast panels: rolling form, pitch sequencing, swing/take by zone, times through the order, the daily game feed |
| `pitchColors.ts` | The chart palette and marker shapes |

## Hooks and site helpers

`useSetParam`, `useTypeahead`, `useTimeZone`, `useFavoriteTeam`;
`sortTable.ts`, `leagueSections.ts`, `site.ts`, `og.tsx`.

## Checks

A file with logic worth pinning down has a `*.check.ts` beside it: a plain
`node:assert` script with no runner and no fixtures, covering the cases where
a plausible wrong answer is worse than a crash. There are 21.

```bash
npx tsx lib/metrics.check.ts                     # one
for f in lib/*.check.ts; do npx tsx "$f"; done   # all
```

`fetchTimeout.check.ts` is the exception: it guards a rule rather than a
calculation, that every upstream client gives up on a hung source.

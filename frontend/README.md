# frontend/

The Next.js 16 app (App Router, Turbopack, Tailwind v4, Recharts, Framer
Motion), deployed on Vercel with this folder as the project root.

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # what Vercel runs
```

| Folder | What's there |
| --- | --- |
| [`app/`](app/README.md) | Routes: one folder per page, plus a few route handlers (CSV, proxies, share cards) |
| [`components/`](components/README.md) | UI, grouped by where it's used: the analysis modules, the league site, generic primitives |
| [`lib/`](lib/README.md) | Every data read and every calculation, kept out of components so it can be checked without a browser |
| [`data/`](data/README.md) | Snapshots and static tables, committed so the deployed site works with no API |
| `public/` | Static files served as-is (the search-console verification file) |

## Where the data comes from

| Source | Read through | Needs |
| --- | --- | --- |
| MLB Stats API (scores, standings, rosters, players, games) | `lib/mlb/` | nothing; public |
| Baseball Savant (leaderboards, Statcast search) | `lib/advanced.ts`, `lib/statcast.ts` | nothing; public, undocumented |
| Our FastAPI warehouse (`../api`) | `lib/api.ts` | `NEXT_PUBLIC_API_URL`, local only |
| Snapshots | `data/*.json` | a daily GitHub Action |

Production has **no hosted API**. Every page that calls it falls back to
Savant or to a snapshot, so the site works without one. `NEXT_PUBLIC_API_URL`
defaults to `http://localhost:8000` under `next dev` only. It's inlined at
build time, so changing it on Vercel takes a redeploy.

## Conventions

- **Server components fetch; client components interact.** Pages read data on
  the server with Next's fetch cache (`revalidate` per source), and pass
  plain data to `"use client"` components for filtering, sorting and hover.
- **Every upstream call has a timeout** (8s; 24s for Statcast search), so one
  slow source can't hang a page or blow Vercel's 60-second prerender budget.
  `lib/fetchTimeout.check.ts` enforces it.
- **State lives in the URL.** Filters, seasons, tabs and queries are search
  params, so any view is a shareable link.
- **Each source fails on its own.** A dead feed costs its own panel, shown as
  a notice, never the whole page.
- **Don't delete `.next/` while `next dev` is running.** Turbopack's cache has
  a single writer, and deleting it under a live server corrupts it.

Checks: `for f in lib/*.check.ts; do npx tsx "$f"; done` (see
[`lib/README.md`](lib/README.md)).

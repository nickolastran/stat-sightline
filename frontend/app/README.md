# frontend/app/

App Router routes. Each folder is a URL; `page.tsx` renders it, `loading.tsx`
is the skeleton shown while it streams, and `opengraph-image.tsx` (where
present) draws its link-preview card through `lib/og.tsx`. What each page
shows is described in the root README under "Frontend routes".

| Route | Folder | Reads |
| --- | --- | --- |
| `/` | `page.tsx` | landing page, player search |
| **Analysis modules** (share the module sidebar) | | |
| `/pitcher/[id]`, `/hitter/[id]` | `pitcher/`, `hitter/` | the warehouse, else Savant's Statcast search |
| `/matchup` | `matchup/` | Savant boards, the warehouse (head-to-head, mix), else Savant |
| `/query` | `query/` | Savant's grouped Statcast search |
| **League site** | | |
| `/dashboard` | `dashboard/` | MLB + the projection snapshot |
| `/league/[section]` | `league/` | MLB; sections are declared in `lib/leagueSections.ts` |
| `/team/[id]/[[...tab]]`, `/player/[id]/[[...tab]]` | `team/`, `player/` | MLB, Savant |
| `/game/[pk]` | `game/` | MLB live feed; the pregame card adds matchups |
| `/stats/[view]` | `stats/` | MLB + FanGraphs + Savant boards |
| `/playoffs` | `playoffs/` | MLB, the odds snapshot, Savant (World Series forecast) |
| `/compare`, `/compare/teams` | `compare/` | MLB |
| `/award/...`, `/draft`, `/injuries`, `/minors`, `/salaries` | one folder each | MLB, `data/award-votes.json`, `data/salaries.csv` |
| `/ask` | `ask/` | the warehouse (`/api/ask`) |
| `/signin` | `signin/` | placeholder until auth exists |

Route handlers (no page):

| Path | What it returns |
| --- | --- |
| `stats/[view]/csv/route.ts` | the custom stats board as a CSV, rebuilt from the same query string the page reads |
| `ask/card/route.tsx` | an Ask question's share card, as a route because the question lives in `?q=` |
| `api/games/route.ts`, `api/search/route.ts` | same-origin proxies for the scoreboard bar and the header search, so the browser never calls statsapi cross-origin |

Also here: `layout.tsx` (header, league bar, footer), `error.tsx`,
`not-found.tsx`, `robots.ts`, `sitemap.ts` and the icons.

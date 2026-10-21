# frontend/components/

React components, grouped by the part of the site that uses them. They render
data handed to them; fetching and math live in `lib/`. A component is
`"use client"` only when it needs state, effects or the browser.

| Folder | What's there |
| --- | --- |
| `dashboard/` | The analysis modules. `Sidebar` (module nav), `PlayerModule` (loads a player: warehouse, else Savant), `DashboardClient` (owns the filter state, tiles, comparison), `FilterPanel`, `ZonePlot` (scatter / density / hot-cold, color by pitch type or result), `MovementPlot`, `ArsenalTable`, `QueryTable` (Custom Queries board + CSV) |
| `mlb/` | The league site: scoreboard and game views (`LiveGame`, `Pregame`, `LineupCard`, `BoxScoreView`, `WinProbChart`), standings and playoffs (`Standings`, `PlayoffBracket`, `WorldSeriesForecast`), player and team panels, leaderboards, the stats boards (`AdvancedTable`, `CustomFilterBar`), Statcast panels (`SprayChart`, `SwingTakePanel`, `BatTrackingPanel`, `RollingChart`), and URL-bound controls (`ParamSelect`, `ParamTabs`, `ParamMultiSelect`, `SeasonSelect`) |
| `ui/` | Generic pieces with no baseball in them: `Panel`, `MetricCard` (a stat tile, optionally with its change from a comparison), `DataTable` (sortable, windowed), `StatTable`, `SegmentedControl`, `DatePicker`/`Calendar`, `Skeleton`s, `Notice` |
| `ask/` | The question box, the answer card, copy-link |
| `landing/` | The landing page's player search (also used as the modules' player picker) and access form |
| root | `SiteFooter`, `ScrollToTop`, `JsonLd` (structured data) |

`PitchChart.tsx` (a Recharts strike-zone scatter) isn't imported anywhere.
`dashboard/ZonePlot.tsx` replaced it.

Charts share one palette, `lib/pitchColors.ts`: six pitch-type colors chosen
to stay apart under color blindness, each paired with a marker shape, so a
chart never relies on hue alone. Pitch results reuse the same colors.

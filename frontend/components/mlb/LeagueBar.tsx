import Link from "next/link";
import StatsMenu from "@/components/mlb/StatsMenu";
import { LEAGUE_SECTIONS } from "@/lib/leagueSections";
import { seasonOf, todayPT } from "@/lib/mlb";

/*
 * League bar — the dashboard's reference sections, and the places you bring
 * your own question to rather than read a table off. Pinned under the header
 * so they stay reachable from any page; navigating in place, so the bar
 * itself carries you back out to another section.
 *
 * PLAYOFFS and STATISTICS follow the sections in the same row even though
 * neither is a `/league/` route, because from a reader's side they are the
 * same kind of thing: one strip of everywhere the site goes. The two that
 * aren't a league-wide board at all — a pair of players or clubs held up
 * against each other, and the season's hardware — sit behind the grid at the
 * end instead, out of the run of sections without being any harder to reach.
 *
 * The strip scrolls sideways on a narrow screen and wraps on a wide one,
 * which is not only about width. The last two tabs open a box under
 * themselves, and an absolutely-positioned box inside an `overflow-x`
 * ancestor is clipped by it — so the overflow is dropped at the size where
 * those boxes can actually be opened. Below it there is no hover to open one
 * with, and each is a plain link through to its first page.
 *
 * The grid's box is where both comparisons are reached from — the pages
 * themselves no longer cross-link, so the bar is the one place that switch
 * is made.
 */

/** One tab, so the ones at the end can't drift from the sections' chrome. */
const TAB =
  "flex h-7 shrink-0 items-center border border-line px-2 text-[10px] tracking-wider text-ink-2 hover:border-accent hover:text-ink";

/*
 * The grid at the end, and the box that drops out of it. Same hover /
 * focus-within opening as STATISTICS beside it, for the same reason: no
 * state, so no client bundle. Anchored to its right edge, where it sits.
 */
function MoreMenu() {
  return (
    <div className="group relative ml-auto shrink-0">
      <Link
        href="/compare"
        aria-label="More"
        className="flex h-7 items-center px-2 text-ink-2 group-focus-within:text-accent group-hover:text-accent"
      >
        <svg aria-hidden viewBox="0 0 10 10" className="h-3.5 w-3.5">
          {[0, 4, 8].map((y) =>
            [0, 4, 8].map((x) => (
              <rect key={`${x}-${y}`} x={x} y={y} width="2" height="2" fill="currentColor" />
            )),
          )}
        </svg>
      </Link>
      {/* `invisible` rather than `hidden`, so the links inside stay in the tab
          order and focus-within can open the box for a keyboard reader. */}
      <div className="invisible absolute top-full right-0 z-50 -translate-y-1 border border-line bg-bg p-3 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
        <div className="space-y-1.5">
          {[
            { href: "/compare", label: "COMPARE PLAYERS" },
            { href: "/compare/teams", label: "COMPARE TEAMS" },
            { href: "/award", label: "AWARDS INDEX" },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="block whitespace-nowrap text-[11px] tracking-[0.2em] text-accent hover:underline"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LeagueBar() {
  return (
    <div className="sticky top-12 z-30 border-b border-line bg-bg">
      <div className="no-scrollbar flex items-center gap-px overflow-x-auto px-4 py-1.5 lg:flex-wrap lg:overflow-x-visible">
        {LEAGUE_SECTIONS.filter((s) => !("inBar" in s) || s.inBar).map((s) => (
          <Link key={s.id} href={`/league/${s.id}`} className={TAB}>
            {s.tab}
          </Link>
        ))}
        <Link href="/playoffs" className={TAB}>
          PLAYOFFS
        </Link>
        <StatsMenu current={seasonOf(todayPT())} />
        <MoreMenu />
      </div>
    </div>
  );
}

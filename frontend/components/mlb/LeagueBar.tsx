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
 * which is not only about width. The last two open a box under
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
 * The grid at the end, and the box that drops out of it.
 *
 * Two ways in, and they mean different things. A hover opens the box and
 * letting go closes it — a reader passing over sees what is there. A click
 * pins it open and it stays until something else is clicked, the box or the
 * page; a reader who meant to go there gets to read down it.
 *
 * Both are a checkbox and CSS rather than state: `group-hover` is the
 * passing look, `peer-checked` the pin, and a fixed transparent sheet under
 * the box while it is pinned is what a click off it lands on. No client
 * bundle for a menu of three links.
 *
 * Anchored to its right edge, which is where the grid sits.
 */
function MoreMenu() {
  return (
    <div className="group relative ml-auto shrink-0">
      <input
        id="more-menu"
        type="checkbox"
        aria-label="More"
        className="peer sr-only"
      />
      {/* The click-off. Only under the pinned box, and under the box itself —
          anything the box is over stays clickable through the menu's own z. */}
      <label
        htmlFor="more-menu"
        aria-hidden
        className="fixed inset-0 z-40 hidden cursor-default peer-checked:block"
      />
      <label
        htmlFor="more-menu"
        className="relative z-50 flex h-7 cursor-pointer items-center px-2 text-ink-2 peer-checked:text-accent peer-focus-visible:text-accent group-hover:text-accent"
      >
        <svg aria-hidden viewBox="0 0 10 10" className="h-3.5 w-3.5">
          {[0, 4, 8].map((y) =>
            [0, 4, 8].map((x) => (
              <rect key={`${x}-${y}`} x={x} y={y} width="2" height="2" fill="currentColor" />
            )),
          )}
        </svg>
      </label>
      {/* `invisible` rather than `hidden`, so the links inside stay in the tab
          order and focus-within can open the box for a keyboard reader. */}
      <div className="invisible absolute top-full right-0 z-50 -translate-y-1 border border-line bg-bg p-3 opacity-0 shadow-lg transition peer-checked:visible peer-checked:translate-y-0 peer-checked:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
        <div className="space-y-1.5">
          {[
            { href: "/minors", label: "MINOR LEAGUES" },
            { href: "/draft", label: "DRAFT TRACKER" },
            { href: "/injuries", label: "INJURY REPORT" },
            { href: "/salaries", label: "SALARIES" },
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

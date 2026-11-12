import Link from "next/link";
import StatsMenu from "@/components/mlb/StatsMenu";
import MyTeamLink from "@/components/mlb/MyTeamLink";
import { LEAGUE_SECTIONS } from "@/lib/leagueSections";
import { inPostseason, seasonOf, todayPT, worldSeriesOver } from "@/lib/mlb";

/*
 * League bar — the dashboard's reference sections, and the places you bring
 * your own question to rather than read a table off. Pinned under the header
 * so they stay reachable from any page; navigating in place, so the bar
 * itself carries you back out to another section.
 *
 * STATISTICS and MODULES follow the sections in the same row even though
 * neither is a `/league/` route, because from a reader's side they are the
 * same kind of thing: one strip of everywhere the site goes. PLAYOFFS leads
 * the row while the postseason is on, and waits in the grid the rest of the
 * year. From the World Series' last out to New Year's, the three day-of-games
 * sections fold into one SCORES tab. The two that
 * aren't a league-wide board at all — a pair of players or clubs held up
 * against each other, and the season's hardware — sit behind the grid at the
 * end instead, out of the run of sections without being any harder to reach.
 *
 * The strip scrolls sideways on a narrow screen and wraps on a wide one,
 * which is not only about width. The last two open a box under
 * themselves, and an absolutely-positioned box inside an `overflow-x`
 * ancestor is clipped by it — so the overflow is dropped at the size where
 * those boxes can actually be opened. Below it there is no hover to open one
 * with: STATISTICS is a plain link through to its first page, SCORES splits
 * back into its tabs, and the grid — opened by a tap — hangs its box off the
 * viewport (`fixed`) instead, where the strip can't clip it.
 *
 * The grid's box is where both comparisons are reached from — the pages
 * themselves no longer cross-link, so the bar is the one place that switch
 * is made.
 */

/** One tab, so the ones at the end can't drift from the sections' chrome. */
const TAB =
  "flex h-9 shrink-0 items-center border border-line px-2 lg:h-7 text-[11px] tracking-wider text-ink-2 hover:border-accent hover:text-ink";

/** The three day-of-games sections, folded under one tab once the World
 *  Series is over — a winter of empty slates doesn't earn three tabs. */
const SCORES = new Set(["gamefeed", "scoreboard", "probables"]);

const SCORE_LINKS = (final: string) => [
  { href: `/league/gamefeed?date=${final}`, label: "GAME FEED" },
  { href: `/league/scoreboard?date=${final}`, label: "SCOREBOARD" },
  { href: "/league/probables", label: "PROBABLES" },
];

/*
 * SCORES, the offseason's one tab for them: the same hover box as
 * STATISTICS. The feed and the scoreboard open on the World Series' last
 * day rather than on an empty today.
 */
function ScoresMenu({ final }: { final: string }) {
  return (
    <div className="group relative hidden shrink-0 lg:block">
      <Link
        href={`/league/scoreboard?date=${final}`}
        className="flex h-9 items-center gap-1 border border-line px-2 lg:h-7 text-[11px] tracking-wider text-ink-2 group-focus-within:border-accent group-focus-within:text-ink group-hover:border-accent group-hover:text-ink"
      >
        SCORES
        <span aria-hidden className="text-[8px] leading-none">▼</span>
      </Link>
      <div className="invisible absolute top-full left-0 z-50 -translate-y-1 border border-line bg-bg p-3 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
        <div className="space-y-1.5">
          {SCORE_LINKS(final).map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className="block whitespace-nowrap text-[11px] tracking-[0.2em] text-ink hover:text-accent hover:underline"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

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
function MoreMenu({ playoffs }: { playoffs: boolean }) {
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
        className="relative z-50 flex h-9 cursor-pointer items-center px-3 lg:h-7 lg:px-2 text-ink-2 peer-checked:text-accent peer-focus-visible:text-accent group-hover:text-accent"
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
      <div className="invisible absolute top-full right-0 z-50 max-lg:fixed max-lg:top-24 max-lg:right-4 -translate-y-1 border border-line bg-bg p-3 opacity-0 shadow-lg transition peer-checked:visible peer-checked:translate-y-0 peer-checked:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
        <div className="space-y-1.5">
          {[
            ...(playoffs ? [{ href: "/playoffs", label: "PLAYOFFS" }] : []),
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
              className="block whitespace-nowrap text-[11px] tracking-[0.2em] text-ink hover:text-accent hover:underline"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function LeagueBar() {
  const today = todayPT();
  const [live, final] = await Promise.all([
    inPostseason(seasonOf(today), today).catch(() => false),
    worldSeriesOver(today).catch(() => null),
  ]);
  return (
    <div className="sticky top-12 z-30 border-b border-line bg-bg">
      <div className="no-scrollbar flex items-center gap-px overflow-x-auto px-4 py-1.5 lg:flex-wrap lg:overflow-x-visible">
        {live && (
          <Link href="/playoffs" className={TAB}>
            PLAYOFFS
          </Link>
        )}
        {final && (
          <>
            <ScoresMenu final={final} />
            {/* No hover on a phone to open the box with, so its three links
                are tabs of their own there — the strip scrolls anyway. */}
            {SCORE_LINKS(final).map((l) => (
              <Link key={l.label} href={l.href} className={`${TAB} lg:hidden`}>
                {l.label}
              </Link>
            ))}
          </>
        )}
        {LEAGUE_SECTIONS.filter(
          (s) => (!("inBar" in s) || s.inBar) && !(final && SCORES.has(s.id)),
        ).map((s) => (
          <Link key={s.id} href={`/league/${s.id}`} className={TAB}>
            {s.tab}
          </Link>
        ))}
        {/* The pitch-level modules — pitching, hitting, matchups, queries —
            open on their first, the heaviest-workload pitcher. */}
        <Link href="/pitcher/top" className={TAB}>
          MODULES
        </Link>
        <Link href="/free-agents" className={TAB}>
          FREE AGENTS
        </Link>
        <StatsMenu current={seasonOf(today)} />
        <MyTeamLink className={TAB} />
        <MoreMenu playoffs={!live} />
      </div>
    </div>
  );
}

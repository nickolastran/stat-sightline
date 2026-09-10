import Link from "next/link";
import StatsMenu from "@/components/mlb/StatsMenu";
import { LEAGUE_SECTIONS } from "@/lib/leagueSections";
import { seasonOf, todayPT } from "@/lib/mlb";

/*
 * League bar — the dashboard's reference sections, and the three places you
 * bring your own question to rather than read a table off. Pinned under the
 * header so they stay reachable from any page; navigating in place, so the
 * bar itself carries you back out to another section.
 *
 * PLAYOFFS, COMPARE and STATISTICS follow the sections in the same row even
 * though none of them is a `/league/` route, because from a reader's side
 * they are the same kind of thing: one strip of everywhere the site goes.
 *
 * The strip scrolls sideways on a narrow screen and wraps on a wide one,
 * which is not only about width. STATISTICS opens a box under itself, and an
 * absolutely-positioned box inside an `overflow-x` ancestor is clipped by it —
 * so the overflow is dropped at the size where that box can actually be
 * opened. Below it there is no hover to open one with, and the tab is a plain
 * link through to the first board.
 *
 * COMPARE lands on the player page; that page carries its own link across to
 * the club one, so the bar doesn't need a second tab for it.
 */

/** One tab, so the three at the end can't drift from the sections' chrome. */
const TAB =
  "flex h-7 shrink-0 items-center border border-line px-2 text-[10px] tracking-wider text-ink-2 hover:border-accent hover:text-ink";

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
        <Link href="/compare" className={TAB}>
          COMPARE
        </Link>
        <StatsMenu current={seasonOf(todayPT())} />
      </div>
    </div>
  );
}

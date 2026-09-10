import Link from "next/link";
import StatsMenu from "@/components/mlb/StatsMenu";
import { LEAGUE_SECTIONS } from "@/lib/leagueSections";
import { seasonOf, todayPT } from "@/lib/mlb";

/*
 * League bar — the dashboard's reference sections. Pinned under the header so
 * they stay reachable from any page; navigating in place, so the bar itself
 * carries you back out to another section.
 *
 * COMPARE and STATISTICS sit at the end rather than among them, because
 * neither is a `/league/` section: they are the two places you bring your own
 * question to rather than read a table off. STATISTICS is five boards and a
 * season apiece, so it opens a box instead of navigating on its own — which
 * is also why the pair sits outside the strip that scrolls, an absolutely-
 * positioned box inside an `overflow-x` ancestor being clipped by it.
 *
 * COMPARE lands on the player page; that page carries its own link across to
 * the club one, so the bar doesn't need a second tab for it.
 */

/** One tab, so the two out here can't drift from the sections' own chrome. */
const TAB =
  "flex h-7 shrink-0 items-center border border-line px-2 text-[10px] tracking-wider text-ink-2 hover:border-accent hover:text-ink";

export default function LeagueBar() {
  return (
    <div className="sticky top-12 z-30 border-b border-line bg-bg">
      <div className="flex items-center gap-px px-4 py-1.5">
        <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-px overflow-x-auto">
          {LEAGUE_SECTIONS.filter((s) => !("inBar" in s) || s.inBar).map((s) => (
            <Link key={s.id} href={`/league/${s.id}`} className={TAB}>
              {s.tab}
            </Link>
          ))}
        </div>
        <Link href="/compare" className={TAB}>
          COMPARE
        </Link>
        <StatsMenu current={seasonOf(todayPT())} />
      </div>
    </div>
  );
}

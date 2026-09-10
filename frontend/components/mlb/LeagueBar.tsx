import Link from "next/link";
import StatsMenu from "@/components/mlb/StatsMenu";
import { LEAGUE_SECTIONS } from "@/lib/leagueSections";
import { seasonOf, todayPT } from "@/lib/mlb";

/*
 * League bar — the dashboard's reference sections. Pinned under the header so
 * they stay reachable from any page; navigating in place, so the bar itself
 * carries you back out to another section.
 *
 * STATISTICS sits at the end rather than among them because it isn't one
 * section but five, and picking a season is part of picking one — so it opens
 * a box of boards instead of navigating on its own. It also sits outside the
 * strip that scrolls: an absolutely-positioned box inside an `overflow-x`
 * ancestor is clipped by it, and the menu would open into a scrollbar.
 */
export default function LeagueBar() {
  return (
    <div className="sticky top-12 z-30 border-b border-line bg-bg">
      <div className="flex items-center gap-px px-4 py-1.5">
        <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-px overflow-x-auto">
          {LEAGUE_SECTIONS.filter((s) => !("inBar" in s) || s.inBar).map((s) => (
            <Link
              key={s.id}
              href={`/league/${s.id}`}
              className="flex h-7 shrink-0 items-center border border-line px-2 text-[10px] tracking-wider text-ink-2 hover:border-accent hover:text-ink"
            >
              {s.tab}
            </Link>
          ))}
        </div>
        <StatsMenu current={seasonOf(todayPT())} />
      </div>
    </div>
  );
}

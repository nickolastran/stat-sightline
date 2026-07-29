import Link from "next/link";
import { LEAGUE_SECTIONS } from "@/lib/leagueSections";

/*
 * League bar — the dashboard's reference sections. Pinned under the header so
 * they stay reachable from any page; navigating in place, so the bar itself
 * carries you back out to another section.
 */
export default function LeagueBar() {
  return (
    <div className="sticky top-12 z-30 border-b border-line bg-bg">
      <div className="no-scrollbar flex items-center gap-px overflow-x-auto px-4 py-1.5">
        {LEAGUE_SECTIONS.map((s) => (
          <Link
            key={s.id}
            href={`/league/${s.id}`}
            className="flex h-7 shrink-0 items-center border border-line px-2 text-[10px] tracking-wider text-ink-2 hover:border-accent hover:text-ink"
          >
            {s.tab}
          </Link>
        ))}
      </div>
    </div>
  );
}

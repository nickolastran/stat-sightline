import Link from "next/link";
import { STANDINGS_VIEWS } from "@/lib/leagueSections";

/*
 * STANDINGS / WILD CARD, above the table each of them belongs to. Links rather
 * than a SegmentedControl: the two are separate server-rendered routes, so
 * switching is a navigation Next can prefetch, not local state.
 *
 * The season and game type ride along in the query string, so switching views
 * stays on the year you were reading rather than snapping back to today.
 */
export default function StandingsViews({
  active,
  query,
  hideWildCard = false,
}: {
  active: string;
  /** The current `?season=`/`?type=`, already serialised. */
  query: string;
  /** Spring training has no wild-card race, so don't offer the empty one. */
  hideWildCard?: boolean;
}) {
  return (
    <div role="group" aria-label="Standings view" className="flex gap-px">
      {STANDINGS_VIEWS.filter((v) => !(hideWildCard && v.id === "wildcard")).map((v) => (
        <Link
          key={v.id}
          href={`/league/${v.id}${query}`}
          aria-current={v.id === active ? "page" : undefined}
          className={`border px-2 py-1 text-[11px] tracking-wide ${
            v.id === active
              ? "border-accent bg-accent/15 font-bold text-ink"
              : "border-line text-ink-3 hover:bg-surface-2 hover:text-ink"
          }`}
        >
          {v.label}
        </Link>
      ))}
    </div>
  );
}

import Link from "next/link";
import {
  ADV_VIEWS,
  MENU_SEASONS,
  hasAllYears,
  type AdvView,
} from "@/lib/advanced";

/*
 * The STATISTICS tab, and the box of boards that drops out of it.
 *
 * Hover and keyboard focus both open it, and the tab itself is a link to the
 * first board — so a reader who can't hover, or is tabbing through, still
 * reaches the section rather than meeting a menu that only exists under a
 * mouse. CSS does the opening, which keeps the whole thing a server
 * component: there is no state here worth shipping a bundle for.
 *
 * A season is a link rather than a picker because each one is its own
 * server-rendered board — the same trade every other season control on the
 * site makes.
 */

/** The recent seasons the box lists, newest first. */
const menuYears = (current: number) =>
  Array.from({ length: MENU_SEASONS }, (_, i) => current - i);

const boards = ADV_VIEWS.filter((v) => v.id !== "top");

function Section({
  id,
  label,
  years,
}: {
  id: AdvView;
  label: string;
  years: number[];
}) {
  return (
    <div>
      <Link
        href={`/stats/${id}`}
        className="block text-[11px] tracking-[0.2em] text-accent hover:underline"
      >
        {label}
      </Link>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] tabular-nums">
        {years.map((y, i) => (
          <span key={y} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-line">|</span>}
            <Link
              href={`/stats/${id}?season=${y}`}
              className="text-ink-2 hover:text-accent hover:underline"
            >
              {y}
            </Link>
          </span>
        ))}
        {/* Only the player boards run the whole way back to the first tracked
            season — a club board's own picker is the same six years. */}
        {hasAllYears(id) && (
          <span className="flex items-center gap-1.5">
            <span className="text-line">|</span>
            <Link
              href={`/stats/${id}?season=all`}
              className="text-ink-2 hover:text-accent hover:underline"
            >
              All
            </Link>
          </span>
        )}
      </p>
    </div>
  );
}

export default function StatsMenu({ current }: { current: number }) {
  const years = menuYears(current);

  return (
    <div className="group relative shrink-0">
      <Link
        href="/stats/player-batting"
        className="flex h-7 items-center gap-1 border border-line px-2 text-[10px] tracking-wider text-ink-2 group-focus-within:border-accent group-focus-within:text-ink group-hover:border-accent group-hover:text-ink"
      >
        STATISTICS
        <span aria-hidden className="text-[8px] leading-none">▼</span>
      </Link>
      {/*
       * `invisible` rather than `hidden`, so the links inside stay in the tab
       * order and focus-within can open the box for a keyboard reader — a
       * display:none menu can never be focused into, and so never opens.
       *
       * Anchored to its right edge: the tab is the last thing on the bar, and
       * a box hanging off its left would open past the edge of a phone.
       */}
      <div className="invisible absolute top-full right-0 z-50 w-[19rem] -translate-y-1 border border-line bg-bg p-3 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
        <div className="space-y-3">
          {boards.map((v) => (
            <Section key={v.id} id={v.id} label={v.label} years={years} />
          ))}
          <Link
            href="/stats/top"
            className="block border-t border-line pt-2 text-[11px] tracking-[0.2em] text-accent hover:underline"
          >
            TOP PERFORMERS
          </Link>
        </div>
      </div>
    </div>
  );
}

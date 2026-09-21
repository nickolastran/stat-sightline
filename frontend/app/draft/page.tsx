import type { Metadata } from "next";
import { Suspense } from "react";
import ParamSelect from "@/components/mlb/ParamSelect";
import DraftBoard from "@/components/mlb/DraftBoard";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { seasonOf, todayPT } from "@/lib/mlb";
import {
  DRAFT_FIRST_SEASON,
  draftFilters,
  getDraft,
  pickDraftYear,
} from "@/lib/draft";

/*
 * The draft tracker — every pick of one year's Rule 4 draft, and every draft
 * back to the first one in 1965.
 *
 * One route with the year in the query string, like the minor-league page:
 * the year is a control, and a reader here is comparing drafts. The board
 * itself is a client component because the filtering is over rows already
 * held — see components/mlb/DraftBoard.tsx.
 */

export const metadata: Metadata = { title: "MLB Draft" };

async function Body({ year }: { year: number }) {
  try {
    const picks = await getDraft(year);
    if (picks.length === 0)
      return (
        <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
          NO PICKS ON RECORD FOR {year}
        </p>
      );
    return <DraftBoard picks={picks} filters={draftFilters(picks)} />;
  } catch {
    return (
      <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
        UNAVAILABLE — MLB API UNREACHABLE
      </p>
    );
  }
}

export default async function DraftPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const current = seasonOf(todayPT());
  const year = pickDraftYear((await searchParams).year, current);
  /* Newest first — the draft most people want is the last one held. */
  const years = Array.from(
    { length: current - DRAFT_FIRST_SEASON + 1 },
    (_, i) => String(current - i),
  );

  return (
    <div className="mx-auto max-w-[88rem] space-y-3 p-3">
      {/* Panel's chrome with the heading set as a page title rather than a
          panel label — this route is one board, so the year it is showing is
          the biggest thing on it. */}
      <section className="flex flex-col border border-line bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5">
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            {year} - MLB Draft
          </h1>
          <ParamSelect
            param="year"
            label="YEAR"
            value={String(year)}
            options={years.map((y) => ({ value: y, label: y }))}
          />
        </header>
        <div className="flex-1 p-3">
          {/* Keyed on the year, so picking another one re-suspends into the
              skeleton rather than holding the last draft on screen. */}
          <Suspense key={year} fallback={<SkeletonTable rows={12} heading={false} />}>
            <Body year={year} />
          </Suspense>
        </div>
      </section>
    </div>
  );
}

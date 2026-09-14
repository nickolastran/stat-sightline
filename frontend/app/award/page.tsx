import type { Metadata } from "next";
import Link from "next/link";
import Panel from "@/components/ui/Panel";
import { awardLabel, ballotIndex } from "@/lib/mlb";

/*
 * The awards index: every season the BBWAA's voting is on record for, and the
 * six ballots inside it. The award pages themselves carry the vote; this is
 * the way into a year of them.
 */

export const metadata: Metadata = {
  title: "AWARDS VOTING — STAT//SIGHTLINE",
  description:
    "BBWAA voting results by season — MVP, Cy Young and Rookie of the Year, both leagues, with every player who drew a vote.",
};

export default function AwardIndexPage() {
  const years = ballotIndex();

  return (
    <div className="mx-auto max-w-[110rem] px-4">
      <section className="space-y-3 border-x border-line px-4 py-8 sm:px-8">
        <div>
          <p className="text-xs tracking-[0.3em] text-ink-3">INDEX</p>
          <h1 className="mt-2 text-2xl tracking-[0.15em] text-ink">
            AWARDS VOTING
          </h1>
          <p className="mt-2 text-[10px] tracking-widest text-ink-3">
            {years.length} SEASONS · {years[years.length - 1]?.season}–
            {years[0]?.season}
          </p>
        </div>

        <Panel title="BY SEASON">
          <ul className="divide-y divide-grid border border-line">
            {years.map(({ season, awards }) => (
              <li
                key={season}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 hover:bg-surface-2"
              >
                <span className="w-12 shrink-0 text-[13px] font-bold tabular-nums text-ink">
                  {season}
                </span>
                {awards.map((id) => (
                  <Link
                    key={id}
                    href={`/award/${id}/${season}`}
                    className="text-[12px] tracking-wide text-accent hover:underline"
                  >
                    {awardLabel(id).toUpperCase()}
                  </Link>
                ))}
              </li>
            ))}
          </ul>
        </Panel>

        <p className="border border-line bg-bg px-3 py-2 text-[10px] leading-5 text-ink-3">
          Voting results are the BBWAA&apos;s own. MLB&apos;s feed publishes the
          winner of a vote and not the ballot, so awards outside these six —
          Gold Gloves, Silver Sluggers, the postseason awards — have a page per
          season but list winners only.
        </p>

        <Link
          href="/"
          className="inline-block border border-line px-3 py-1.5 text-xs tracking-widest text-ink-2 hover:border-accent hover:text-ink"
        >
          ← HOME
        </Link>
      </section>
    </div>
  );
}

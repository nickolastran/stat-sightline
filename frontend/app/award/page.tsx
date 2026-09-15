import type { Metadata } from "next";
import Link from "next/link";
import Panel from "@/components/ui/Panel";
import { AWARD_PAGES, ballotIndex } from "@/lib/mlb";

/*
 * The awards index — the way into an award rather than into a year.
 *
 * Every award the feed will answer for, in one box — the Chalmers Award of
 * 1911 through this week's Player of the Week. Each links to its own page,
 * which is every winner it has ever had, a decade at a time. One award to a
 * line, in the order the awards are read in rather than alphabetically — the
 * two leagues of each one together, the way the vote is announced.
 *
 * Under it the seasons whose BBWAA ballots are on record: a ballot is one
 * page per season for all eight votes at once, so it is a different kind of
 * link and gets its own panel rather than a column beside the awards.
 */

export const metadata: Metadata = {
  title: "AWARDS INDEX — STAT//SIGHTLINE",
  description:
    "Every MLB award — MVP, Cy Young, Rookie and Manager of the Year, the postseason and monthly awards, Gold Gloves and Silver Sluggers, back to the Chalmers Award of 1911 — with every winner by decade, and the BBWAA's ballots season by season.",
};

export default function AwardIndexPage() {
  const years = ballotIndex();

  return (
    <div className="mx-auto max-w-[110rem] px-4">
      <section className="space-y-3 border-x border-line px-4 py-8 sm:px-8">
        <h1 className="text-2xl tracking-[0.15em] text-ink">
          MLB AWARDS AND HONORS
        </h1>

        <Panel title="AWARDS">
          <ul className="border border-line px-3 py-2">
            {AWARD_PAGES.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/award/${a.id}`}
                  className="block py-0.5 text-[12px] tracking-wide text-accent hover:underline"
                >
                  {a.label} Winners
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="AWARD VOTING SUMMARIES">
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 border border-line px-3 py-2.5">
            {years.map(({ season }) => (
              <Link
                key={season}
                href={`/award/${season}`}
                className="text-[13px] tabular-nums text-accent hover:underline"
              >
                {season}
              </Link>
            ))}
          </div>
        </Panel>

        <p className="border border-line bg-bg px-3 py-2 text-[10px] leading-5 text-ink-3">
          A season above is the whole ballot — every player who drew a vote in
          the eight the BBWAA polls, with the line he polled on. The awards
          nobody votes on have winners only, which is all MLB&apos;s feed
          publishes for them.
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

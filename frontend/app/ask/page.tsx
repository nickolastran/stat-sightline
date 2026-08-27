import type { Metadata } from "next";
import Link from "next/link";
import AskBox from "@/components/ask/AskBox";
import AskResult from "@/components/ask/AskResult";
import { ask } from "@/lib/api";

/*
 * Plain-English questions against the pitch warehouse. The question lives in
 * the URL, so an answer is shareable and the back button walks the session's
 * questions. A dead API degrades to an inline notice — the box still works,
 * the same way the league pages survive an unreachable source.
 */

export const metadata: Metadata = {
  title: "ASK — STAT//SIGHTLINE",
  description: "Ask the Statcast pitch warehouse a question in plain English.",
};

const EXAMPLES = [
  "how many home runs did aaron judge hit this year",
  "ohtani homers against giants",
  "most home runs at yankee stadium",
  "juan soto batting average vs lefties",
  "home runs allowed by tarik skubal",
  "judge vs ohtani home runs",
];

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const question = q?.trim() ?? "";

  let data = null;
  let failure: string | null = null;
  if (question.length >= 2) {
    try {
      data = await ask(question);
    } catch {
      failure = "THE WAREHOUSE API DIDN'T ANSWER. IS uvicorn RUNNING ON :8000?";
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="border-x border-line px-4 py-8 sm:px-8">
        <p className="mb-4 text-xs tracking-[0.3em] text-ink-3">
          ASK // PITCH WAREHOUSE
        </p>
        <AskBox initial={question} autoFocus={!question} />

        {data?.data_through && (
          <p className="mt-2 text-[10px] tracking-wider text-ink-3">
            DATA THROUGH {data.data_through}
          </p>
        )}

        <div className="mt-6">
          {failure && (
            <p className="border border-crit bg-surface px-4 py-3 text-xs text-crit">
              {failure}
            </p>
          )}
          {data && <AskResult data={data} />}
          {!data && !failure && (
            <div className="border border-line bg-surface p-6">
              <h2 className="text-[10px] tracking-[0.25em] text-ink-3">
                TRY ONE OF THESE
              </h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {EXAMPLES.map((e) => (
                  <li key={e}>
                    <Link
                      href={`/ask?q=${encodeURIComponent(e)}`}
                      className="block border border-line px-3 py-1.5 text-xs text-ink-2 hover:border-accent hover:text-ink"
                    >
                      {e}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-[10px] leading-5 tracking-wider text-ink-3">
                UNDERSTOOD: HR · HITS · SINGLES/DOUBLES/TRIPLES · XBH · RBI ·
                STRIKEOUTS · WALKS · BATTING AVERAGE, FILTERED BY BALLPARK,
                OPPONENT, HOME/ROAD, SEASON, MONTH, LAST N DAYS, AND OPPOSING
                HANDEDNESS.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

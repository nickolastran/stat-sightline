import Link from "next/link";
import TeamLink from "@/components/mlb/TeamLink";
import { FALLBACK_TZ, gameStatus, type Game } from "@/lib/mlb";

/*
 * A club's schedule in three columns — day, opponent, how it went — used for
 * recent form and for the head-to-head lists. No handlers, so it renders on
 * the server and inside the client series panel alike.
 */

/* Dates read in the game's own zone rather than the reader's: a schedule is
   a list of baseball days, and Eastern is the one they are numbered in. */
const gameDay = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(iso));

export default function ResultTable({
  teamId,
  games,
  caption,
}: {
  teamId: number;
  games: Game[];
  caption: string;
}) {
  return (
    <div className="overflow-x-auto border border-line">
      <table className="w-full border-collapse text-xs">
        <caption className="border-b border-line px-2 py-1.5 text-left text-[10px] tracking-[0.25em] text-ink-3">
          {caption}
        </caption>
        <thead>
          <tr>
            {["DATE", "OPP", "RESULT"].map((h, i) => (
              <th
                key={h}
                scope="col"
                className={`border-b border-line px-2 py-1.5 text-[10px] font-normal tracking-widest text-ink-3 ${
                  i === 2 ? "text-right" : "text-left"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {games.length === 0 && (
            <tr>
              <td colSpan={3} className="px-2 py-4 text-center text-ink-3">
                NOTHING PLAYED YET
              </td>
            </tr>
          )}
          {games.map((g) => {
            const at = g.home.id === teamId;
            const us = at ? g.home : g.away;
            const them = at ? g.away : g.home;
            const done = g.state === "Final";
            return (
              <tr
                key={g.pk}
                className="border-b border-grid last:border-b-0 hover:bg-surface-2"
              >
                <td className="px-2 py-1.5 whitespace-nowrap text-ink-3">
                  {gameDay(g.startTime)}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap text-ink-2">
                  {/* The vs/@ sits in a fixed column of its own so the marks
                      below it line up whichever word it is. */}
                  <span className="flex items-center gap-1">
                    <span className="w-4 shrink-0 text-right text-[10px] text-ink-3">
                      {at ? "vs" : "@"}
                    </span>
                    <TeamLink id={them.id} name={them.abbr} />
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">
                  {/* The score is the way through to that game's own page. */}
                  <Link
                    href={`/game/${g.pk}`}
                    className="underline decoration-line decoration-dotted underline-offset-2 hover:decoration-accent"
                  >
                    {done ? (
                      <>
                        <span
                          className={us.isWinner ? "font-bold text-good" : "text-crit"}
                        >
                          {us.isWinner ? "W" : "L"}
                        </span>{" "}
                        <span className="text-ink-2">
                          {us.score}-{them.score}
                        </span>
                      </>
                    ) : (
                      /* Eastern rather than the reader's zone: this table is
                         rendered on the server, and a mismatch at hydration is
                         worse than a zone they have to translate. */
                      <span className="text-ink-3">
                        {gameStatus(g, FALLBACK_TZ).text}
                      </span>
                    )}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

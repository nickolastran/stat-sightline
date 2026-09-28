import Link from "next/link";
import GameCard from "@/components/mlb/GameCard";
import { gameDay } from "@/lib/mlb";
import { seriesLine, type PostSeries } from "@/lib/playoffs";

/*
 * Every postseason series, a row each, first round first: its games in order,
 * each card a way into the game. A slot not yet filled carries MLB's own
 * placeholder ("NYY/BOS") until the series feeding it is decided, and a game
 * MLB marks if-necessary drops off once the series is over.
 */
export default function PostseasonSchedule({ series }: { series: PostSeries[] }) {
  if (series.length === 0)
    return (
      <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
        NO POSTSEASON ON THE SCHEDULE YET
      </p>
    );

  return (
    <div className="space-y-3">
      {series.map((s) => (
        <section key={s.id} className="border border-line">
          <h3 className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line bg-surface-2 px-3 py-1.5 text-[11px] tracking-[0.2em] text-ink">
            <span>
              {s.label}
              <span className="ml-2 text-ink-3">
                {s.away.abbr !== "—" ? s.away.abbr : s.away.name} v{" "}
                {s.home.abbr !== "—" ? s.home.abbr : s.home.name} · BEST OF {s.best}
              </span>
            </span>
            <span className={s.winner ? "font-bold text-accent" : "text-ink-2"}>
              {seriesLine(s)}
            </span>
          </h3>
          <div className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-4 xl:grid-cols-7">
            {s.games.map((g, i) => (
              <Link
                key={g.pk}
                href={`/game/${g.pk}`}
                aria-label={`Game ${i + 1} — ${g.away.name} at ${g.home.name}`}
                className="flex flex-col focus-visible:outline-2 focus-visible:outline-accent"
              >
                <p className="mb-0.5 text-[9px] tracking-[0.15em] text-ink-3">
                  GAME {i + 1} · {gameDay(g.startTime).toUpperCase()}
                </p>
                <GameCard game={g} className="hover:border-accent" />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

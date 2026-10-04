"use client";

import Link from "next/link";
import { useState } from "react";
import Notice from "@/components/ui/Notice";
import Panel from "@/components/ui/Panel";
import { FILTER_CONTROL } from "@/components/ui/FilterSelect";
import { FALLBACK_TZ, gameStatus, teamLogo, type Game } from "@/lib/mlb";

/* ── The season series ─────────────────────────────────────────────── */

/* Eastern rather than the reader's zone: this list is rendered on the server,
   and a mismatch at hydration is worse than a date they have to translate. */
const gameDay = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    timeZone: FALLBACK_TZ,
  }).format(new Date(iso));

/** Every game the two clubs play each other this season, each one a way into
 *  its own box score. */
export default function SeasonSeries({
  game,
  games: all,
}: {
  game: Game;
  games: Game[];
}) {
  /* In October the schedule holds both: postseason games carry a series
     tag, the 162's meetings don't. A playoff game opens on its playoff
     series, with the regular-season meetings a dropdown away. */
  const postseason = all.filter((g) => g.series);
  const playoff = postseason.length > 0;
  const [scope, setScope] = useState<"playoff" | "season">("playoff");
  const games =
    playoff && scope === "playoff" ? postseason : all.filter((g) => !g.series);
  const played = games.filter((g) => g.state === "Final");
  const awayWins = played.filter(
    (g) => (g.home.id === game.away.id ? g.home : g.away).isWinner
  ).length;
  const homeWins = played.length - awayWins;
  const lead =
    played.length === 0
      ? "NOT PLAYED YET"
      : awayWins === homeWins
        ? `SERIES TIED ${awayWins}-${homeWins}`
        : awayWins > homeWins
          ? `${game.away.abbr} LEADS ${awayWins}-${homeWins}`
          : `${game.home.abbr} LEADS ${homeWins}-${awayWins}`;

  return (
    <Panel
      title={playoff && scope === "playoff" ? "Playoff Series" : "Season Series"}
      tight
      right={
        playoff && (
          <select
            aria-label="Series range"
            value={scope}
            onChange={(e) => setScope(e.target.value as "playoff" | "season")}
            className={FILTER_CONTROL}
          >
            <option value="playoff">PLAYOFF SERIES</option>
            <option value="season">SEASON SERIES</option>
          </select>
        )
      }
    >
      {games.length === 0 ? (
        <Notice what="NO SERIES SCHEDULED" />
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] tracking-[0.2em] text-ink-3">{lead}</p>
          <ul className="space-y-px">
            {games.map((g, i) => (
              <li key={g.pk}>
                <Link
                  href={`/game/${g.pk}`}
                  aria-current={g.pk === game.pk ? "page" : undefined}
                  className={`block border bg-bg px-2 py-1.5 hover:border-accent ${
                    g.pk === game.pk ? "border-accent" : "border-line"
                  }`}
                >
                  <p className="flex justify-between gap-2 text-[10px] tracking-wider text-ink-3">
                    <span>
                      GAME {i + 1} · {gameDay(g.startTime)}
                    </span>
                    <span className="truncate">
                      {gameStatus(g, FALLBACK_TZ).text}
                    </span>
                  </p>
                  {/* The marks are taller than the line they sit on, so the
                      two rows get their own breathing room. */}
                  <span className="mt-1 block space-y-1">
                    {[g.away, g.home].map((s) => (
                      <span
                        key={s.id}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span
                          className={`flex min-w-0 items-center gap-1.5 ${
                            s.isWinner ? "font-bold text-ink" : "text-ink-2"
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={teamLogo(s.id)}
                            alt=""
                            width={16}
                            height={16}
                            className="h-4 w-4 shrink-0"
                          />
                          {s.abbr}
                        </span>
                        <span
                          className={`tabular-nums ${s.isWinner ? "font-bold text-ink" : "text-ink-2"}`}
                        >
                          {s.score ?? "—"}
                        </span>
                      </span>
                    ))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

"use client";

import { useState } from "react";
import Panel from "@/components/ui/Panel";
import ResultTable from "@/components/mlb/ResultTable";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { FILTER_CONTROL } from "@/components/ui/FilterSelect";
import type { Game } from "@/lib/mlb";

/*
 * The two clubs against each other, read at two ranges: the three or four
 * games they are in the middle of, and everything they have played this
 * season. Both lists come with the page, so the toggle waits on nothing.
 */

export default function SeriesPanel({
  teamId,
  awayAbbr,
  homeAbbr,
  series,
  matchups,
  label,
}: {
  /** Whose side the W/L column reads from — the away club. */
  teamId: number;
  awayAbbr: string;
  homeAbbr: string;
  /** This series' games. */
  series: Game[];
  /** Every meeting this season. */
  matchups: Game[];
  /** "GAME 2 OF 3", or the result once the series is decided. */
  label: string;
}) {
  const [scope, setScope] = useState<"series" | "season">("series");
  /* In October the schedule holds both: the postseason games carry a
     series tag, the 162's meetings don't. A playoff game reads its playoff
     series first and the regular-season meetings behind a dropdown. */
  const postseason = matchups.filter((g) => g.series);
  const regular = matchups.filter((g) => !g.series);
  const playoff = postseason.length > 0;
  const games = scope === "series" ? (playoff ? postseason : series) : regular;
  const played = regular.filter((g) => g.state === "Final");
  const awayWins = played.filter(
    (g) => (g.home.id === teamId ? g.home : g.away).isWinner,
  ).length;

  return (
    <Panel
      title="Series"
      tight
      right={
        playoff ? (
          <select
            aria-label="Series range"
            value={scope}
            onChange={(e) => setScope(e.target.value as "series" | "season")}
            className={FILTER_CONTROL}
          >
            <option value="series">PLAYOFF SERIES</option>
            <option value="season">SEASON SERIES</option>
          </select>
        ) : (
          <SegmentedControl
            ariaLabel="Series range"
            value={scope}
            onChange={setScope}
            options={[
              { value: "series" as const, label: "THIS SERIES" },
              { value: "season" as const, label: "SEASON SERIES" },
            ]}
          />
        )
      }
    >
      <div className="space-y-2">
        {scope === "series" && label && (
          <p className="text-[10px] tracking-wider text-ink-3">{label}</p>
        )}
        <ResultTable
          teamId={teamId}
          games={games}
          caption={`${awayAbbr} AT ${homeAbbr}`}
        />
        {played.length > 0 && (
          <p className="text-[10px] tracking-wider text-ink-3">
            SEASON SERIES — {awayAbbr} {awayWins}, {homeAbbr}{" "}
            {played.length - awayWins}
          </p>
        )}
      </div>
    </Panel>
  );
}

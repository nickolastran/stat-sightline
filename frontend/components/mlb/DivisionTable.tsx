import Link from "next/link";
import Panel from "@/components/ui/Panel";
import TeamLink from "@/components/mlb/TeamLink";
import { gamesBack, type Division } from "@/lib/mlb";

/*
 * One division's table, with the club being read highlighted in it — the
 * team page's own standings block, and the pair a pre-game page shows for the
 * two clubs about to play.
 */

export default function DivisionTable({
  division,
  teamId,
  full,
}: {
  division: Division;
  /** The club (or, in a division matchup, the two) to pick out of the table. */
  teamId: number | number[];
  /** Foot the table with a way through to every division at once — for the
   *  places that show one table beside something else. */
  full?: boolean;
}) {
  const gb = gamesBack(division.teams);
  const rows = [...division.teams].sort(
    (a, b) => Number(a.divRank) - Number(b.divRank)
  );

  return (
    <Panel
      title={`${division.name} STANDINGS`}
      right={
        <span className="text-[10px] text-ink-3">{division.league}</span>
      }
    >
      <div className="overflow-x-auto border border-line">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              {["TEAM", "W", "L", "PCT", "GB", "STRK"].map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={`border-b border-line bg-surface px-2 py-2 text-[10px] font-normal tracking-widest text-ink-3 ${
                    i === 0 ? "text-left" : "text-right"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const mine = [teamId].flat().includes(r.id);
              return (
                <tr
                  key={r.id}
                  aria-current={mine ? "true" : undefined}
                  className={`border-b border-grid last:border-b-0 ${
                    mine
                      ? "bg-accent/15 font-bold text-ink"
                      : "text-ink-2 hover:bg-surface-2"
                  }`}
                >
                  <td className="px-2 py-1.5">
                    {/* The town alone: two clubs never share one inside a
                        division, and the seven stat columns need the room. */}
                    <TeamLink id={r.id} name={r.name} text={r.city} />
                  </td>
                  {[
                    String(r.wins),
                    String(r.losses),
                    r.pct,
                    gb(r) === 0 ? "-" : gb(r).toFixed(1),
                    r.streak,
                  ].map((v, i) => (
                    <td
                      key={i}
                      className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap"
                    >
                      {v}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {full && (
        <Link
          href="/league/standings"
          className="mt-2 block border border-line px-2 py-1.5 text-center text-[10px] tracking-[0.2em] text-ink-3 hover:border-accent hover:text-ink"
        >
          FULL STANDINGS
        </Link>
      )}
    </Panel>
  );
}

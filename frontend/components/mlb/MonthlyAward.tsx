import Link from "next/link";
import { notFound } from "next/navigation";
import Panel from "@/components/ui/Panel";
import PlayerLink from "@/components/mlb/PlayerLink";
import TeamLink from "@/components/mlb/TeamLink";
import { Table, Row } from "@/components/ui/StatTable";
import {
  MONTH_NAME,
  getMonthlyAward,
  teamStatText,
  type MonthlyRow,
  type MonthlyWinner,
} from "@/lib/mlb";

/*
 * A monthly award, both leagues at once — /award/ALPOM and /award/NLPOM are
 * the same page, since the question is who took each side's April, not who
 * took the American League's.
 *
 * The line beside a name is that month's, not the season's, which is the
 * whole point of the award and the reason this page exists rather than the
 * plain winners table: a September line under a September award. It reads as
 * a sentence rather than as columns, because four months of a table twenty
 * columns wide would be unreadable at the width two leagues leave.
 */

const CELL = "px-2 py-1 text-[12px] align-top border-r border-grid";

/** "24 G · .311/.425/.686 · 16 HR · 38 RBI", or the arm's equivalent. */
function StatLine({ w }: { w: MonthlyWinner }) {
  const t = (
    values: Record<string, unknown> | null,
    keys: string[],
  ): string[] =>
    values ? keys.map((k) => teamStatText(values[k] as never)) : [];
  const hit = t(w.hitting, ["gamesPlayed", "avg", "obp", "slg", "homeRuns", "rbi"]);
  const pit = t(w.pitching, [
    "gamesPlayed",
    "wins",
    "losses",
    "era",
    "strikeOuts",
  ]);

  return (
    <>
      {w.hitting && (
        <span className="block text-[11px] tabular-nums text-ink-3">
          {hit[0]} G · {hit[1]}/{hit[2]}/{hit[3]} · {hit[4]} HR · {hit[5]} RBI
        </span>
      )}
      {w.pitching && (
        <span className="block text-[11px] tabular-nums text-ink-3">
          {pit[0]} G · {pit[1]}-{pit[2]} · {pit[3]} ERA · {pit[4]} SO
        </span>
      )}
    </>
  );
}

function WinnerCell({ w, last }: { w: MonthlyWinner | null; last?: boolean }) {
  return (
    <td className={`${CELL} ${last ? "border-r-0" : ""}`}>
      {w ? (
        <>
          <span className="flex flex-wrap items-center gap-x-2 text-ink">
            <PlayerLink id={w.id}>{w.name}</PlayerLink>
            {w.teamId !== null && (
              <span className="text-[11px] text-ink-2">
                <TeamLink id={w.teamId} name={w.team} logo={false} />
              </span>
            )}
          </span>
          <StatLine w={w} />
        </>
      ) : (
        <span className="text-ink-3">—</span>
      )}
    </td>
  );
}

function DecadeTable({
  decade,
  rows,
  label,
}: {
  decade: number;
  rows: MonthlyRow[];
  label: string;
}) {
  const what = label.replace(/s of the Month$/, " of the Month");

  return (
    <Panel title={`${decade}s`}>
      <Table
        head={["YEAR", "MONTH", `NL ${what.toUpperCase()}`, `AL ${what.toUpperCase()}`]}
        maxHeight="none"
        align="llll"
        widths={["4rem", "7rem", "auto", "auto"]}
      >
        {rows.map((r, i) => (
          <Row key={`${r.season}-${r.month}`}>
            {/* Only the first month of a season carries the year, the way a
                calendar is read — the rest of the column is the same year. */}
            <td className={`${CELL} tabular-nums font-bold text-ink`}>
              {i === 0 || rows[i - 1].season !== r.season ? r.season : ""}
            </td>
            <td className={`${CELL} text-ink-2`}>{MONTH_NAME[r.month]}</td>
            <WinnerCell w={r.nl} />
            <WinnerCell w={r.al} last />
          </Row>
        ))}
      </Table>
    </Panel>
  );
}

export default async function MonthlyAward({ id }: { id: string }) {
  const award = await getMonthlyAward(id).catch(() => null);
  if (!award || award.decades.length === 0) notFound();

  return (
    <div className="mx-auto max-w-[110rem] px-4">
      <section className="space-y-3 border-x border-line px-4 py-8 sm:px-8">
        <h1 className="text-2xl tracking-[0.15em] text-ink">
          MLB {award.label.toUpperCase()}
        </h1>

        <nav className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            href="/award"
            className="border border-line px-3 py-1.5 tracking-widest text-ink-2 hover:border-accent hover:text-ink"
          >
            ← AWARDS INDEX
          </Link>
          {award.decades.map((d) => (
            <a
              key={d.decade}
              href={`#d${d.decade}`}
              className="border border-line px-2 py-1.5 tabular-nums tracking-widest text-ink-2 hover:border-accent hover:text-ink"
            >
              {d.decade}s
            </a>
          ))}
        </nav>

        {award.decades.map((d) => (
          <div key={d.decade} id={`d${d.decade}`} className="scroll-mt-28">
            <DecadeTable decade={d.decade} rows={d.rows} label={award.label} />
          </div>
        ))}

        <p className="border border-line bg-bg px-3 py-2 text-[10px] leading-5 text-ink-3">
          Each line is the month the award was given for, not the season —
          March counted into April and October into September, the way the
          award is. A month MLB publishes no split for leaves the name alone.
        </p>
      </section>
    </div>
  );
}

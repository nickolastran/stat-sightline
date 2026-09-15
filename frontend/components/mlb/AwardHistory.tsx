import Link from "next/link";
import { notFound } from "next/navigation";
import Panel from "@/components/ui/Panel";
import Glossary from "@/components/mlb/Glossary";
import PlayerLink from "@/components/mlb/PlayerLink";
import TeamLink from "@/components/mlb/TeamLink";
import { Table, Row } from "@/components/ui/StatTable";
import {
  awardHistoryCols,
  getAwardHistory,
  teamStatText,
  type AwardSeason,
} from "@/lib/mlb";

/*
 * One award from its first season to its last — /award/ALMVP.
 *
 * A decade is a table. Ninety seasons in one scroll is a table nobody finds
 * their way back into, and the decade is the unit a reader already thinks in
 * ("the sixties MVPs"), so it is the heading rather than an arbitrary page
 * size. Newest first, the way every other index on the site runs.
 *
 * Hitters and arms share the table with a batting half and a pitching half,
 * blank where a man has no line of that kind — the same shape a season's
 * ballot uses, since it is the same question read down the years instead of
 * across one vote.
 */

const CELL = "px-1 py-1 text-[12px] whitespace-nowrap border-r border-grid";
const NUM = `${CELL} pl-0.5 pr-2 text-right tabular-nums`;

const BANDS = [
  { label: "BATTING", group: "hitting" as const, cols: awardHistoryCols("hitting") },
  { label: "PITCHING", group: "pitching" as const, cols: awardHistoryCols("pitching") },
];

/** The seasons of a decade, for an award given to a whole roster — the names
    live on each year's own page, where they are a table rather than a column
    three hundred deep. */
function DecadeYears({
  id,
  decade,
  seasons,
}: {
  id: string;
  decade: number;
  seasons: AwardSeason[];
}) {
  return (
    <Panel title={`${decade}s`}>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 border border-line px-3 py-2.5">
        {seasons.map((s) => (
          <Link
            key={s.season}
            href={`/award/${id}/${s.season}`}
            className="text-[13px] tabular-nums text-accent hover:underline"
          >
            {s.season}
          </Link>
        ))}
      </div>
    </Panel>
  );
}

/** One decade's winners, a line apiece. */
function DecadeTable({
  id,
  decade,
  seasons,
}: {
  id: string;
  decade: number;
  seasons: AwardSeason[];
}) {
  const lead = ["YEAR", "NAME", "POS", "TM", "LG"];
  const cols = BANDS;
  const head = [
    ...lead,
    ...cols.flatMap((b) => b.cols.map((c) => c.label)),
    "VOTING",
  ];
  const groups = [
    { label: "", span: lead.length },
    ...cols.map((b) => ({ label: b.label, span: b.cols.length })),
    { label: "", span: 1 },
  ];

  return (
    <Panel title={`${decade}s`}>
      <Table
        head={head}
        groups={groups}
        maxHeight="none"
        align={`llll${"l".repeat(1)}${"r".repeat(head.length - lead.length - 1)}c`}
        dense
      >
        {seasons.flatMap((s) =>
          s.winners.map((w, i) => (
            <Row key={`${s.season}-${w.id}-${i}`}>
              <td className={`${CELL} tabular-nums`}>
                {/* Only the first winner of a season carries the year — a
                    league pair reads as one line of the table, not two. */}
                {i === 0 ? (
                  <Link
                    href={`/award/${id}/${s.season}`}
                    className="font-bold text-accent hover:underline"
                  >
                    {s.season}
                  </Link>
                ) : (
                  <span className="text-ink-3">›</span>
                )}
              </td>
              <td className={`${CELL} text-ink`}>
                <PlayerLink id={w.id}>{w.name}</PlayerLink>
              </td>
              <td className={`${CELL} text-ink-3`}>{w.pos || "—"}</td>
              <td className={`${CELL} text-ink-2`}>
                {w.teamId === null ? (
                  <span className="text-ink-3">{w.team}</span>
                ) : (
                  <TeamLink id={w.teamId} name={w.team} logo={false} />
                )}
              </td>
              <td className={`${CELL} text-ink-3`}>{w.league || "—"}</td>
              {cols.flatMap((b) =>
                b.cols.map((c) => {
                  const values = w[b.group];
                  return (
                    <td
                      key={`${b.group}:${c.key}`}
                      title={c.title}
                      className={`${NUM} text-ink-3`}
                    >
                      {values ? teamStatText(values[c.key] ?? null) : ""}
                    </td>
                  );
                }),
              )}
              <td className={`${CELL} border-r-0 text-center`}>
                {i === 0 && s.ballot ? (
                  <Link
                    href={`/award/${s.season}#${id}`}
                    className="text-[11px] text-accent hover:underline"
                  >
                    Voting
                  </Link>
                ) : (
                  ""
                )}
              </td>
            </Row>
          )),
        )}
      </Table>
    </Panel>
  );
}

export default async function AwardHistory({ id }: { id: string }) {
  const history = await getAwardHistory(id).catch(() => null);
  if (!history || history.decades.length === 0) notFound();

  const seasons = history.decades.flatMap((d) => d.seasons.map((s) => s.season));
  const seen = new Set<string>();
  const legend = BANDS.flatMap((b) => b.cols).filter(
    (c) => !seen.has(c.label) && seen.add(c.label),
  );

  return (
    <div className="mx-auto max-w-[110rem] px-4">
      <section className="space-y-3 border-x border-line px-4 py-8 sm:px-8">
        <div>
          <p className="text-xs tracking-[0.3em] text-ink-3">AWARD</p>
          <h1 className="mt-2 text-2xl tracking-[0.15em] text-ink">
            {history.label.toUpperCase()} WINNERS
          </h1>
          <p className="mt-2 text-[10px] tracking-widest text-ink-3">
            {history.count} WINNERS · {seasons[seasons.length - 1]}–{seasons[0]}
          </p>
        </div>

        <nav className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            href="/award"
            className="border border-line px-3 py-1.5 tracking-widest text-ink-2 hover:border-accent hover:text-ink"
          >
            ← AWARDS INDEX
          </Link>
          {history.decades.map((d) => (
            <a
              key={d.decade}
              href={`#d${d.decade}`}
              className="border border-line px-2 py-1.5 tabular-nums tracking-widest text-ink-2 hover:border-accent hover:text-ink"
            >
              {d.decade}s
            </a>
          ))}
        </nav>

        {history.decades.map((d) => (
          <div key={d.decade} id={`d${d.decade}`} className="scroll-mt-28">
            {history.lines ? (
              <DecadeTable id={id} decade={d.decade} seasons={d.seasons} />
            ) : (
              <DecadeYears id={id} decade={d.decade} seasons={d.seasons} />
            )}
          </div>
        ))}

        <p className="border border-line bg-bg px-3 py-2 text-[10px] leading-5 text-ink-3">
          {history.lines
            ? "Each line is the season the award was won on, his own club's half of it where he was traded mid-year."
            : "This award is given to a whole roster every year, so a decade is its seasons — each one links to that year's winners in full."}{" "}
          A year links to that season&apos;s winners; VOTING, where the
          BBWAA&apos;s ballot is on record, to the whole vote.
        </p>

        {history.lines && (
          <div className="mt-3">
            <Glossary
              entries={legend.map((c) => ({ label: c.label, title: c.title }))}
            />
          </div>
        )}
      </section>
    </div>
  );
}

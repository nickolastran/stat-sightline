import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Panel from "@/components/ui/Panel";
import Glossary from "@/components/mlb/Glossary";
import PlayerLink from "@/components/mlb/PlayerLink";
import TeamLink from "@/components/mlb/TeamLink";
import AwardHistory from "@/components/mlb/AwardHistory";
import { Table, Row } from "@/components/ui/StatTable";
import {
  BALLOT_CY_COLS,
  BALLOT_HITTING_COLS,
  BALLOT_MANAGER_COLS,
  BALLOT_PITCHING_COLS,
  awardLabel,
  ballotIndex,
  getSeasonBallots,
  hasAwardPage,
  teamStatText,
  voteShare,
  type Ballot,
  type BallotRow,
  type TeamStatCol,
  type TeamStatValue,
} from "@/lib/mlb";

/*
 * One season's voting, all of it on one page: both MVPs, both Cy Youngs, both
 * Rookies and both Managers, in the order the awards are announced.
 *
 * A ballot is read across, not down — who finished where, and on what. So the
 * hitters and the pitchers of an MVP vote sit in one table with a batting half
 * and a pitching half, blank where a man has no line of that kind, rather than
 * split into two tables that each hide half the ballot. The Cy Young is arms
 * only and takes the whole pitching line; a manager has no line at all and
 * takes his club's record instead.
 *
 * The URL is the season — /award/2024. The same segment also takes an award
 * id — /award/ALMVP — which is that award from its first season to its last,
 * a decade at a time; and with a season under it (/award/ALGG/2024) it is one
 * award in one year, which is all MLB publishes for the awards nobody votes
 * on.
 */

const isSeason = (id: string) => /^\d{4}$/.test(id);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!isSeason(id)) {
    const label = awardLabel(id);
    return {
      title: `${label.toUpperCase()} WINNERS — STAT//SIGHTLINE`,
      description: `Every ${label} winner, decade by decade, with the season line each won it on.`,
    };
  }
  return {
    title: `${id} AWARDS VOTING — STAT//SIGHTLINE`,
    description: `Every BBWAA ballot of the ${id} season — MVP, Cy Young, Rookie of the Year and Manager of the Year, both leagues, with the line each man polled on.`,
  };
}

/** The columns one kind of ballot prints, in the bands they read as. */
function bands(kind: Ballot["kind"]): {
  label: string;
  group: "hitting" | "pitching" | "manager";
  cols: TeamStatCol[];
}[] {
  if (kind === "manager")
    return [{ label: "CLUB", group: "manager", cols: BALLOT_MANAGER_COLS }];
  if (kind === "pitcher")
    return [
      { label: "PITCHING", group: "pitching", cols: BALLOT_CY_COLS },
    ];
  return [
    { label: "BATTING", group: "hitting", cols: BALLOT_HITTING_COLS },
    { label: "PITCHING", group: "pitching", cols: BALLOT_PITCHING_COLS },
  ];
}

function BallotTable({ ballot }: { ballot: Ballot }) {
  const cols = bands(ballot.kind);
  const lead = ["RK", "NAME", "TM"];
  const votes = ["PTS", "1ST", "SHARE"];
  const head = [
    ...lead,
    ...votes,
    ...cols.flatMap((b) => b.cols.map((c) => c.label)),
  ];
  const groups = [
    { label: "", span: lead.length },
    { label: "VOTING", span: votes.length },
    ...cols.map((b) => ({ label: b.label, span: b.cols.length })),
  ];
  const id = "px-1 py-1 text-[12px] whitespace-nowrap border-r border-grid";
  const num = `${id} pl-0.5 pr-2 text-right tabular-nums`;

  /* A manager's figures live on his vote; a player's on the line he polled on. */
  const valuesOf = (
    r: BallotRow,
    group: string,
  ): Record<string, TeamStatValue> | null =>
    group === "manager"
      ? (r.vote as unknown as Record<string, TeamStatValue>)
      : group === "hitting"
        ? r.hitting
        : r.pitching;

  return (
    <Panel title={`${ballot.label.toUpperCase()} VOTING`}>
      <Table
        head={head}
        groups={groups}
        maxHeight="none"
        align={`cll${"r".repeat(head.length - lead.length)}`}
        dense
      >
        {ballot.rows.map((r) => (
          <Row key={`${r.vote.name}-${r.vote.rank}`}>
            <td className={`${id} text-center font-bold text-ink`}>
              {r.vote.rank}
            </td>
            <td className={`${id} text-ink`}>
              {r.vote.id === null ? (
                r.vote.name
              ) : (
                <PlayerLink id={r.vote.id}>{r.vote.name}</PlayerLink>
              )}
            </td>
            <td className={`${id} text-ink-2`}>
              {r.teamId === null ? (
                <span className="text-ink-3">{r.team}</span>
              ) : (
                <TeamLink id={r.teamId} name={r.team} logo={false} />
              )}
            </td>
            <td className={`${num} text-ink`}>{r.vote.points}</td>
            <td className={`${num} text-ink-2`}>{r.vote.first || "—"}</td>
            <td className={`${num} text-ink-2`}>{voteShare(r.vote)}</td>
            {cols.flatMap((b) =>
              b.cols.map((c) => {
                const values = valuesOf(r, b.group);
                const mark = r.led[`${b.group}:${c.key}`];
                return (
                  <td
                    key={`${b.group}:${c.key}`}
                    title={c.title}
                    className={`${num} ${
                      mark
                        ? `font-bold text-ink${mark === "mlb" ? " italic" : ""}`
                        : "text-ink-3"
                    }`}
                  >
                    {values ? teamStatText(values[c.key] ?? null) : ""}
                  </td>
                );
              }),
            )}
          </Row>
        ))}
      </Table>
    </Panel>
  );
}

export default async function AwardSeasonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isSeason(id)) {
    if (!hasAwardPage(id)) notFound();
    return <AwardHistory id={id} />;
  }
  const season = Number(id);

  const ballots = await getSeasonBallots(season).catch(() => []);
  if (ballots.length === 0) notFound();

  const years = ballotIndex().map((y) => y.season);
  const at = years.indexOf(season);
  const newer = at > 0 ? years[at - 1] : null;
  const older = at >= 0 && at < years.length - 1 ? years[at + 1] : null;

  /* One key at the foot for the whole page — the ballots share most of their
     abbreviations, and eight glossaries is seven too many. */
  const seen = new Set<string>();
  const legend = ballots
    .flatMap((b) => bands(b.kind).flatMap((x) => x.cols))
    .filter((c) => !seen.has(c.label) && seen.add(c.label));

  return (
    <div className="mx-auto max-w-[110rem] px-4">
      <section className="space-y-3 border-x border-line px-4 py-8 sm:px-8">
        <div>
          <p className="text-xs tracking-[0.3em] text-ink-3">AWARDS</p>
          <h1 className="mt-2 text-2xl tracking-[0.15em] text-ink">
            {season} AWARDS VOTING
          </h1>
          <p className="mt-2 text-[10px] tracking-widest text-ink-3">
            {ballots.length} BALLOTS · BBWAA
          </p>
        </div>

        <nav className="flex flex-wrap items-center gap-2 text-xs">
          {older && (
            <Link
              href={`/award/${older}`}
              className="border border-line px-3 py-1.5 tracking-widest text-ink-2 hover:border-accent hover:text-ink"
            >
              « {older}
            </Link>
          )}
          {newer && (
            <Link
              href={`/award/${newer}`}
              className="border border-line px-3 py-1.5 tracking-widest text-ink-2 hover:border-accent hover:text-ink"
            >
              {newer} »
            </Link>
          )}
          <Link
            href="/award"
            className="border border-line px-3 py-1.5 tracking-widest text-ink-2 hover:border-accent hover:text-ink"
          >
            ALL YEARS
          </Link>
        </nav>

        {ballots.map((b) => (
          <div key={b.award} id={b.award} className="scroll-mt-28">
            <BallotTable ballot={b} />
          </div>
        ))}

        <p className="border border-line bg-bg px-3 py-2 text-[10px] leading-5 text-ink-3">
          <span className="font-bold text-ink">BOLD</span> figures led the
          league. <span className="font-bold italic text-ink">BOLD ITALIC</span>{" "}
          led all major leagues. Voting results are the BBWAA&apos;s own,
          published each November; the season lines beside them are MLB&apos;s.
        </p>

        <div className="mt-3">
          <Glossary
            entries={legend.map((c) => ({ label: c.label, title: c.title }))}
          />
        </div>
      </section>
    </div>
  );
}

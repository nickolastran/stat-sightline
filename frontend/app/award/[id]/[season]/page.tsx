import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Panel from "@/components/ui/Panel";
import Glossary from "@/components/mlb/Glossary";
import PlayerLink from "@/components/mlb/PlayerLink";
import TeamLink from "@/components/mlb/TeamLink";
import { Table, Row, Empty } from "@/components/ui/StatTable";
import {
  awardLabel,
  careerCols,
  getAwardTable,
  isMajorAward,
  teamStatText,
  STAT_GROUP_LABEL,
  type AwardWinner,
  type StatGroup,
  type TeamStatCol,
} from "@/lib/mlb";

/*
 * One award, one season: everyone who took it and the line they took it on.
 *
 * MLB publishes winners and nothing else — there is no ballot in the feed, so
 * this page cannot say who finished second or by how many points. It says
 * what it can say: every winner, with the season he won it on marked where it
 * led something, off the same leader boards the career table's marks use.
 *
 * Hitters and pitchers are separate tables. A Gold Glove page carries both,
 * and one table with a batting header over a pitcher's line would be worse
 * than two tables that each say what they are.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; season: string }>;
}): Promise<Metadata> {
  const { id, season } = await params;
  const label = `${season} ${awardLabel(id)}`;
  return {
    title: `${label} — STAT//SIGHTLINE`,
    description: `Every winner of the ${label}, with the season line each won it on.`,
  };
}

function WinnerTable({
  group,
  winners,
}: {
  group: StatGroup;
  winners: AwardWinner[];
}) {
  const columns: TeamStatCol[] = careerCols(group);
  const head = ["PLAYER", "POS", "TEAM", "LG", ...columns.map((c) => c.label)];
  const id = "px-1 py-1 text-[12px] whitespace-nowrap border-r border-grid";

  return (
    <Panel title={STAT_GROUP_LABEL[group]}>
      <Table head={head} maxHeight="none" align={"llll"} dense>
        {winners.map((w) => (
          <Row key={w.id}>
            <td className={`${id} text-ink`}>
              <PlayerLink id={w.id}>{w.name}</PlayerLink>
            </td>
            <td className={`${id} text-ink-3`}>{w.pos || "—"}</td>
            <td className={`${id} text-ink-2`}>
              {w.teamId === null ? (
                <span className="text-ink-3">{w.team}</span>
              ) : (
                <TeamLink id={w.teamId} name={w.team} logo={false} />
              )}
            </td>
            <td className={`${id} text-ink-3`}>{w.league || "—"}</td>
            {columns.map((c) => {
              const mark = w.led[c.key];
              return (
                <td
                  key={c.key}
                  title={c.title}
                  className={`px-0.5 py-1 text-right text-[12px] tabular-nums border-r border-grid last:border-r-0 ${
                    mark
                      ? `font-bold text-ink${mark === "mlb" ? " italic" : ""}`
                      : "text-ink-3"
                  }`}
                >
                  {teamStatText(w.values[c.key])}
                </td>
              );
            })}
          </Row>
        ))}
      </Table>
    </Panel>
  );
}

export default async function AwardPage({
  params,
}: {
  params: Promise<{ id: string; season: string }>;
}) {
  const { id, season } = await params;
  const year = Number(season);
  if (!isMajorAward(id) || !Number.isInteger(year)) notFound();

  const table = await getAwardTable(id, year).catch(() => null);
  if (!table) notFound();

  /* One table per group actually represented, batting first — the order a
     career page stacks them in. */
  const groups: StatGroup[] = (["hitting", "pitching"] as const).filter((g) =>
    table.winners.some((w) => w.group === g),
  );
  /* One key for both tables. Batting and pitching share abbreviations, and a
     Set of column objects would dedupe none of them. */
  const seen = new Set<string>();
  const legend = groups
    .flatMap((g) => careerCols(g))
    .filter((c) => !seen.has(c.label) && seen.add(c.label));

  return (
    <div className="mx-auto max-w-[110rem] px-4">
      <section className="space-y-3 border-x border-line px-4 py-8 sm:px-8">
        <div>
          <p className="text-xs tracking-[0.3em] text-ink-3">AWARD</p>
          <h1 className="mt-2 text-2xl tracking-[0.15em] text-ink">
            {table.season} {table.label.toUpperCase()}
          </h1>
          <p className="mt-2 text-[10px] tracking-widest text-ink-3">
            {table.winners.length} WINNER
            {table.winners.length === 1 ? "" : "S"}
            {table.date && ` · AWARDED ${table.date}`}
          </p>
        </div>

        {table.winners.length === 0 ? (
          <Panel title="WINNERS">
            <Table head={[]} maxHeight="none">
              <Empty
                what={`NO ${table.label.toUpperCase()} ON RECORD FOR ${table.season}`}
                cols={1}
              />
            </Table>
          </Panel>
        ) : (
          groups.map((g) => (
            <WinnerTable
              key={g}
              group={g}
              winners={table.winners.filter((w) => w.group === g)}
            />
          ))
        )}

        <p className="border border-line bg-bg px-3 py-2 text-[10px] leading-5 text-ink-3">
          <span className="font-bold text-ink">BOLD</span> figures led the
          league. <span className="font-bold italic text-ink">BOLD ITALIC</span>{" "}
          led all major leagues. MLB publishes the winner of a vote and not the
          ballot, so the players who received votes without winning are not on
          record here.
        </p>

        <div className="mt-3">
          <Glossary
            entries={legend.map((c) => ({ label: c.label, title: c.title }))}
          />
        </div>

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

import { Fragment } from "react";
import Link from "next/link";
import Panel from "@/components/ui/Panel";
import MetricCard from "@/components/ui/MetricCard";
import GameCard from "@/components/mlb/GameCard";
import TeamLink from "@/components/mlb/TeamLink";
import Glossary from "@/components/mlb/Glossary";
import { Table, Row, Empty } from "@/components/ui/StatTable";
import {
  careerCols,
  isSplitPart,
  playerCols,
  signingText,
  teamLogo,
  teamStatText,
  FALLBACK_TZ,
  STAT_GROUP_LABEL,
  type CareerRow,
  type CareerTable,
  type Game,
  type GameLogGroup,
  type PlayerBio,
  type SplitSection,
  type StatGroup,
  type LedScope,
  type StatLine,
  type TeamStatCol,
  type TeamStatValue,
} from "@/lib/mlb";

/*
 * The player page's sections — career table, biography, game log, and the
 * overview that opens on a little of each. All of them are one payload
 * rendered as a table, so they share this file and the scrolling frame the
 * club's tabs use rather than inventing a second one.
 */

/* ── Shared bits ────────────────────────────────────────────────────── */

/** A club as it reads inside a stat table: its mark, then its three letters. */
function Club({ id, abbr }: { id: number | null; abbr: string }) {
  if (id === null) return <span className="text-ink-3">{abbr}</span>;
  return <TeamLink id={id} name={abbr} className="text-ink-2" />;
}

/** The stat cells of one line, in column order. */
const cells = (
  columns: TeamStatCol[],
  values: Record<string, TeamStatValue>,
  strong = false
) =>
  columns.map((c) => (
    <td
      key={c.key}
      title={c.title}
      className={`px-3 py-1.5 text-right tabular-nums ${
        strong ? "text-ink" : "text-ink-3"
      }`}
    >
      {teamStatText(values[c.key])}
    </td>
  ));

/* Every column of the career line is ruled off from the next: twenty-odd
   figures across a row are read down as often as along, and without a rule
   the eye loses the column. */
const RULE = "border-r border-grid last:border-r-0";

/**
 * The stat cells of a career line. Bold where the figure led its league,
 * bold italic where it led the majors — the marks a printed career line
 * carries, and the reason a reader scans one at all.
 */
const careerCells = (
  columns: TeamStatCol[],
  values: Record<string, TeamStatValue>,
  led: Record<string, LedScope> = {},
  strong = false
) =>
  columns.map((c) => {
    const mark = led[c.key];
    return (
      <td
        key={c.key}
        title={c.title}
        className={`px-0.5 py-1 text-right text-[12px] tabular-nums ${RULE} ${
          mark
            ? `font-bold text-ink${mark === "mlb" ? " italic" : ""}`
            : strong
              ? "text-ink"
              : "text-ink-3"
        }`}
      >
        {teamStatText(values[c.key])}
      </td>
    );
  });

const glossaryOf = (columns: TeamStatCol[]) => (
  <div className="mt-3">
    <Glossary entries={columns.map((c) => ({ label: c.label, title: c.title }))} />
  </div>
);

/* ── Career, season by season ───────────────────────────────────────── */

function CareerTableBody({
  table,
  columns,
  positions,
}: {
  table: CareerTable;
  columns: TeamStatCol[];
  /** The batting table names where each season was played; the others don't. */
  positions: boolean;
}) {
  const head = [
    "SEASON",
    "AGE",
    "TEAM",
    "LG",
    ...columns.map((c) => c.label),
    ...(positions ? ["POS"] : []),
  ];
  /* The label of a summary line runs across the four identity columns. */
  const LEAD = 4;
  const id = `px-1 py-1 text-[12px] whitespace-nowrap ${RULE}`;

  return (
    <Table head={head} maxHeight="none" align={"llll"} dense>
      {table.rows.length === 0 && table.summaries.length === 0 && (
        <Empty what="NO SEASONS ON RECORD" cols={head.length} />
      )}
      {table.rows.map((r: CareerRow, i) => {
        /* A season a trade split reads as one line with its halves under it:
           the whole season is the figure, the clubs are the detail. */
        const part = isSplitPart(table.rows, r);
        return (
          <Row key={`${r.season}-${r.teamId ?? r.teams}-${i}`}>
            <td
              className={`${id} tabular-nums ${
                part ? "pl-4 text-ink-3" : "text-ink-2"
              }`}
            >
              {r.season}
            </td>
            <td className={`${id} tabular-nums text-ink-3`}>{r.age ?? "—"}</td>
            <td className={`${id} text-ink-2`}>
              {r.teamId === null ? (
                <span className="text-ink-3">{r.team}</span>
              ) : (
                /* No mark beside the three letters: a logo per row, eleven
                   rows deep, costs the column the width the line needs. */
                <TeamLink id={r.teamId} name={r.team} logo={false} />
              )}
            </td>
            <td className={`${id} text-ink-3`}>{r.league || "—"}</td>
            {careerCells(columns, r.values, r.led, !part)}
            {positions && <td className={`${id} text-ink-3`}>{r.pos || "—"}</td>}
          </Row>
        );
      })}
      {table.summaries.map((sum, i) => (
        <tr
          key={`${sum.band}-${sum.label}`}
          className={`bg-surface text-ink ${
            /* A rule opens each block — the career, then the clubs, then the
               leagues — so three kinds of total don't read as one list. */
            i === 0 || sum.band !== table.summaries[i - 1].band
              ? "border-t border-line"
              : ""
          }`}
        >
          <td
            className={`${id} font-bold tracking-wider`}
            colSpan={LEAD}
          >
            {sum.label}
            {sum.span && (
              <span className="ml-1.5 font-normal text-ink-3">({sum.span})</span>
            )}
          </td>
          {careerCells(columns, sum.values, {}, true)}
          {positions && <td className={id} />}
        </tr>
      ))}
    </Table>
  );
}

/** One group's career line, plus October's if the player has one. */
export interface CareerSection {
  group: StatGroup;
  regular: CareerTable;
  postseason: CareerTable;
}

/**
 * The stats tab: every line the player has, stacked — batting, then pitching
 * for anyone who threw, then fielding, which is a section of the page rather
 * than a choice hidden behind a control. A career is read as a whole, and a
 * fielding line is read against the bat above it, not instead of it.
 *
 * Each section carries its seasons, the career and its per-162-game rate, and
 * a line per club and per league once there has been more than one of either.
 * October is kept as its own table — a post-season line is not a slice of a
 * regular one, and adding them would misstate both.
 */
export function CareerPanel({ sections }: { sections: CareerSection[] }) {
  /* One key at the foot rather than one per section: the groups share most of
     their abbreviations, and three glossaries is two too many. */
  const seen = new Set<string>();
  const legend = sections
    .flatMap((sec) => careerCols(sec.group))
    .filter((c) => !seen.has(c.label) && seen.add(c.label));

  return (
    <div className="space-y-3">
      {sections.map(({ group, regular, postseason }) => {
        const columns = careerCols(group);
        const positions = group === "hitting";
        return (
          <Fragment key={group}>
            <Panel title={`CAREER ${STAT_GROUP_LABEL[group]}`}>
              <CareerTableBody
                table={regular}
                columns={columns}
                positions={positions}
              />
            </Panel>
            {postseason.rows.length > 0 && (
              <Panel title={`POSTSEASON ${STAT_GROUP_LABEL[group]}`}>
                <CareerTableBody
                  table={postseason}
                  columns={columns}
                  positions={positions}
                />
              </Panel>
            )}
          </Fragment>
        );
      })}
      <p className="border border-line bg-bg px-3 py-2 text-[10px] text-ink-3">
        <span className="font-bold text-ink">BOLD</span> season figures led the
        league.{" "}
        <span className="font-bold italic text-ink">BOLD ITALIC</span> led all
        major leagues.
      </p>
      {glossaryOf(legend)}
    </div>
  );
}

/* ── Biography ──────────────────────────────────────────────────────── */

const dateText = (iso: string) =>
  iso
    ? new Intl.DateTimeFormat("en-US", {
        month: "numeric",
        day: "numeric",
        year: "numeric",
        timeZone: FALLBACK_TZ,
      }).format(new Date(`${iso}T12:00:00Z`))
    : "—";

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border border-line bg-bg px-3 py-2">
      <dt className="text-[10px] tracking-[0.2em] text-ink-3">{label}</dt>
      <dd className="mt-1 text-xs text-ink">{value}</dd>
    </div>
  );
}

export function BioPanel({
  bio,
  team,
  teamId,
  bats,
  throws,
  height,
  weight,
  age,
}: {
  bio: PlayerBio;
  team: string;
  teamId: number | null;
  bats: string;
  throws: string;
  height: string;
  weight: number | null;
  age: number | null;
}) {
  return (
    <div className="space-y-3">
      <Panel title="BIOGRAPHY">
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Fact
            label="TEAM"
            value={
              teamId ? <TeamLink id={teamId} name={team} /> : team || "—"
            }
          />
          <Fact label="POSITION" value={bio.position || "—"} />
          <Fact
            label="HT / WT"
            value={height && weight ? `${height}, ${weight} LB` : "—"}
          />
          <Fact
            label="BIRTHDATE"
            value={`${dateText(bio.birthDate)}${age !== null ? ` (${age})` : ""}`}
          />
          <Fact label="BAT / THR" value={`${bats} / ${throws}`} />
          <Fact label="BIRTHPLACE" value={bio.birthPlace || "—"} />
          <Fact
            label="STATUS"
            value={
              <span className={bio.active ? "text-accent" : "text-ink-3"}>
                {bio.active ? "ACTIVE" : "INACTIVE"}
              </span>
            }
          />
          <Fact label="MLB DEBUT" value={dateText(bio.debut)} />
          {/* A player MLB reports no draft year for was either signed as an
              international amateur or never drafted at all — which of the two
              is what the birthplace settles. The shirt number is on the
              identity bar two inches above, so the box is the signing alone. */}
          <Fact label="SIGNED" value={signingText(bio)} />
        </dl>
      </Panel>

      <Panel title="CAREER HISTORY">
        {bio.stops.length === 0 ? (
          <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
            NO MAJOR-LEAGUE SEASONS ON RECORD
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {bio.stops.map((s) => (
              <li
                key={s.teamId}
                className="flex items-center gap-2 border border-line bg-bg px-3 py-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={teamLogo(s.teamId)}
                  alt=""
                  width={24}
                  height={24}
                  className="h-6 w-6 shrink-0"
                />
                <div className="min-w-0">
                  <p className="truncate text-xs text-ink">
                    <TeamLink id={s.teamId} name={s.team} logo={false} />
                  </p>
                  <p className="mt-0.5 text-[10px] tracking-[0.15em] text-ink-3">
                    {s.from === s.to ? s.from : `${s.from}–${s.to}`} ·{" "}
                    {s.seasons} SEASON{s.seasons === 1 ? "" : "S"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="CAREER HIGHLIGHTS">
        {bio.awards.length === 0 ? (
          <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
            NO MAJOR-LEAGUE AWARDS ON RECORD
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {bio.awards.map((a) => (
              <li key={a.name} className="border border-line bg-bg px-3 py-2">
                <p className="text-xs text-ink">
                  {a.seasons.length > 1 && (
                    <span className="mr-1 font-bold text-accent">
                      {a.seasons.length}×
                    </span>
                  )}
                  {a.name}
                </p>
                <p className="mt-1 text-[10px] tabular-nums tracking-[0.15em] text-ink-3">
                  {a.seasons.join(", ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/* ── Game log ───────────────────────────────────────────────────────── */

const dayText = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "numeric",
    day: "numeric",
    timeZone: FALLBACK_TZ,
  })
    .format(new Date(`${iso}T12:00:00Z`))
    .toUpperCase();

/** "W 5-4" in the colour of the result, so a log skims — and, like the date
 *  beside it, a way into the game it is the summary of. */
function Result({
  text,
  win,
  gamePk,
}: {
  text: string;
  win: boolean | null;
  gamePk: number;
}) {
  if (!text) return <span className="text-ink-3">—</span>;
  return (
    <Link
      href={`/game/${gamePk}`}
      className={`hover:underline ${
        win === null ? "text-ink-2" : win ? "text-good" : "text-crit"
      }`}
    >
      {text}
    </Link>
  );
}

/**
 * Every game of a season, newest first, each month closed by its own total.
 * The running columns are the season line through that game — what the log is
 * read down for — so they sit apart from the game's own figures.
 */
export function GameLogPanel({
  bands,
  title,
  empty,
  columns,
  running,
  controls,
}: {
  /** Months of one season, or the years of a career's Octobers. */
  bands: GameLogGroup[];
  title: string;
  empty: string;
  /** The game's own counting line. */
  columns: TeamStatCol[];
  /** The line to date printed after it — see lib/mlb's gameLogCols. */
  running: TeamStatCol[];
  controls?: React.ReactNode;
}) {
  const head = [
    "DATE",
    "OPP",
    "RESULT",
    ...columns.map((c) => c.label),
    ...running.map((c) => c.label),
  ];

  return (
    <div className="space-y-3">
      <Panel title={title} right={controls}>
        <Table head={head} maxHeight="none" align={"llc"}>
          {bands.length === 0 && <Empty what={empty} cols={head.length} />}
          {bands.map((m, i) => (
            <Fragment key={m.label}>
              {/* A band of the page's own ground between one block and the
                  next: a month closed by a total and opened by nothing reads
                  as one long list at a glance. */}
              {i > 0 && (
                <tr aria-hidden className="bg-bg">
                  <td colSpan={head.length} className="h-3 border-y border-line" />
                </tr>
              )}
              <tr className="bg-surface text-ink">
                <td
                  className="px-3 py-1.5 text-[10px] tracking-widest whitespace-nowrap"
                  colSpan={head.length}
                >
                  {m.label}
                </td>
              </tr>
              {m.rows.map((r) => (
                <Row key={r.gamePk}>
                  <td className="px-3 py-1.5 whitespace-nowrap text-ink-2">
                    <Link href={`/game/${r.gamePk}`} className="hover:text-accent">
                      {dayText(r.date)}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <span className="w-4 shrink-0 text-right text-[10px] text-ink-3">
                        {r.home ? "vs" : "@"}
                      </span>
                      {r.opp ? (
                        <Club id={r.opp.id} abbr={r.opp.abbr} />
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-center whitespace-nowrap">
                    <Result text={r.result} win={r.win} gamePk={r.gamePk} />
                  </td>
                  {cells(columns, r.values)}
                  {cells(running, r.running, true)}
                </Row>
              ))}
              <tr className="border-t border-line bg-surface text-ink">
                <td
                  className="px-3 py-1.5 text-[10px] tracking-widest whitespace-nowrap"
                  colSpan={3}
                >
                  {m.label} TOTAL
                </td>
                {cells(columns, m.total, true)}
                {/* The band's own rates, not the running line — a total row is
                    a slice, and the line to date is on every game above. */}
                {cells(running, m.total, true)}
              </tr>
            </Fragment>
          ))}
        </Table>
      </Panel>
      {glossaryOf([...columns, ...running])}
    </div>
  );
}

/* ── Overview ───────────────────────────────────────────────────────── */

/** The four headline figures of a season, off the summary the page already has. */
export function HeadlineTiles({ line }: { line: StatLine }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {line.stats.slice(0, 4).map(([label, value]) => (
        <MetricCard key={label} label={label} value={value} />
      ))}
    </div>
  );
}

function SeeAll({ href }: { href: string }) {
  return (
    <Link href={href} className="text-[10px] tracking-[0.2em] text-ink-3 hover:text-accent">
      SEE ALL →
    </Link>
  );
}

/** The club's next game, or its last one once the season has run out of them. */
export function NextGamePanel({ game }: { game: Game | null }) {
  if (!game) return null;
  return (
    <Panel title={game.state === "Final" ? "LAST GAME" : "NEXT GAME"}>
      <Link href={`/game/${game.pk}`} className="block hover:opacity-90">
        <GameCard game={game} detailed />
      </Link>
    </Panel>
  );
}

/** A handful of the season's splits, with the rest a click away. */
export function SplitsSummaryPanel({
  sections,
  columns,
  href,
  season,
}: {
  sections: SplitSection[];
  columns: TeamStatCol[];
  href: string;
  season: number;
}) {
  /* The lines anyone checks first: recent form, home and away, both hands.
     Whatever the season doesn't have simply isn't listed. */
  const wanted = ["d7", "h", "a", "vl", "vr"];
  const lines = sections
    .flatMap((s) => s.lines)
    .filter((l) => wanted.includes(l.code))
    .sort((a, b) => wanted.indexOf(a.code) - wanted.indexOf(b.code));

  return (
    <Panel title={`SPLITS — ${season}`} right={<SeeAll href={href} />}>
      <Table head={["SPLIT", ...columns.map((c) => c.label)]} maxHeight="none">
        {lines.length === 0 && (
          <Empty what="NO SPLITS FOR THIS SEASON YET" cols={columns.length + 1} />
        )}
        {lines.map((l) => (
          <Row key={l.code}>
            <td className="px-3 py-1.5 whitespace-nowrap text-ink-2">{l.label}</td>
            {cells(columns, l.values)}
          </Row>
        ))}
      </Table>
    </Panel>
  );
}

/**
 * The season against what it is a part of: this year's line, October's if
 * there is one, and the career under both.
 */
export function SeasonSummaryPanel({
  group,
  season,
  seasonRows,
  postRows,
  career,
  href,
}: {
  group: StatGroup;
  season: number;
  seasonRows: CareerRow[];
  postRows: CareerRow[];
  career: Record<string, TeamStatValue> | null;
  href: string;
}) {
  const columns = playerCols(group);
  const label = STAT_GROUP_LABEL[group];
  const rows: [string, Record<string, TeamStatValue>][] = [
    ...seasonRows.map(
      (r): [string, Record<string, TeamStatValue>] => [
        seasonRows.length > 1 ? `REGULAR SEASON · ${r.team}` : "REGULAR SEASON",
        r.values,
      ]
    ),
    ...postRows.map(
      (r): [string, Record<string, TeamStatValue>] => ["POSTSEASON", r.values]
    ),
  ];

  return (
    <Panel title={`${season} ${label}`} right={<SeeAll href={href} />}>
      <Table head={["STATS", ...columns.map((c) => c.label)]} maxHeight="none">
        {rows.length === 0 && !career && (
          <Empty what="NO LINE FOR THIS SEASON" cols={columns.length + 1} />
        )}
        {rows.map(([name, values], i) => (
          <Row key={`${name}-${i}`}>
            <td className="px-3 py-1.5 whitespace-nowrap text-ink-2">{name}</td>
            {cells(columns, values)}
          </Row>
        ))}
        {career && (
          <tr className="border-t border-line bg-surface text-ink">
            <td className="px-3 py-1.5 font-bold tracking-wider whitespace-nowrap">
              CAREER
            </td>
            {cells(columns, career, true)}
          </tr>
        )}
      </Table>
    </Panel>
  );
}

/** The last handful of games, with the whole log a click away. */
export function RecentGamesPanel({
  columns,
  months,
  href,
  count = 5,
}: {
  columns: TeamStatCol[];
  months: GameLogGroup[];
  href: string;
  count?: number;
}) {
  const rows = months.flatMap((m) => m.rows).slice(0, count);
  const head = ["DATE", "OPP", "RESULT", ...columns.map((c) => c.label)];

  return (
    <Panel title="RECENT GAMES" right={<SeeAll href={href} />}>
      <Table head={head} maxHeight="none" align={"llc"}>
        {rows.length === 0 && <Empty what="NO GAMES PLAYED YET" cols={head.length} />}
        {rows.map((r) => (
          <Row key={r.gamePk}>
            <td className="px-3 py-1.5 whitespace-nowrap text-ink-2">
              <Link href={`/game/${r.gamePk}`} className="hover:text-accent">
                {dayText(r.date)}
              </Link>
            </td>
            <td className="px-3 py-1.5 whitespace-nowrap">
              <span className="flex items-center gap-1.5">
                <span className="w-4 shrink-0 text-right text-[10px] text-ink-3">
                  {r.home ? "vs" : "@"}
                </span>
                {r.opp ? (
                  <Club id={r.opp.id} abbr={r.opp.abbr} />
                ) : (
                  <span className="text-ink-3">—</span>
                )}
              </span>
            </td>
            <td className="px-3 py-1.5 text-center whitespace-nowrap">
              <Result text={r.result} win={r.win} gamePk={r.gamePk} />
            </td>
            {cells(columns, r.values)}
          </Row>
        ))}
      </Table>
    </Panel>
  );
}

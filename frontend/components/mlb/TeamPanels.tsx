import { Fragment } from "react";
import Link from "next/link";
import Panel from "@/components/ui/Panel";
import {
  Table,
  Row,
  Empty,
  headAlign,
} from "@/components/ui/StatTable";
import PlayerLink from "@/components/mlb/PlayerLink";
import TeamLink from "@/components/mlb/TeamLink";
import {
  cols,
  gameStatus,
  teamStatText,
  transactionMonths,
  FALLBACK_TZ,
  type Game,
  type StatGroup,
  type PitcherRecord,
  type InjuryEntry,
  type RosterGroup,
  type SplitLine,
  type SplitSection,
  type TeamStatCol,
  type TeamStatValue,
  type Transaction,
} from "@/lib/mlb";

/*
 * The club's four reference tabs — schedule, splits, injuries, transactions.
 * All four are one payload rendered as a table, so they share this file and
 * the same scrolling frame rather than each inventing its own chrome.
 */

/* ── Schedule ───────────────────────────────────────────────────────── */

const dayOf = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: FALLBACK_TZ,
  })
    .format(new Date(iso))
    .toUpperCase();

/**
 * How the game went for this club — "W 5-3" once it's final ("W 6-4 F/10" if
 * it went past nine), the half-inning
 * and the running score while it's on, the first pitch before that.
 */
function result(
  g: Game,
  id: number
): { mark: string; text: string; final: boolean } {
  const us = g.home.id === id ? g.home : g.away;
  const them = g.home.id === id ? g.away : g.home;
  const score =
    us.score === null || them.score === null ? "" : `${us.score}-${them.score}`;
  if (g.state !== "Final" || !score)
    return {
      mark: "",
      text: score ? `${gameStatus(g).text} ${score}` : gameStatus(g).text,
      final: false,
    };
  const mark = us.score! > them.score! ? "W" : us.score! < them.score! ? "L" : "T";
  /* A game that went past nine says where it ended — "W 6-4 F/10". */
  const extra = g.inning && g.inning > 9 ? ` F/${g.inning}` : "";
  return { mark, text: `${mark} ${score}${extra}`, final: true };
}

/** A pitcher of record with the line he carries — "Cavalli (12-5)". */
function Decision({
  person,
  record,
  saves = false,
}: {
  person: { id: number; name: string } | null;
  record: PitcherRecord | undefined;
  /** A save is counted, not won and lost. */
  saves?: boolean;
}) {
  if (!person) return null;
  const line = record
    ? saves
      ? `(${record.saves})`
      : `(${record.wins}-${record.losses})`
    : "";
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <PlayerLink id={person.id} headshot={false}>
        {person.name}
      </PlayerLink>
      {line && <span className="tabular-nums text-ink-3">{line}</span>}
    </span>
  );
}

/** A named starter for a game not yet played — blank until MLB names one. */
function Probable({ p }: { p: { id: number; name: string } | null }) {
  if (!p) return null;
  return (
    <PlayerLink id={p.id} headshot={false}>
      {p.name}
    </PlayerLink>
  );
}

/* Centred, except the club played, which reads down the left with its logo. */
const SCHEDULE_ALIGN = "clcccccc";

export function SchedulePanel({
  games,
  id,
  records,
  title,
  controls,
}: {
  games: Game[];
  id: number;
  /** Every pitcher's line as of each game, for the decision columns. */
  records: Map<string, PitcherRecord>;
  title: string;
  controls?: React.ReactNode;
}) {
  /* Games still to come read as a different table — a time and two probables
     where a played one carries a score and its pitchers of record — so they
     get their own bar rather than sitting silently under the wrong labels. */
  const upcoming = games.findIndex((g) => !result(g, id).final);

  return (
    <Panel title={title} right={controls}>
      {/* No inner scroll: the half being shown is meant to fit on the page in
          one piece, which is what the season and half controls are for. */}
      <Table
        head={["DATE", "OPPONENT", "RESULT", "REC", "WIN", "LOSS", "SAVE", "ATT"]}
        maxHeight="none"
        align={SCHEDULE_ALIGN}
      >
        {games.length === 0 && <Empty what="NO GAMES IN THIS RANGE" cols={8} />}
        {games.map((g, i) => {
          const home = g.home.id === id;
          const us = home ? g.home : g.away;
          const opp = home ? g.away : g.home;
          const r = result(g, id);
          const d = g.decisions;
          const rec = (p: { id: number } | null) =>
            p ? records.get(`${g.pk}:${p.id}`) : undefined;

          return (
            <Fragment key={g.pk}>
              {i === upcoming && (
                <tr>
                  {["DATE", "OPPONENT", "TIME", "", "PITCHER", "OPPONENT", "", ""].map(
                    (h, j) => (
                      <th
                        key={j}
                        scope="col"
                        className={`border-y border-line bg-surface px-3 py-2 text-[10px] font-normal tracking-widest text-ink-3 ${headAlign(
                          SCHEDULE_ALIGN,
                          j
                        )}`}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              )}
              <Row>
                <td className="px-3 py-1.5 text-center whitespace-nowrap">
                  <Link href={`/game/${g.pk}`} className="hover:text-accent">
                    {dayOf(g.startTime)}
                  </Link>
                </td>
                <td className="px-3 py-1.5">
                  <span className="flex items-center gap-1.5">
                    <span className="text-ink-3">{home ? "VS" : "@"}</span>
                    <TeamLink id={opp.id} name={opp.name} />
                  </span>
                </td>
                <td
                  className={`px-3 py-1.5 text-center whitespace-nowrap tabular-nums ${
                    r.mark === "W"
                      ? "font-bold text-good"
                      : r.mark === "L"
                        ? "font-bold text-crit"
                        : "text-ink-2"
                  }`}
                >
                  <Link href={`/game/${g.pk}`} className="hover:text-accent">
                    {gameStatus(g).tone === "live" ? (
                      <span className="whitespace-nowrap text-[10px] tracking-widest text-crit">
                        <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-crit align-middle" />
                        LIVE
                      </span>
                    ) : (
                      r.text
                    )}
                  </Link>
                </td>
                {r.final ? (
                  <>
                    <td className="px-3 py-1.5 text-center tabular-nums whitespace-nowrap">
                      {us.wins === null ? "" : `${us.wins}-${us.losses}`}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <Decision person={d.winner} record={rec(d.winner)} />
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <Decision person={d.loser} record={rec(d.loser)} />
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <Decision person={d.save} record={rec(d.save)} saves />
                    </td>
                    <td className="px-3 py-1.5 text-center tabular-nums">
                      {g.attendance === null ? "" : g.attendance.toLocaleString()}
                    </td>
                  </>
                ) : (
                  /* Nothing has been decided yet, so the two decision columns
                     carry who is expected to throw instead — this club's under
                     WIN, theirs under LOSS. MLB names probables a few days
                     out, so the rest of the schedule leaves them blank. */
                  <>
                    <td className="px-3 py-1.5" />
                    <td className="px-3 py-1.5 text-center text-ink-3">
                      <Probable p={us.probable} />
                    </td>
                    <td className="px-3 py-1.5 text-center text-ink-3">
                      <Probable p={opp.probable} />
                    </td>
                    <td className="px-3 py-1.5" />
                    <td className="px-3 py-1.5" />
                  </>
                )}
              </Row>
            </Fragment>
          );
        })}
      </Table>
    </Panel>
  );
}

/* ── Splits ─────────────────────────────────────────────────────────── */

/* One rectangle per block of splits, each with the column labels over its own
   figures, the way MLB's own splits page prints them: fourteen rate columns
   are unreadable if the reader has to scroll back up to remember which is
   which, and one unbroken table of two hundred rows reads as a wall. */

const SPLIT_TITLES: Record<StatGroup, string> = {
  hitting: "Batting",
  pitching: "Pitching",
  fielding: "Fielding",
};

/* The name column is pinned rather than sized to each block's longest label,
   and every stat column takes an equal share of what is left — the figures
   sit in the same places from one rectangle to the next rather than each
   table spacing itself to its own widest number. */
const splitWidths = (columns: TeamStatCol[]) => [
  "13rem",
  ...columns.map(() => "auto"),
];

/* Names left, figures centred in their own columns. */
const splitAlign = (columns: TeamStatCol[]) => `l${"c".repeat(columns.length)}`;

/** A figure, or nothing at all: a column the feed doesn't report for a slice
    is left blank rather than filled with a dash the eye has to read past. */
const splitCell = (v: TeamStatValue) =>
  v === null || v === undefined ? "" : teamStatText(v);

/** Whether a column says anything about this block. A slice MLB reports no
    runs or stolen bases for loses those columns outright — a block of blanks
    is the same nothing, printed wider. */
const shownCols = (columns: TeamStatCol[], lines: SplitLine[]) =>
  columns.filter((c) =>
    lines.some((l) => splitCell(l.values[c.key]) !== ""),
  );

export function SplitsPanels({
  group,
  sections,
  season,
  columns = cols(group),
}: {
  group: StatGroup;
  sections: SplitSection[];
  /** The year the slices come from, or the whole of a player's career. */
  season: number | "career";
  /** The club's own columns by default; a player's page passes its narrower
      per-player set, which is the same table read one line at a time. */
  columns?: TeamStatCol[];
}) {
  return (
    <div className="space-y-3">
      {sections.length === 0 && (
        <Panel
          title={`${SPLIT_TITLES[group]} Splits — ${
            season === "career" ? "Career" : `${season} Season`
          }`}
          tight
        >
          <Table head={[]} maxHeight="none">
            <Empty
              what={
                season === "career"
                  ? "No career splits on record"
                  : "No splits for this season yet"
              }
              cols={columns.length + 1}
            />
          </Table>
        </Panel>
      )}
      {sections.map((sec) => {
        const shown = shownCols(columns, sec.lines);
        return (
          <Panel key={sec.label} title={sec.label} tight>
            <Table
              /* The heads carry each column's own tooltip, as the section
                 bands used to. */
              head={[
                "",
                ...shown.map((c) => (
                  <span key={c.key} title={c.title}>
                    {c.label}
                  </span>
                )),
              ]}
              maxHeight="none"
              widths={splitWidths(shown)}
              align={splitAlign(shown)}
            >
              {sec.lines.map((l) => (
                <Row key={l.code}>
                  <td
                    className={`px-3 py-1.5 whitespace-nowrap ${
                      l.code === "total" ? "text-ink" : "text-ink-2"
                    }`}
                  >
                    {l.label}
                  </td>
                  {shown.map((c) => (
                    <td
                      key={c.key}
                      className={`px-2 py-1.5 text-center tabular-nums ${
                        l.code === "total" ? "text-ink" : "text-ink-3"
                      }`}
                    >
                      {splitCell(l.values[c.key])}
                    </td>
                  ))}
                </Row>
              ))}
            </Table>
          </Panel>
        );
      })}
      <Glossary columns={columns} title="Glossary" />
    </div>
  );
}

/* Every abbreviation on the table above, spelled out — the same `title` text
   the column tooltips carry, for a reader who is not going to hover fourteen
   headers to find the one they didn't know. The columns are the group's own,
   so a pitching page never explains SLG. */
export function Glossary({
  columns,
  title = "GLOSSARY",
}: {
  columns: TeamStatCol[];
  /** Set in mixed case where the page around it is — the splits tabs. */
  title?: string;
}) {
  return (
    <Panel title={title}>
      <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
        {columns.map((c) => (
          <div key={c.key} className="flex gap-2">
            <dt className="w-12 shrink-0 text-ink">{c.label}</dt>
            <dd className="min-w-0 text-ink-2">{c.title}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/* ── Roster ─────────────────────────────────────────────────────────── */

/** Age, height and weight only mean something when MLB reported them. */
const or = (v: string | number | null, unit = "") =>
  v === null || v === "" ? "—" : `${v}${unit}`;

/* Every group is its own table, so the columns are pinned rather than sized
   to each group's longest name — the roster reads as one list. */
const ROSTER_WIDTHS = ["28%", "12%", "12%", "12%", "12%", "12%", "12%"];

export function RosterPanel({ groups }: { groups: RosterGroup[] }) {
  const total = groups.reduce((n, g) => n + g.players.length, 0);

  return (
    <Panel
      title="Active Roster"
      right={<span className="text-[10px] text-ink-3">{total} PLAYERS</span>}
    >
      {total === 0 ? (
        <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
          NO ACTIVE ROSTER FOR THIS CLUB YET
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.label}>
              <h3 className="mb-1 text-[10px] tracking-[0.2em] text-ink-2">
                {g.label} · {g.players.length}
              </h3>
              <Table
                head={[
                  "PLAYER",
                  "POSITION",
                  "THROWS",
                  "BATS",
                  "AGE",
                  "HEIGHT",
                  "WEIGHT",
                ]}
                maxHeight="none"
                align="lcccccc"
                widths={ROSTER_WIDTHS}
              >
                {g.players.map((p) => (
                  <Row key={p.id}>
                    <td className="px-3 py-1.5">
                      <span className="flex items-center gap-2">
                        <PlayerLink id={p.id}>{p.name}</PlayerLink>
                        {p.number && (
                          <span className="tabular-nums text-ink-3">
                            #{p.number}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-center text-[10px] tracking-wider text-ink-3">
                      {p.pos || "—"}
                    </td>
                    <td className="px-3 py-1.5 text-center">{p.throws}</td>
                    <td className="px-3 py-1.5 text-center">{p.bats}</td>
                    <td className="px-3 py-1.5 text-center tabular-nums">
                      {or(p.age)}
                    </td>
                    <td className="px-3 py-1.5 text-center whitespace-nowrap tabular-nums">
                      {or(p.height)}
                    </td>
                    <td className="px-3 py-1.5 text-center tabular-nums">
                      {or(p.weight, " LB")}
                    </td>
                  </Row>
                ))}
              </Table>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ── Injuries ───────────────────────────────────────────────────────── */

/* Which list a player is on, by its dot: the short stays blue, the 15-day
   amber, the 60-day red — a club reads its own report by that spread. */
const IL_DOT: Record<string, string> = {
  D7: "bg-accent",
  D10: "bg-accent",
  D15: "bg-warn",
  D60: "bg-crit",
};

/** "D15" as a club says it — "15-DAY IL". */
const ilLabel = (p: InjuryEntry) => {
  const days = p.statusCode.match(/^D(\d+)/);
  return days ? `${days[1]}-DAY IL` : p.status.toUpperCase();
};

const INJURY_WIDTHS = ["27%", "13%", "60%"];

export function InjuriesPanel({ players }: { players: InjuryEntry[] }) {
  /* Already newest move first, so a day's names sit together — they only need
     collecting under the date they were placed. */
  const days = players.reduce<{ date: string; players: InjuryEntry[] }[]>(
    (acc, p) => {
      const last = acc[acc.length - 1];
      if (last && last.date === p.since) last.players.push(p);
      else acc.push({ date: p.since, players: [p] });
      return acc;
    },
    []
  );

  return (
    <Panel title="Injury Report">
      <Table
        head={["PLAYER", "STATUS", "NOTE"]}
        align="lcl"
        widths={INJURY_WIDTHS}
        maxHeight="none"
      >
        {players.length === 0 && <Empty what="NOBODY ON THE INJURED LIST" cols={3} />}
        {days.map((day) => (
          <Fragment key={day.date}>
            <tr>
              <td
                colSpan={3}
                className="border-y border-line bg-surface px-3 py-1.5 text-[10px] tracking-[0.2em] text-ink-2"
              >
                {day.date ? dayOf(`${day.date}T12:00:00Z`) : "BEFORE THIS SEASON"}
              </td>
            </tr>
            {day.players.map((p) => (
              <Row key={p.id}>
                <td className="px-3 py-1.5">
                  <span className="flex items-center gap-2">
                    <PlayerLink id={p.id}>{p.name}</PlayerLink>
                    <span className="text-[10px] tracking-wider text-ink-3">
                      {p.pos}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-1.5 text-center whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 ${IL_DOT[p.statusCode] ?? "bg-ink-3"}`}
                    />
                    <span className="text-[10px] tracking-wider">{ilLabel(p)}</span>
                  </span>
                </td>
                {/* MLB's own wording of the move, which names the injury — the
                    club's report, not a paraphrase of it. */}
                <td className="px-3 py-1.5 text-ink-2">{p.note}</td>
              </Row>
            ))}
          </Fragment>
        ))}
      </Table>
    </Panel>
  );
}

/* ── Transactions ───────────────────────────────────────────────────── */

const monthOf = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: FALLBACK_TZ,
  }).format(new Date(`${iso}T12:00:00Z`));

export function TransactionsPanel({
  moves,
  controls,
}: {
  moves: Transaction[];
  controls?: React.ReactNode;
}) {
  const months = transactionMonths(moves);

  return (
    <Panel title="Transactions" right={controls}>
      <Table
        head={["DATE", "TRANSACTION"]}
        align="ll"
        widths={["18%", "82%"]}
        maxHeight="none"
      >
        {moves.length === 0 && <Empty what="NO TRANSACTIONS THIS SEASON" cols={2} />}
        {months.map((m) => (
          <Fragment key={m.key}>
            <tr>
              <td
                colSpan={2}
                className="border-y border-line bg-surface px-3 py-2 text-xs text-ink"
              >
                {monthOf(m.days[0].date)}
              </td>
            </tr>
            {m.days.map((d) => (
              <Row key={d.date}>
                <td className="px-3 py-1.5 align-top whitespace-nowrap text-ink-3">
                  {dayOf(`${d.date}T12:00:00Z`)}
                </td>
                {/* The day's moves in MLB's own wording, one paragraph, the
                    way a club posts its log. */}
                <td className="px-3 py-1.5 text-ink-2">{d.notes.join(" ")}</td>
              </Row>
            ))}
          </Fragment>
        ))}
      </Table>
    </Panel>
  );
}

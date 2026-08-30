import { Fragment } from "react";
import Link from "next/link";
import Panel from "@/components/ui/Panel";
import PlayerLink from "@/components/mlb/PlayerLink";
import TeamLink from "@/components/mlb/TeamLink";
import {
  gameStatus,
  teamStatText,
  FALLBACK_TZ,
  TEAM_HITTING_COLS,
  TEAM_PITCHING_COLS,
  type Game,
  type PitcherRecord,
  type InjuryEntry,
  type RosterGroup,
  type SplitLine,
  type TeamStatCol,
  type Transaction,
} from "@/lib/mlb";

/*
 * The club's four reference tabs — schedule, splits, injuries, transactions.
 * All four are one payload rendered as a table, so they share this file and
 * the same scrolling frame rather than each inventing its own chrome.
 */

/** The frame every table here sits in — sticky head, scrolls on its own. */
function Table({
  head,
  children,
  maxHeight = "36rem",
  align,
  widths,
}: {
  /** Column labels; anything after the first is right-aligned. */
  head: string[];
  children: React.ReactNode;
  maxHeight?: string;
  /** One of "l"/"c"/"r" per column, where the default doesn't suit. */
  align?: string;
  /** Fixed column widths — for a section split over several tables, which
      otherwise size their columns to their own longest name and wander. */
  widths?: string[];
}) {
  return (
    <div
      className="overflow-auto border border-line"
      style={{ maxHeight }}
    >
      <table
        className={`w-full border-collapse text-xs ${widths ? "table-fixed" : ""}`}
      >
        {widths && (
          <colgroup>
            {widths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
        )}
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={h + i}
                scope="col"
                className={`sticky top-0 z-10 border-b border-line bg-surface px-3 py-2 text-[10px] font-normal tracking-widest text-ink-3 ${
                  headAlign(align, i)
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** Where a head cell sits: the mask if it names this column, else the default. */
const headAlign = (align: string | undefined, i: number) =>
  ({ l: "text-left", c: "text-center", r: "text-right" })[align?.[i] ?? ""] ??
  (i === 0 ? "text-left" : "text-right");

const Row = ({ children }: { children: React.ReactNode }) => (
  <tr className="border-b border-grid text-ink-2 last:border-b-0 hover:bg-surface-2">
    {children}
  </tr>
);

function Empty({ what, cols }: { what: string; cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-6 text-center text-xs text-ink-3">
        {what}
      </td>
    </tr>
  );
}

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
                  {r.text}
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

function SplitTable({
  group,
  columns,
  lines,
  season,
}: {
  group: "hitting" | "pitching";
  columns: TeamStatCol[];
  lines: SplitLine[];
  season: number;
}) {
  return (
    <Panel title={`${group.toUpperCase()} SPLITS — ${season} SEASON`}>
      <Table head={["SPLIT", ...columns.map((c) => c.label)]} maxHeight="24rem">
        {lines.length === 0 && (
          <Empty what="NO SPLITS FOR THIS SEASON YET" cols={columns.length + 1} />
        )}
        {lines.map((l) => (
          <Row key={l.code}>
            <td className="px-3 py-1.5 whitespace-nowrap text-ink">{l.label}</td>
            {columns.map((c) => (
              <td
                key={c.key}
                title={c.title}
                className="px-3 py-1.5 text-right tabular-nums"
              >
                {teamStatText(l.values[c.key])}
              </td>
            ))}
          </Row>
        ))}
      </Table>
    </Panel>
  );
}

export function SplitsPanels({
  hitting,
  pitching,
  season,
}: {
  hitting: SplitLine[];
  pitching: SplitLine[];
  season: number;
}) {
  return (
    <>
      <SplitTable
        group="hitting"
        columns={TEAM_HITTING_COLS}
        lines={hitting}
        season={season}
      />
      <SplitTable
        group="pitching"
        columns={TEAM_PITCHING_COLS}
        lines={pitching}
        season={season}
      />
    </>
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
      title="ACTIVE ROSTER"
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
    <Panel title="INJURY REPORT">
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

export function TransactionsPanel({ moves }: { moves: Transaction[] }) {
  return (
    <Panel
      title="TRANSACTIONS"
      right={<span className="text-[10px] text-ink-3">{moves.length} MOVES</span>}
    >
      <Table head={["DATE", "PLAYER", "TYPE", "MOVE"]}>
        {moves.length === 0 && <Empty what="NO TRANSACTIONS THIS SEASON" cols={4} />}
        {/* A trade is one transaction id per player it moved, so the two sides
            of a swap arrive as two rows sharing an id — the player makes the
            row, and the id alone would not make it unique. */}
        {moves.map((t, i) => (
          <Row key={`${t.id}-${t.personId ?? i}`}>
            <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">{t.date}</td>
            <td className="px-3 py-1.5">
              {t.personId ? (
                <PlayerLink id={t.personId}>{t.person}</PlayerLink>
              ) : (
                <span className="text-ink-3">—</span>
              )}
            </td>
            <td className="px-3 py-1.5 text-right text-[10px] tracking-wider whitespace-nowrap text-ink-3">
              {t.type}
            </td>
            <td className="px-3 py-1.5 text-right text-ink-2">{t.description}</td>
          </Row>
        ))}
      </Table>
    </Panel>
  );
}

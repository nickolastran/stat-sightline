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
  type RosterEntry,
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
}: {
  /** Column labels; anything after the first is right-aligned. */
  head: string[];
  children: React.ReactNode;
  maxHeight?: string;
}) {
  return (
    <div
      className="overflow-auto border border-line"
      style={{ maxHeight }}
    >
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={h + i}
                scope="col"
                className={`sticky top-0 z-10 border-b border-line bg-surface px-3 py-2 text-[10px] font-normal tracking-widest text-ink-3 ${
                  i === 0 ? "text-left" : "text-right"
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
 * How the game went for this club — "W 5-3" once it's final, the half-inning
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
  return { mark, text: `${mark} ${score}`, final: true };
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
  if (!person) return <span className="text-ink-3">—</span>;
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

export function SchedulePanel({
  games,
  id,
  records,
  title,
  controls,
}: {
  games: Game[];
  id: number;
  /** Season lines for every pitcher, for the decision columns. */
  records: Map<number, PitcherRecord>;
  title: string;
  controls?: React.ReactNode;
}) {
  return (
    <Panel title={title} right={controls}>
      {/* No inner scroll: the half being shown is meant to fit on the page in
          one piece, which is what the season and half controls are for. */}
      <Table
        head={["DATE", "OPPONENT", "RESULT", "REC", "WIN", "LOSS", "SAVE", "ATT"]}
        maxHeight="none"
      >
        {games.length === 0 && <Empty what="NO GAMES IN THIS RANGE" cols={8} />}
        {games.map((g) => {
          const home = g.home.id === id;
          const us = home ? g.home : g.away;
          const opp = home ? g.away : g.home;
          const r = result(g, id);
          const d = g.decisions;

          return (
            <Row key={g.pk}>
              <td className="px-3 py-1.5 whitespace-nowrap">
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
                className={`px-3 py-1.5 text-right whitespace-nowrap tabular-nums ${
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
                  <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                    {us.wins === null ? "—" : `${us.wins}-${us.losses}`}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <Decision person={d.winner} record={records.get(d.winner?.id ?? -1)} />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <Decision person={d.loser} record={records.get(d.loser?.id ?? -1)} />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <Decision person={d.save} record={records.get(d.save?.id ?? -1)} saves />
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {g.attendance === null ? "—" : g.attendance.toLocaleString()}
                  </td>
                </>
              ) : (
                /* Nothing has been decided yet, and the club's record hasn't
                   moved, so those columns become one line of who is expected to
                   throw — MLB names probables a few days out, so the rest of
                   the schedule reads "TBA". */
                <td colSpan={5} className="px-3 py-1.5 text-right text-ink-3">
                  <span className="inline-flex items-center gap-1.5">
                    {us.probable ? (
                      <PlayerLink id={us.probable.id} headshot={false}>
                        {us.probable.name}
                      </PlayerLink>
                    ) : (
                      "TBA"
                    )}
                    <span className="text-[10px] tracking-wider">VS</span>
                    {opp.probable ? (
                      <PlayerLink id={opp.probable.id} headshot={false}>
                        {opp.probable.name}
                      </PlayerLink>
                    ) : (
                      "TBA"
                    )}
                  </span>
                </td>
              )}
            </Row>
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
                head={["PLAYER", "#", "POS", "T", "B", "AGE", "HT", "WT"]}
                maxHeight="none"
              >
                {g.players.map((p) => (
                  <Row key={p.id}>
                    <td className="px-3 py-1.5">
                      <PlayerLink id={p.id}>{p.name}</PlayerLink>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-ink-3">
                      {p.number ? `#${p.number}` : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right text-[10px] tracking-wider text-ink-3">
                      {p.pos || "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right">{p.throws}</td>
                    <td className="px-3 py-1.5 text-right">{p.bats}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {or(p.age)}
                    </td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums">
                      {or(p.height)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
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

export function InjuriesPanel({ players }: { players: RosterEntry[] }) {
  return (
    <Panel
      title="INJURY REPORT"
      right={
        <span className="text-[10px] text-ink-3">
          {players.length} ON THE LIST
        </span>
      }
    >
      <Table head={["PLAYER", "POS", "STATUS"]}>
        {players.length === 0 && <Empty what="NOBODY ON THE INJURED LIST" cols={3} />}
        {players.map((p) => (
          <Row key={p.id}>
            <td className="px-3 py-1.5">
              <PlayerLink id={p.id}>{p.name}</PlayerLink>
            </td>
            <td className="px-3 py-1.5 text-right text-[10px] tracking-wider text-ink-3">
              {p.pos}
            </td>
            <td className="px-3 py-1.5 text-right whitespace-nowrap">{p.status}</td>
          </Row>
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

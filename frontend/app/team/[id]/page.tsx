import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import Panel from "@/components/ui/Panel";
import MetricCard from "@/components/ui/MetricCard";
import {
  Skeleton,
  SkeletonPanel,
  SkeletonTiles,
} from "@/components/ui/Skeleton";
import PlayerLink from "@/components/mlb/PlayerLink";
import {
  getTeamIdentity,
  getTeamLines,
  getTeamRecord,
  getTeamRoster,
  seasonOf,
  teamLogo,
  teamStatText,
  todayET,
  TEAM_HITTING_COLS,
  TEAM_PITCHING_COLS,
  type RosterEntry,
  type StandingRow,
  type TeamIdentity,
  type TeamStatCol,
  type TeamStatRow,
} from "@/lib/mlb";

/*
 * One club's season page — the target of every TeamLink, reached from the
 * team-statistics section and from any standings row. Identity bar, the
 * club's standings line, its season hitting and pitching lines in the same
 * column order the league-wide tables use, and its roster linking on to the
 * player pages.
 *
 * Only identity is awaited before rendering; the three panels stream in
 * behind their own skeletons, so the page has shape immediately and a slow
 * roster never holds back the record. That also keeps the 404 honest — see
 * lib/mlb's note on getTeamIdentity. A dead MLB API degrades to a notice per
 * panel rather than blanking the page.
 */

/** The four stats each group leads with, as MetricCards. */
const HEADLINE: Record<"hitting" | "pitching", string[]> = {
  hitting: ["avg", "homeRuns", "runs", "ops"],
  pitching: ["era", "whip", "strikeOuts", "saves"],
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const t = await getTeamIdentity(Number(id), seasonOf(todayET())).catch(
    () => null
  );
  return { title: t ? `${t.name} — STAT//SIGHTLINE` : "STAT//SIGHTLINE" };
}

function Unavailable({ what }: { what: string }) {
  return (
    <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
      {what} UNAVAILABLE — MLB API UNREACHABLE
    </p>
  );
}

function Identity({ t, season }: { t: TeamIdentity; season: number }) {
  const facts = [
    t.division,
    t.league,
    t.venue.toUpperCase(),
    t.firstYear && `EST ${t.firstYear}`,
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-3 border border-line bg-surface px-3 py-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={teamLogo(t.id)}
        alt=""
        width={36}
        height={36}
        className="h-9 w-9 shrink-0"
      />
      <div className="min-w-0">
        <h1 className="truncate text-base font-bold tracking-wider text-ink">
          {t.name.toUpperCase()}
        </h1>
        <p className="mt-1 truncate text-[10px] tracking-[0.2em] text-ink-3">
          {[`${season} SEASON`, ...facts].join(" · ")}
        </p>
      </div>
      <Link
        href="/league/teams"
        className="ml-auto shrink-0 border border-line px-2 py-1 text-[10px] tracking-wider text-ink-2 hover:border-accent hover:text-ink"
      >
        ← ALL TEAM STATS
      </Link>
    </div>
  );
}

/** Label/value grid — the tail of every panel below its headline tiles. */
function StatGrid({ items }: { items: [string, string][] }) {
  return (
    <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="flex items-baseline justify-between gap-2 border border-line bg-bg px-2 py-1.5"
        >
          <dt className="text-[10px] tracking-widest text-ink-3">{label}</dt>
          <dd className="text-xs tabular-nums text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ── Record ─────────────────────────────────────────────────────────── */

function RecordBody({ r }: { r: StandingRow }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label="W-L" value={`${r.wins}-${r.losses}`} />
        <MetricCard label="PCT" value={r.pct} />
        <MetricCard
          label="RUN DIFF"
          value={r.runDiff > 0 ? `+${r.runDiff}` : String(r.runDiff)}
        />
        <MetricCard label="STREAK" value={r.streak} />
      </div>
      <StatGrid
        items={[
          ["GB", r.gb],
          ["DIV RANK", r.divRank],
          ["LG RANK", r.leagueRank],
          ["MLB RANK", r.sportRank],
          ["RS", String(r.runsScored)],
          ["RA", String(r.runsAllowed)],
          ["L10", r.last10],
          ["HOME", r.home],
          ["AWAY", r.away],
          ["STRK", r.streak],
        ]}
      />
    </>
  );
}

async function RecordPanel({ id, season }: { id: number; season: number }) {
  let record: StandingRow | null;
  try {
    record = await getTeamRecord(id, season);
  } catch {
    return (
      <Panel title={`RECORD — ${season} SEASON`}>
        <Unavailable what="RECORD" />
      </Panel>
    );
  }

  return (
    <Panel
      title={`RECORD — ${season} SEASON`}
      right={
        record ? (
          <span className="text-[10px] text-ink-3">{record.division}</span>
        ) : undefined
      }
    >
      {record ? (
        <RecordBody r={record} />
      ) : (
        <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
          NO {season} STANDINGS LINE FOR THIS CLUB YET
        </p>
      )}
    </Panel>
  );
}

/* ── Season lines ───────────────────────────────────────────────────── */

function StatPanel({
  group,
  columns,
  row,
  season,
}: {
  group: "hitting" | "pitching";
  columns: TeamStatCol[];
  row: TeamStatRow | null;
  season: number;
}) {
  const headline = HEADLINE[group];
  const head = headline
    .map((k) => columns.find((c) => c.key === k))
    .filter((c): c is TeamStatCol => !!c);
  const rest = columns.filter((c) => !headline.includes(c.key));

  return (
    <Panel title={`TEAM ${group.toUpperCase()} — ${season} SEASON`}>
      {row ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {head.map((c) => (
              <MetricCard
                key={c.key}
                label={c.label}
                value={teamStatText(row.values[c.key])}
              />
            ))}
          </div>
          <StatGrid
            items={rest.map((c) => [c.label, teamStatText(row.values[c.key])])}
          />
        </>
      ) : (
        <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
          NO {season} {group.toUpperCase()} LINE FOR THIS CLUB YET
        </p>
      )}
    </Panel>
  );
}

async function StatPanels({ id, season }: { id: number; season: number }) {
  let lines: Awaited<ReturnType<typeof getTeamLines>>;
  try {
    lines = await getTeamLines(id, season);
  } catch {
    return (
      <Panel title={`TEAM STATS — ${season} SEASON`}>
        <Unavailable what="TEAM STATS" />
      </Panel>
    );
  }

  return (
    <>
      <StatPanel
        group="hitting"
        columns={TEAM_HITTING_COLS}
        row={lines.hitting}
        season={season}
      />
      <StatPanel
        group="pitching"
        columns={TEAM_PITCHING_COLS}
        row={lines.pitching}
        season={season}
      />
    </>
  );
}

/* ── Roster ─────────────────────────────────────────────────────────── */

/* Pitchers first, then the position groups in the order the API names them. */
const POS_ORDER = ["Pitcher", "Catcher", "Infielder", "Outfielder", "Hitter"];

async function RosterPanel({ id, season }: { id: number; season: number }) {
  const roster: RosterEntry[] = await getTeamRoster(id, season);
  if (roster.length === 0) return null;

  const groups = new Map<string, RosterEntry[]>();
  for (const p of roster) {
    const g = groups.get(p.posType) ?? [];
    g.push(p);
    groups.set(p.posType, g);
  }
  const ordered = [...groups.entries()].sort(
    (a, b) =>
      (POS_ORDER.indexOf(a[0]) + 1 || 99) - (POS_ORDER.indexOf(b[0]) + 1 || 99)
  );

  return (
    <Panel
      title="ROSTER"
      right={
        <span className="text-[10px] text-ink-3">{roster.length} PLAYERS</span>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ordered.map(([type, players]) => (
          <div key={type} className="border border-line bg-bg">
            <h3 className="border-b border-line px-3 py-1.5 text-[10px] tracking-[0.2em] text-ink-2">
              {type.toUpperCase()}S · {players.length}
            </h3>
            <ul>
              {players.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2 border-b border-grid px-3 py-1.5 text-xs last:border-b-0"
                >
                  <span className="w-6 text-right text-[10px] tabular-nums text-ink-3">
                    {p.number && `#${p.number}`}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink-2">
                    <PlayerLink id={p.id}>{p.name}</PlayerLink>
                  </span>
                  <span className="w-8 text-right text-[10px] tracking-wider text-ink-3">
                    {p.pos}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ── Placeholders ───────────────────────────────────────────────────── */

/** Four headline tiles over a label/value grid — the shape of every panel. */
const StatPanelSkeleton = ({
  delay = 0,
  cells = 12,
}: {
  delay?: number;
  cells?: number;
}) => (
  <SkeletonPanel delay={delay} right>
    <SkeletonTiles delay={delay} />
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: cells }).map((_, i) => (
        <Skeleton key={i} className="h-7 w-full" delay={delay + i * 0.04} />
      ))}
    </div>
  </SkeletonPanel>
);

const RosterSkeleton = () => (
  <SkeletonPanel right>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-48 w-full" delay={i * 0.1} />
      ))}
    </div>
  </SkeletonPanel>
);

/* ── Page ───────────────────────────────────────────────────────────── */

export default async function TeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const teamId = Number(id);
  if (!Number.isFinite(teamId)) notFound();
  const season = seasonOf(todayET());

  let team: TeamIdentity | null;
  try {
    team = await getTeamIdentity(teamId, season);
  } catch {
    return (
      <div className="mx-auto max-w-7xl p-3">
        <Unavailable what="TEAM" />
      </div>
    );
  }
  if (!team) notFound();

  return (
    <div className="mx-auto max-w-7xl space-y-3 p-3">
      <Identity t={team} season={season} />
      <Suspense fallback={<StatPanelSkeleton cells={10} />}>
        <RecordPanel id={teamId} season={season} />
      </Suspense>
      <Suspense
        fallback={
          <>
            <StatPanelSkeleton delay={0.08} />
            <StatPanelSkeleton delay={0.16} cells={12} />
          </>
        }
      >
        <StatPanels id={teamId} season={season} />
      </Suspense>
      <Suspense fallback={<RosterSkeleton />}>
        <RosterPanel id={teamId} season={season} />
      </Suspense>
    </div>
  );
}

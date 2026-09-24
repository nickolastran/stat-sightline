import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import Panel from "@/components/ui/Panel";
import SectionSkeleton from "@/components/ui/SectionSkeleton";
import DivisionTable from "@/components/mlb/DivisionTable";
import TeamStats from "@/components/mlb/TeamStats";
import PlayerLink from "@/components/mlb/PlayerLink";
import TeamLink from "@/components/mlb/TeamLink";
import ParamSelect from "@/components/mlb/ParamSelect";
import ParamTabs from "@/components/mlb/ParamTabs";
import SeasonSelect from "@/components/mlb/SeasonSelect";
import { Glossary } from "@/components/mlb/TeamPanels";
import {
  getTeamStats,
  playerCols,
  seasonOf,
  teamStatText,
  titleCase,
  todayPT,
  type StatGroup,
} from "@/lib/mlb";
import {
  MINORS_FIRST_SEASON,
  MINOR_LEVELS,
  getMinorPlayers,
  getMinorStandings,
  pickLevel,
  pickMinorStat,
  type MinorLevel,
} from "@/lib/minors";

/*
 * The minor leagues, all on one route — every level's standings, its clubs'
 * season lines, and its qualified players ranked by any column.
 *
 * One page rather than a section each, because a reader here is comparing
 * levels: the level is a control the way a season is, and switching it keeps
 * whatever was being read. Everything is a query parameter for the same
 * reason the league sections are — each view is fetched on the server, so the
 * board somebody is looking at is the board their link opens on.
 *
 * ponytail: one route, three views. Split into /minors/<view> routes when the
 * controls diverge enough that a shared page stops paying for itself.
 */

export const metadata: Metadata = { title: "Minor Leagues" };

const VIEWS = [
  { value: "standings", label: "STANDINGS" },
  { value: "players", label: "PLAYERS" },
  { value: "teams", label: "TEAM STATS" },
] as const;

type View = (typeof VIEWS)[number]["value"];

const GROUPS: { value: StatGroup; label: string }[] = [
  { value: "hitting", label: "BATTING" },
  { value: "pitching", label: "PITCHING" },
  { value: "fielding", label: "FIELDING" },
];

const pickView = (raw: string | undefined): View =>
  (VIEWS.find((v) => v.value === raw)?.value ?? "standings") as View;

const pickGroup = (raw: string | undefined): StatGroup =>
  raw === "pitching" || raw === "fielding" ? raw : "hitting";

/** A `?season=` the minor-league feeds can answer, else the running one. */
const pickSeason = (raw: string | undefined, current: number): number => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= MINORS_FIRST_SEASON && n <= current
    ? n
    : current;
};

function Unavailable() {
  return (
    <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
      UNAVAILABLE — MLB API UNREACHABLE
    </p>
  );
}

function Empty({ what }: { what: string }) {
  return (
    <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
      NO {what} FOR THIS LEVEL AND SEASON
    </p>
  );
}

/**
 * One level's qualified players, ranked by one column.
 *
 * The heading of every column is a link that re-asks for the board in that
 * order, which is MLB's own — best first, whichever direction that runs for
 * the stat. Server-rendered for the same reason the board is fetched that
 * way: sorting is a new fifty players, not a reshuffle of these.
 */
function PlayerBoard({
  rows,
  group,
  stat,
  total,
  href,
}: {
  rows: Awaited<ReturnType<typeof getMinorPlayers>>["rows"];
  group: StatGroup;
  stat: string;
  total: number;
  href: (over: Record<string, string>) => string;
}) {
  const columns = playerCols(group);
  if (rows.length === 0) return <Empty what="PLAYERS" />;
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto border border-line">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              {["RK", "NAME", "POS", "TEAM"].map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={`border-b border-line bg-surface px-2 py-2 text-[10px] font-normal tracking-widest whitespace-nowrap text-ink-3 ${
                    i === 0 ? "text-right" : "text-left"
                  }`}
                >
                  {h}
                </th>
              ))}
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className="border-b border-line bg-surface px-2 py-2 text-[10px] font-normal tracking-widest text-ink-3"
                >
                  <Link
                    href={href({ stat: c.key })}
                    title={c.title}
                    className={`hover:text-accent ${
                      c.key === stat ? "font-bold text-ink" : ""
                    }`}
                  >
                    {c.label}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={`${r.id}-${r.position}-${i}`}
                className="border-b border-grid text-ink-2 last:border-b-0 hover:bg-surface-2"
              >
                <td className="px-2 py-1.5 text-right tabular-nums text-ink-3">
                  {r.rank ?? i + 1}
                </td>
                <td className="px-2 py-1.5">
                  <PlayerLink id={r.id}>{r.name}</PlayerLink>
                </td>
                <td className="px-2 py-1.5 text-ink-3">{r.position || "—"}</td>
                <td className="px-2 py-1.5">
                  <TeamLink id={r.teamId} name={r.team} logo={false} />
                </td>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-2 py-1.5 text-center tabular-nums ${
                      c.key === stat ? "font-bold text-ink" : ""
                    }`}
                  >
                    {teamStatText(r.values[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] tracking-[0.15em] text-ink-3">
        {rows.length} OF {total}
        {group === "fielding"
          ? " — EVERY FIELDER, BY POSITION"
          : " QUALIFIED PLAYERS"}
      </p>
      <Glossary columns={columns} />
    </div>
  );
}

async function MinorsBody({
  view,
  level,
  season,
  group,
  stat,
  href,
}: {
  view: View;
  level: MinorLevel;
  season: number;
  group: StatGroup;
  stat: string;
  href: (over: Record<string, string>) => string;
}) {
  try {
    switch (view) {
      case "standings": {
        const divisions = await getMinorStandings(level.sportId, season);
        if (divisions.length === 0) return <Empty what="STANDINGS" />;
        return (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {divisions.map((d) => (
              /* Nobody's club is being read here, so no row is picked out. */
              <DivisionTable key={d.id} division={d} teamId={-1} />
            ))}
          </div>
        );
      }
      case "teams": {
        const tables = await getTeamStats(season, "R", level.sportId);
        return tables.every((t) => t.rows.length === 0) ? (
          <Empty what="TEAM STATS" />
        ) : (
          <TeamStats tables={tables} season={season} />
        );
      }
      case "players": {
        const board = await getMinorPlayers({
          sportId: level.sportId,
          season,
          group,
          stat,
        });
        return (
          <PlayerBoard
            rows={board.rows}
            total={board.total}
            group={group}
            stat={stat}
            href={href}
          />
        );
      }
    }
  } catch {
    return <Unavailable />;
  }
}

export default async function MinorsPage({
  searchParams,
}: {
  searchParams: Promise<{
    level?: string;
    season?: string;
    view?: string;
    group?: string;
    stat?: string;
  }>;
}) {
  const sp = await searchParams;
  const current = seasonOf(todayPT());
  const level = pickLevel(sp.level);
  const season = pickSeason(sp.season, current);
  const view = pickView(sp.view);
  const group = pickGroup(sp.group);
  const stat = pickMinorStat(sp.stat, group);

  /* The whole query, with one thing changed — what a sortable column heading
     navigates to without dropping the level, season or group it was read in. */
  const href = (over: Record<string, string>) =>
    `/minors?${new URLSearchParams({
      level: level.value,
      season: String(season),
      view,
      group,
      stat,
      ...over,
    })}`;

  return (
    <div className="mx-auto max-w-[88rem] space-y-3 p-3">
      <Panel
        title={titleCase(`MINOR LEAGUES — ${level.label}`)}
        right={
          <div className="flex flex-wrap items-center gap-3">
            <ParamSelect
              param="level"
              label="LEVEL"
              value={level.value}
              options={MINOR_LEVELS}
            />
            <SeasonSelect
              value={season}
              first={MINORS_FIRST_SEASON}
              last={current}
            />
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <ParamTabs
            param="view"
            ariaLabel="Minor league view"
            size="lg"
            value={view}
            options={VIEWS.map((v) => ({ ...v }))}
          />
          {view === "players" && (
            <ParamTabs
              param="group"
              ariaLabel="Stat group"
              value={group}
              options={GROUPS}
            />
          )}
        </div>
        {/* Keyed on what is being shown, so a new level or season re-suspends
            into the skeleton rather than holding the last board on screen. */}
        <Suspense
          key={`${view}-${level.value}-${season}-${group}-${stat}`}
          fallback={<SectionSkeleton section={view === "players" ? "players" : view} />}
        >
          <MinorsBody
            view={view}
            level={level}
            season={season}
            group={group}
            stat={stat}
            href={href}
          />
        </Suspense>
      </Panel>
    </div>
  );
}

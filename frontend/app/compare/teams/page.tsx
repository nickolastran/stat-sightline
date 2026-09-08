import type { Metadata } from "next";
import Link from "next/link";
import ParamTabs from "@/components/mlb/ParamTabs";
import SeasonSelect from "@/components/mlb/SeasonSelect";
import ComparePicker from "@/components/mlb/ComparePicker";
import {
  CompareHeadline,
  CompareTable,
  type CompareEntity,
} from "@/components/mlb/ComparePanels";
import {
  FIRST_SEASON,
  TEAM_CARD_STATS,
  TEAM_HITTING_COLS,
  TEAM_PITCHING_COLS,
  getTeamStats,
  seasonOf,
  teamHref,
  teamLogo,
  todayPT,
  type TeamStatValue,
} from "@/lib/mlb";

/*
 * Up to four clubs, one season at a time — there's no "career" for a
 * franchise the way there is for a player, so this skips the compare page's
 * scope toggle entirely. Everything else is the same shape: a headline of
 * the same four figures the team page's own stat card leads with, then the
 * full hitting or pitching table with a column picker.
 */

export const metadata: Metadata = { title: "COMPARE TEAMS — STAT//SIGHTLINE" };

const MAX = 4;

function parseIds(raw: string | undefined): number[] {
  const ids = (raw ?? "")
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(ids)].slice(0, MAX);
}

function pickSeason(raw: string | undefined, current: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= FIRST_SEASON && n <= current ? n : current;
}

export default async function CompareTeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; group?: string; season?: string; stats?: string }>;
}) {
  const sp = await searchParams;
  const current = seasonOf(todayPT());
  const season = pickSeason(sp.season, current);
  const ids = parseIds(sp.ids);
  const group = sp.group === "pitching" ? "pitching" : "hitting";

  const tables = await getTeamStats(season).catch(() => []);
  const rows = tables.find((t) => t.group === group)?.rows ?? [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const found = ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);

  const entities: CompareEntity[] = found.map((r) => ({
    id: r.id,
    name: r.name,
    image: teamLogo(r.id),
    href: teamHref(r.id, r.name),
  }));
  const values: Record<number, Record<string, TeamStatValue>> = {};
  found.forEach((r) => (values[r.id] = r.values));
  const selectedStats = sp.stats ? sp.stats.split(",").filter(Boolean) : [];
  const columns = group === "hitting" ? TEAM_HITTING_COLS : TEAM_PITCHING_COLS;

  return (
    <div className="mx-auto max-w-[96rem] space-y-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-base font-bold tracking-wider text-ink">COMPARE TEAMS</h1>
        <Link href="/compare" className="text-[10px] tracking-[0.2em] text-ink-3 hover:text-accent">
          ← COMPARE PLAYERS
        </Link>
      </div>

      <ComparePicker kind="team" slots={entities} max={MAX} />

      {found.length === 0 ? (
        <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
          ADD UP TO {MAX} TEAMS TO COMPARE
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 border border-line bg-surface px-3 py-2">
            <ParamTabs
              param="group"
              ariaLabel="Stat group"
              value={group}
              options={[
                { value: "hitting", label: "BATTING" },
                { value: "pitching", label: "PITCHING" },
              ]}
            />
            <span className="ml-auto">
              <SeasonSelect value={season} first={FIRST_SEASON} last={current} />
            </span>
          </div>

          <CompareHeadline entities={entities} stats={TEAM_CARD_STATS[group]} values={values} />
          <CompareTable
            columns={columns}
            selected={selectedStats}
            entities={entities}
            values={values}
          />
        </>
      )}
    </div>
  );
}

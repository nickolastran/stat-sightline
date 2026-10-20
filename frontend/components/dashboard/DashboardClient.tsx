"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Pitch, PitcherPitches, Role } from "@/lib/api";
import {
  applyFilters,
  DEFAULT_FILTERS,
  filtersFromQuery,
  filtersToQuery,
  type FilterState,
} from "@/lib/filters";
import { arsenalRows, fmt, mirrorLefties, summarize } from "@/lib/metrics";
import { PITCH_SLOTS, slotFor } from "@/lib/pitchColors";
import ArsenalTable from "./ArsenalTable";
import DataTable, { type Column } from "@/components/ui/DataTable";
import MetricCard from "@/components/ui/MetricCard";
import SegmentedControl from "@/components/ui/SegmentedControl";
import PlayerSearch from "@/components/landing/PlayerSearch";
import FilterPanel, { type PitchTypeOption } from "./FilterPanel";
import MovementPlot from "./MovementPlot";
import Sidebar from "./Sidebar";
import ZonePlot, { type ZonePlotMode } from "./ZonePlot";
import SprayChart from "@/components/mlb/SprayChart";
import SwingTakePanel from "@/components/mlb/SwingTakePanel";
import BatTrackingPanel from "@/components/mlb/BatTrackingPanel";
import { BAT_TRACKING_FIRST_SEASON, type BatLine } from "@/lib/batTracking";
import { pitchHits, type Park } from "@/lib/spray";

/*
 * State owner for the dashboard — the PITCHING module (pitches thrown) and
 * the HITTING module (pitches seen) alike, since both read the same pitch
 * rows. The full pitch payload arrives from the server component once per
 * player; every filter change re-slices it in
 * memory (useMemo chain below), so cards, plot, and tables update
 * instantly and always agree on the same slice.
 *
 * The slice lives in the URL too (lib/filters), so it's a link and survives
 * a refresh. Written with history.replaceState rather than the router: the
 * router would re-render the page on the server and refetch the whole
 * payload on every click, for parameters only this component reads.
 *
 * HITTING leads with a hitter's own rates and swaps the movement chart —
 * a pitcher's read — for where the slice's hits went, then the player page's
 * swing-decision and bat-tracking panels over the same slice.
 */

/** What the Hitting module needs beyond the pitches: the season's
 *  bat-tracking line and league line, and the hitter's home park. */
export interface Hitting {
  season: number;
  bat: { player: BatLine; league: BatLine } | null;
  park: Park | null;
}

const NAMED_TYPES: ReadonlySet<string> = new Set(Object.keys(PITCH_SLOTS));

function Card({
  title,
  controls,
  children,
}: {
  title: string;
  controls?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h2 className="text-[10px] tracking-[0.25em] text-ink-3">{title}</h2>
        {controls}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

export default function DashboardClient({
  role,
  data,
  hitting,
}: {
  role: Role;
  data: PitcherPitches;
  hitting?: Hitting;
}) {
  const p = data.pitcher;
  const bbe = role === "pitcher" ? "VS. BATTED BALLS" : "ON BATTED BALLS";
  const params = useSearchParams();
  const [filters, setFilters] = useState<FilterState>(() => filtersFromQuery(params));
  const [mode, setMode] = useState<ZonePlotMode>(() => {
    const plot = params.get("plot");
    return plot === "heat" || plot === "zones" ? plot : "scatter";
  });

  useEffect(() => {
    const q = filtersToQuery(filters);
    if (mode !== "scatter") q.set("plot", mode);
    const url = q.size ? `?${q}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [filters, mode]);

  const patch = (p: Partial<FilterState>) =>
    setFilters((f) => ({ ...f, ...p }));

  const filtered = useMemo(
    () => applyFilters(data.pitches, filters, NAMED_TYPES),
    [data.pitches, filters]
  );
  const summary = useMemo(() => summarize(filtered), [filtered]);
  /* Movement as a hitter sees it, both hands at once: lefties mirrored, so
     the chart and the table's H-BRK read every pitch as a righty's. */
  const moved = useMemo(
    () => (role === "batter" ? mirrorLefties(filtered) : filtered),
    [filtered, role]
  );
  const arsenal = useMemo(() => arsenalRows(moved, NAMED_TYPES), [moved]);
  const sprayHits = useMemo(() => pitchHits(filtered), [filtered]);

  /* Filter options + date bounds come from the FULL payload, so a filter
     never removes its own controls. */
  const pitchTypeOptions = useMemo<PitchTypeOption[]>(() => {
    const groups = new Map<string, { name: string; count: number }>();
    for (const p of data.pitches) {
      const code =
        p.pitch_type && NAMED_TYPES.has(p.pitch_type) ? p.pitch_type : "OTH";
      const g = groups.get(code) ?? {
        name: code === "OTH" ? "Other" : p.pitch_name ?? code,
        count: 0,
      };
      g.count += 1;
      groups.set(code, g);
    }
    return [...groups.entries()]
      .map(([code, g]) => ({ code, ...g }))
      .sort((a, b) => b.count - a.count);
  }, [data.pitches]);

  const dateExtent = useMemo(() => {
    const dates = data.pitches
      .map((p) => p.game_date)
      .filter((d): d is string => d !== null);
    if (dates.length === 0) return null;
    return {
      min: dates.reduce((a, b) => (a < b ? a : b)),
      max: dates.reduce((a, b) => (a > b ? a : b)),
    };
  }, [data.pitches]);

  const logColumns: Column<Pitch>[] = [
    { key: "game_date", label: "DATE", sortValue: (r) => r.game_date, render: (r) => r.game_date ?? "—" },
    {
      key: "pitch_type",
      label: "PT",
      sortValue: (r) => r.pitch_type,
      render: (r) => (
        <span className="flex items-center gap-1.5 font-bold text-ink">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5"
            style={{ background: slotFor(r.pitch_type).color }}
          />
          {r.pitch_type ?? "—"}
        </span>
      ),
    },
    { key: "release_speed", label: "MPH", align: "right", sortValue: (r) => r.release_speed, render: (r) => fmt.num(r.release_speed) },
    { key: "release_spin_rate", label: "SPIN", align: "right", sortValue: (r) => r.release_spin_rate, render: (r) => fmt.int(r.release_spin_rate) },
    {
      key: "count",
      label: "B-S",
      align: "right",
      sortValue: (r) =>
        r.balls !== null && r.strikes !== null ? r.balls * 10 + r.strikes : null,
      render: (r) =>
        r.balls !== null && r.strikes !== null ? `${r.balls}-${r.strikes}` : "—",
    },
    { key: "inning", label: "INN", align: "right", sortValue: (r) => r.inning, render: (r) => r.inning ?? "—" },
    {
      key: "description",
      label: "RESULT",
      sortValue: (r) => r.description,
      render: (r) => (r.description ?? "—").replaceAll("_", " ").toUpperCase(),
    },
    { key: "launch_speed", label: "EV", align: "right", sortValue: (r) => r.launch_speed, render: (r) => fmt.num(r.launch_speed) },
    { key: "launch_angle", label: "LA", align: "right", sortValue: (r) => r.launch_angle, render: (r) => fmt.num(r.launch_angle, 0) },
  ];

  return (
    <div className="flex min-h-[calc(100vh-3rem)] flex-col lg:flex-row">
      {/* ── SIDEBAR: nav + the single filter scope ─────────────── */}
      <aside className="shrink-0 border-b border-line bg-surface lg:sticky lg:top-12 lg:h-[calc(100vh-3rem)] lg:w-64 lg:overflow-y-auto lg:border-r lg:border-b-0">
        <Sidebar
          active={role === "pitcher" ? "P-01" : "H-01"}
          pitcher={role === "pitcher" ? p.player_id : undefined}
          batter={role === "batter" ? p.player_id : undefined}
        />
        <FilterPanel
          role={role}
          filters={filters}
          onChange={patch}
          onReset={() => setFilters(DEFAULT_FILTERS)}
          pitchTypeOptions={pitchTypeOptions}
          dateExtent={dateExtent}
          sliceCount={filtered.length}
          totalCount={data.pitches.length}
        />
      </aside>

      {/* ── MAIN ───────────────────────────────────────────────── */}
      <main className="min-w-0 flex-1 space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border border-line bg-surface px-3 py-2">
          <div className="flex items-baseline gap-3">
            <h1 className="text-base font-bold tracking-wide">
              {p.full_name ?? `${role.toUpperCase()} #${p.player_id}`}
            </h1>
            <span className="text-[11px] text-ink-3">
              {role === "pitcher"
                ? `${p.throws ?? "?"}HP · ${data.count.toLocaleString()} TRACKED PITCHES`
                : `BATS ${p.bats ?? "?"} · ${data.count.toLocaleString()} PITCHES SEEN`}
              {dateExtent && ` · ${dateExtent.min} → ${dateExtent.max}`}
            </span>
          </div>
          <div className="w-full sm:w-72">
            <PlayerSearch
              role={role}
              size="compact"
              placeholder={`SWITCH ${role.toUpperCase()}`}
            />
          </div>
        </div>

        {/* Key metrics — all computed from the filtered slice. */}
        {role === "batter" ? (
          <div className="grid grid-cols-2 gap-px sm:grid-cols-3 xl:grid-cols-6">
            <MetricCard label="xwOBA" value={fmt.rate(summary.xwoba)} sub={`${summary.pitches.toLocaleString()} PITCHES SEEN`} />
            <MetricCard label="CHASE RATE" value={fmt.pct(summary.chaseRate)} sub="SWINGS / OUT-OF-ZONE" />
            <MetricCard label="Z-CONTACT" value={fmt.pct(summary.zContactRate)} sub="CONTACT / IN-ZONE SWINGS" />
            <MetricCard label="BARREL RATE" value={fmt.pct(summary.barrelRate)} sub="BARRELS / BATTED BALLS" />
            <MetricCard label="HARD-HIT RATE" value={fmt.pct(summary.hardHitRate)} sub="95+ MPH / BATTED BALLS" />
            <MetricCard label="AVG EXIT VELO" value={fmt.num(summary.avgExitVelo)} unit="MPH" sub={`LA ${fmt.num(summary.avgLaunchAngle)}° · ${bbe}`} />
          </div>
        ) : (
        <div className="grid grid-cols-2 gap-px sm:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="AVG VELO" value={fmt.num(summary.avgVelo)} unit="MPH" sub={`${summary.pitches.toLocaleString()} PITCHES`} />
          <MetricCard label="WHIFF RATE" value={fmt.pct(summary.whiffRate)} sub="WHIFFS / SWINGS" />
          <MetricCard label="CSW RATE" value={fmt.pct(summary.cswRate)} sub="CALLED + SWINGING STR" />
          <MetricCard label="ZONE RATE" value={fmt.pct(summary.zoneRate)} sub="IN-ZONE / LOCATED" />
          <MetricCard label="AVG EXIT VELO" value={fmt.num(summary.avgExitVelo)} unit="MPH" sub={bbe} />
          <MetricCard label="AVG LAUNCH ANG" value={fmt.num(summary.avgLaunchAngle)} unit="°" sub={bbe} />
        </div>
        )}

        <div className="grid gap-3 lg:grid-cols-2">
          <Card
            title="PITCH LOCATION"
            controls={
              <SegmentedControl<ZonePlotMode>
                ariaLabel="Plot mode"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "scatter", label: "SCATTER" },
                  { value: "heat", label: "DENSITY" },
                  { value: "zones", label: "HOT/COLD" },
                ]}
              />
            }
          >
            <ZonePlot pitches={filtered} mode={mode} />
          </Card>

          {role === "batter" ? (
            <SprayChart
              hits={sprayHits}
              park={hitting?.park ?? null}
              title={`Spray Chart — ${sprayHits.length} Hits in the Slice`}
            />
          ) : (
            <Card title="PITCH MOVEMENT">
              <MovementPlot pitches={filtered} arsenal={arsenal} />
            </Card>
          )}
        </div>

        {role === "batter" && (
          <div className="grid gap-3 xl:grid-cols-2">
            <Card title="SWING DECISIONS — BY ATTACK ZONE">
              <SwingTakePanel pitches={filtered} />
            </Card>
            <Card title={`BAT TRACKING — ${hitting?.season ?? ""} LINE, SWINGS IN THE SLICE`}>
              {hitting?.bat ? (
                <BatTrackingPanel pitches={filtered} line={hitting.bat} />
              ) : (
                <p className="text-xs text-ink-3">
                  {(hitting?.season ?? 0) < BAT_TRACKING_FIRST_SEASON
                    ? `BAT TRACKING BEGINS IN ${BAT_TRACKING_FIRST_SEASON}`
                    : "NO BAT TRACKING LINE FOR THIS HITTER"}
                </p>
              )}
            </Card>
            <Card title="PITCH MOVEMENT — PITCHES SEEN">
              <MovementPlot pitches={moved} arsenal={arsenal} mirrored />
            </Card>
          </div>
        )}

        <Card
          title={role === "pitcher" ? "ARSENAL — BY PITCH TYPE" : "PITCHES SEEN — BY TYPE"}
        >
          <ArsenalTable rows={arsenal} />
        </Card>

        <Card title="PITCH LOG — TABLE VIEW OF THE SLICE">
          <DataTable
            columns={logColumns}
            rows={filtered}
            rowKey={(_, i) => i}
            defaultSort={{ key: "game_date", dir: "desc" }}
            pageSize={100}
            maxHeight="30rem"
          />
        </Card>
      </main>
    </div>
  );
}

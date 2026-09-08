"use client";

import { useMemo, useState } from "react";
import type { Pitch, PitcherPitches } from "@/lib/api";
import {
  applyFilters,
  DEFAULT_FILTERS,
  type FilterState,
} from "@/lib/filters";
import { arsenalRows, fmt, summarize, type ArsenalRow } from "@/lib/metrics";
import { PITCH_SLOTS, slotFor } from "@/lib/pitchColors";
import DataTable, { type Column } from "@/components/ui/DataTable";
import MetricCard from "@/components/ui/MetricCard";
import SegmentedControl from "@/components/ui/SegmentedControl";
import PlayerSearch from "@/components/landing/PlayerSearch";
import FilterPanel, { type PitchTypeOption } from "./FilterPanel";
import Sidebar from "./Sidebar";
import ZonePlot, { type ZonePlotMode } from "./ZonePlot";

/*
 * State owner for the dashboard. The full pitch payload arrives from the
 * server component once per player; every filter change re-slices it in
 * memory (useMemo chain below), so cards, plot, and tables update
 * instantly and always agree on the same slice.
 */

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

export default function DashboardClient({ data }: { data: PitcherPitches }) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [mode, setMode] = useState<ZonePlotMode>("scatter");

  const patch = (p: Partial<FilterState>) =>
    setFilters((f) => ({ ...f, ...p }));

  const filtered = useMemo(
    () => applyFilters(data.pitches, filters, NAMED_TYPES),
    [data.pitches, filters]
  );
  const summary = useMemo(() => summarize(filtered), [filtered]);
  const arsenal = useMemo(
    () => arsenalRows(filtered, NAMED_TYPES),
    [filtered]
  );

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

  const arsenalColumns: Column<ArsenalRow>[] = [
    {
      key: "code",
      label: "PT",
      sortValue: (r) => r.code,
      render: (r) => (
        <span className="flex items-center gap-1.5 font-bold text-ink">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5"
            style={{
              background: (r.code === "OTH" ? slotFor(null) : PITCH_SLOTS[r.code]).color,
            }}
          />
          {r.code}
        </span>
      ),
    },
    { key: "name", label: "PITCH", sortValue: (r) => r.name, render: (r) => r.name },
    { key: "n", label: "N", align: "right", sortValue: (r) => r.n, render: (r) => r.n.toLocaleString() },
    { key: "usage", label: "USE%", align: "right", sortValue: (r) => r.usage, render: (r) => fmt.pct(r.usage) },
    { key: "avgVelo", label: "VELO", align: "right", sortValue: (r) => r.avgVelo, render: (r) => fmt.num(r.avgVelo) },
    { key: "avgSpin", label: "SPIN", align: "right", sortValue: (r) => r.avgSpin, render: (r) => fmt.int(r.avgSpin) },
    { key: "whiffRate", label: "WHIFF%", align: "right", sortValue: (r) => r.whiffRate, render: (r) => fmt.pct(r.whiffRate) },
    { key: "zoneRate", label: "ZONE%", align: "right", sortValue: (r) => r.zoneRate, render: (r) => fmt.pct(r.zoneRate) },
    { key: "chaseRate", label: "CHASE%", align: "right", sortValue: (r) => r.chaseRate, render: (r) => fmt.pct(r.chaseRate) },
    { key: "avgExitVelo", label: "EV", align: "right", sortValue: (r) => r.avgExitVelo, render: (r) => fmt.num(r.avgExitVelo) },
    { key: "hardHitRate", label: "HH%", align: "right", sortValue: (r) => r.hardHitRate, render: (r) => fmt.pct(r.hardHitRate) },
  ];

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
        <Sidebar />
        <FilterPanel
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
              {data.pitcher.full_name ?? `PITCHER #${data.pitcher.player_id}`}
            </h1>
            <span className="text-[11px] text-ink-3">
              {data.pitcher.throws ?? "?"}HP · {data.count.toLocaleString()}{" "}
              TRACKED PITCHES
              {dateExtent && ` · ${dateExtent.min} → ${dateExtent.max}`}
            </span>
          </div>
          <div className="w-full sm:w-72">
            <PlayerSearch size="compact" placeholder="SWITCH PITCHER" />
          </div>
        </div>

        {/* Key metrics — all computed from the filtered slice. */}
        <div className="grid grid-cols-2 gap-px sm:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="AVG VELO" value={fmt.num(summary.avgVelo)} unit="MPH" sub={`${summary.pitches.toLocaleString()} PITCHES`} />
          <MetricCard label="WHIFF RATE" value={fmt.pct(summary.whiffRate)} sub="WHIFFS / SWINGS" />
          <MetricCard label="CSW RATE" value={fmt.pct(summary.cswRate)} sub="CALLED + SWINGING STR" />
          <MetricCard label="ZONE RATE" value={fmt.pct(summary.zoneRate)} sub="IN-ZONE / LOCATED" />
          <MetricCard label="AVG EXIT VELO" value={fmt.num(summary.avgExitVelo)} unit="MPH" sub="VS. BATTED BALLS" />
          <MetricCard label="AVG LAUNCH ANG" value={fmt.num(summary.avgLaunchAngle)} unit="°" sub="VS. BATTED BALLS" />
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(400px,480px)_1fr]">
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

          <Card title="ARSENAL — BY PITCH TYPE">
            <DataTable
              columns={arsenalColumns}
              rows={arsenal}
              rowKey={(r) => r.code}
              defaultSort={{ key: "n", dir: "desc" }}
              maxHeight="34rem"
            />
          </Card>
        </div>

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

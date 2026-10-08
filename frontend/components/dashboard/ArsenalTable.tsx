"use client";

import { fmt, type ArsenalRow } from "@/lib/metrics";
import { PITCH_SLOTS, slotFor } from "@/lib/pitchColors";
import DataTable, { type Column } from "@/components/ui/DataTable";

/* One row per pitch type — the pitcher dashboard's and the player Statcast
   tab's, and the table twin of the movement chart. */

const COLUMNS: Column<ArsenalRow>[] = [
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
  { key: "avgHBreak", label: "H-BRK", align: "right", sortValue: (r) => r.avgHBreak, render: (r) => fmt.num(r.avgHBreak) },
  { key: "avgVBreak", label: "IVB", align: "right", sortValue: (r) => r.avgVBreak, render: (r) => fmt.num(r.avgVBreak) },
  { key: "whiffRate", label: "WHIFF%", align: "right", sortValue: (r) => r.whiffRate, render: (r) => fmt.pct(r.whiffRate) },
  { key: "zoneRate", label: "ZONE%", align: "right", sortValue: (r) => r.zoneRate, render: (r) => fmt.pct(r.zoneRate) },
  { key: "chaseRate", label: "CHASE%", align: "right", sortValue: (r) => r.chaseRate, render: (r) => fmt.pct(r.chaseRate) },
  { key: "avgExitVelo", label: "EV", align: "right", sortValue: (r) => r.avgExitVelo, render: (r) => fmt.num(r.avgExitVelo) },
  { key: "hardHitRate", label: "HH%", align: "right", sortValue: (r) => r.hardHitRate, render: (r) => fmt.pct(r.hardHitRate) },
];

export default function ArsenalTable({ rows }: { rows: ArsenalRow[] }) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.code}
      defaultSort={{ key: "n", dir: "desc" }}
      maxHeight="34rem"
    />
  );
}

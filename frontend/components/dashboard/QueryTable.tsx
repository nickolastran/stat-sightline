"use client";

import Link from "next/link";
import type { Role } from "@/lib/api";
import type { QueryRow } from "@/lib/customQuery";
import { fmt } from "@/lib/metrics";
import DataTable, { type Column } from "@/components/ui/DataTable";

/*
 * The Custom Queries board: sortable on any column, ranked as it arrived
 * (best first), each player linking into his own module on the same slice.
 * The CSV is written from the rows already here — they're the whole board,
 * so a download needs no second trip to Savant.
 */

const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;

export default function QueryTable({
  rows,
  role,
  stat,
  sampleLabel,
  slice,
  filename,
}: {
  rows: QueryRow[];
  role: Role;
  stat: { label: string; kind: "rate" | "pct" | "num" };
  sampleLabel: string;
  /** The dashboard filters as a query string, carried into each player link. */
  slice: string;
  filename: string;
}) {
  const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }));
  const columns: Column<(typeof ranked)[number]>[] = [
    { key: "rank", label: "RK", align: "right", width: "3.5rem", sortValue: (r) => r.rank, render: (r) => r.rank },
    {
      key: "name",
      label: role === "pitcher" ? "PITCHER" : "HITTER",
      sortValue: (r) => r.name,
      render: (r) => (
        <Link href={`/${role === "pitcher" ? "pitcher" : "hitter"}/${r.id}${slice ? `?${slice}` : ""}`} className="font-bold text-ink hover:text-accent">
          {r.name}
        </Link>
      ),
    },
    { key: "value", label: stat.label, align: "right", sortValue: (r) => r.value, render: (r) => <span className="font-bold text-ink">{fmt[stat.kind](r.value)}</span> },
    { key: "n", label: sampleLabel, align: "right", sortValue: (r) => r.n, render: (r) => r.n.toLocaleString() },
    { key: "pitches", label: "PITCHES", align: "right", sortValue: (r) => r.pitches, render: (r) => r.pitches.toLocaleString() },
  ];

  const download = () => {
    const lines = [
      ["rank", "player_id", "player", stat.label, sampleLabel, "pitches"].map(quote).join(","),
      ...ranked.map((r) =>
        [r.rank, r.id, quote(r.name), r.value === null ? "" : +r.value.toFixed(4), r.n, r.pitches].join(","),
      ),
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n") + "\n"], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={download}
          disabled={rows.length === 0}
          className="border border-line px-2 py-0.5 text-[10px] tracking-[0.2em] text-ink-3 hover:border-accent hover:text-ink disabled:opacity-50"
        >
          DOWNLOAD CSV
        </button>
      </div>
      <DataTable
        columns={columns}
        rows={ranked}
        rowKey={(r) => r.id}
        defaultSort={{ key: "rank", dir: "asc" }}
        pageSize={100}
        maxHeight="40rem"
        emptyLabel="NOBODY CLEARS THE FLOOR ON THIS SLICE"
      />
    </div>
  );
}

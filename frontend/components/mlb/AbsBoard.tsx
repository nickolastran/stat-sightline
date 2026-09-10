"use client";

import { useMemo } from "react";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Glossary from "@/components/mlb/Glossary";
import TeamLink from "@/components/mlb/TeamLink";
import PlayerLink from "@/components/mlb/PlayerLink";
import { isTeamBoard, type AbsRow, type AbsType } from "@/lib/abs";

/*
 * One ABS challenge board — a club or a player per row, its challenges, and
 * how many of them beat what an average challenger would have got out of the
 * same calls.
 *
 * The two "vs expected" columns are shaded rather than just signed: they are
 * the point of the table, and a column of ±numbers all reads the same at a
 * glance. Everything else is plain, so the shading means one thing.
 */

/* Red over the league average, blue under — scaled against the biggest
   swing on the board, so the strongest cell is always fully saturated
   whether the season is a week or a year old. */
function heat(value: number, max: number): React.CSSProperties | undefined {
  if (!value || !max) return undefined;
  const alpha = (Math.min(Math.abs(value) / max, 1) * 0.55).toFixed(2);
  const rgb = value > 0 ? "198, 45, 45" : "38, 104, 201";
  return { backgroundColor: `rgba(${rgb}, ${alpha})` };
}

const pct = (v: number | null, digits = 0) =>
  v === null ? "—" : `${(v * 100).toFixed(digits)}%`;

/** A signed figure, so a column of them reads as a difference, not a total. */
const signed = (v: number, digits = 1) =>
  `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;

const GLOSSARY = [
  { label: "NET", title: "Overturns above the number an average challenger wins on the same calls" },
  { label: "RUNS", title: "Run value gained by those challenges, above expected" },
  { label: "CHAL", title: "Challenges used" },
  { label: "WON", title: "Challenges that overturned the call" },
  { label: "LOST", title: "Challenges that confirmed the call" },
  { label: "WON%", title: "Share of challenges overturned" },
  { label: "+K", title: "Strikeouts gained by an overturn" },
  { label: "−BB", title: "Walks erased by an overturn" },
  { label: "RATE", title: "Challenges per challengeable take" },
  { label: "xRATE", title: "Challenge rate an average challenger would have run in the same spots" },
  { label: "±RATE", title: "Challenge rate above or below that expectation" },
  { label: "OPP", title: "Takes worth challenging — the call went against the taking side" },
  { label: "RSN", title: "Those opportunities that were actually challenged" },
  { label: "%RSN", title: "Share of challenges that were worth making" },
  { label: "%OPP", title: "Share of worthwhile opportunities taken" },
];

export default function AbsBoard({
  rows,
  type,
}: {
  rows: AbsRow[];
  type: AbsType;
}) {
  const teams = isTeamBoard(type);

  const columns = useMemo<Column<AbsRow>[]>(() => {
    const maxOvr = Math.max(1, ...rows.map((r) => Math.abs(r.netOvr)));
    const maxRuns = Math.max(1, ...rows.map((r) => Math.abs(r.netRuns)));

    /** A right-aligned stat column — the shape all but the first two are. */
    const stat = (
      key: string,
      label: string,
      value: (r: AbsRow) => number | null,
      text: (r: AbsRow) => string,
    ): Column<AbsRow> => ({
      key,
      label,
      align: "right",
      sortValue: value,
      render: (r) => text(r),
    });

    return [
      {
        key: "name",
        label: teams ? "TEAM" : "PLAYER",
        sortValue: (r) => r.name,
        render: (r) =>
          teams ? (
            <TeamLink id={r.id} name={r.name} />
          ) : (
            <PlayerLink id={r.id}>{r.name}</PlayerLink>
          ),
      },
      ...(teams
        ? []
        : [
            {
              key: "team",
              label: "TM",
              sortValue: (r: AbsRow) => r.teamAbbr,
              render: (r: AbsRow) =>
                r.teamId ? (
                  <TeamLink
                    id={r.teamId}
                    name={r.teamAbbr ?? ""}
                    text={r.teamAbbr ?? "—"}
                  />
                ) : (
                  "—"
                ),
            } as Column<AbsRow>,
          ]),
      {
        key: "netOvr",
        label: "NET",
        align: "right",
        sortValue: (r) => r.netOvr,
        render: (r) => (
          /* Shading is on the cell, so it has to be painted from inside it. */
          <span
            className="-mx-3 -my-1.5 block px-3 py-1.5 font-bold text-ink"
            style={heat(r.netOvr, maxOvr)}
          >
            {signed(r.netOvr)}
          </span>
        ),
      },
      {
        key: "netRuns",
        label: "RUNS",
        align: "right",
        sortValue: (r) => r.netRuns,
        render: (r) => (
          <span
            className="-mx-3 -my-1.5 block px-3 py-1.5 font-bold text-ink"
            style={heat(r.netRuns, maxRuns)}
          >
            {signed(r.netRuns)}
          </span>
        ),
      },
      stat("chal", "CHAL", (r) => r.chal, (r) => String(r.chal)),
      stat("won", "WON", (r) => r.won, (r) => String(r.won)),
      stat("lost", "LOST", (r) => r.lost, (r) => String(r.lost)),
      stat("wonPct", "WON%", (r) => r.wonPct, (r) => pct(r.wonPct)),
      stat("kFlip", "+K", (r) => r.kFlip, (r) => String(r.kFlip)),
      stat("bbFlip", "−BB", (r) => r.bbFlip, (r) => String(r.bbFlip)),
      stat("rate", "RATE", (r) => r.rate, (r) => pct(r.rate, 1)),
      stat("xRate", "xRATE", (r) => r.xRate, (r) => pct(r.xRate, 1)),
      stat(
        "rateDiff",
        "±RATE",
        (r) => r.rateDiff,
        (r) => (r.rateDiff === null ? "—" : signed(r.rateDiff * 100)),
      ),
      stat("rsnOpp", "OPP", (r) => r.rsnOpp, (r) => String(r.rsnOpp)),
      stat("rsnChal", "RSN", (r) => r.rsnChal, (r) => String(r.rsnChal)),
      stat("pctRsn", "%RSN", (r) => r.pctRsn, (r) => pct(r.pctRsn)),
      stat("pctTaken", "%OPP", (r) => r.pctTaken, (r) => pct(r.pctTaken)),
    ];
  }, [rows, teams]);

  return (
    <div className="space-y-3">
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        defaultSort={{ key: "netOvr", dir: "desc" }}
        pageSize={teams ? 30 : 50}
        maxHeight="none"
        emptyLabel="NO ABS CHALLENGES ON THIS BOARD"
      />
      <Glossary entries={GLOSSARY} />
    </div>
  );
}

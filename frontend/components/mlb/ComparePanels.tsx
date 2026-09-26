"use client";

import { useState } from "react";
import Link from "next/link";
import Panel from "@/components/ui/Panel";
import { Table, Row, Empty } from "@/components/ui/StatTable";
import { useSetParam } from "@/lib/useSetParam";
import {
  teamStatNum,
  teamStatText,
  type TeamStatCol,
  type TeamStatValue,
} from "@/lib/mlb";

/*
 * The two views the compare page stacks: a handful of headline figures read
 * across every entity at once, and a full table of whatever columns are
 * checked. Both take the same shape of data — one values record per entity —
 * so a player and a team compare page can render either with the same two
 * components instead of each inventing its own.
 */

export interface CompareEntity {
  id: number;
  name: string;
  image: string;
  href: string;
}

export interface HeadlineStat {
  key: string;
  label: string;
  /** True where a lower figure is the better one — ERA, losses, errors. */
  low?: boolean;
}

/** Identity photos across the top, then one row per headline stat with the
 *  better value picked out — the only place this page highlights a leader,
 *  since only a hand-picked list has a known direction to compare by. */
export function CompareHeadline({
  entities,
  stats,
  values,
}: {
  entities: CompareEntity[];
  stats: HeadlineStat[];
  values: Record<number, Record<string, TeamStatValue> | null>;
}) {
  /* Column order: a head-to-head pair reads either side of the labels, any
     other count lines the labels up down the left. `null` is the label. */
  const cols: (CompareEntity | null)[] =
    entities.length === 2 ? [entities[0], null, entities[1]] : [null, ...entities];
  const LINE = "border-r border-grid last:border-r-0";

  const head = cols.map((e) =>
    e ? (
      <div key={e.id} className="flex flex-col items-center gap-1.5 py-1 normal-case tracking-normal">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={e.image} alt="" width={40} height={40} className="h-10 w-10" />
        <Link href={e.href} className="max-w-[8rem] truncate text-ink hover:text-accent">
          {e.name}
        </Link>
      </div>
    ) : (
      ""
    )
  );

  return (
    <Table
      fit
      head={head}
      maxHeight="none"
      align={"c".repeat(cols.length)}
      widths={cols.map((e) => (e ? "10rem" : "7rem"))}
    >
      {stats.map((s) => {
        const nums = entities.map((e) => teamStatNum(values[e.id]?.[s.key] ?? null));
        const present = nums.filter((n): n is number => n !== null);
        const best =
          present.length > 1 ? (s.low ? Math.min(...present) : Math.max(...present)) : null;
        /* Everyone tying at the same figure carries no information worth a
           highlight — only a real split earns the mark. */
        const split = best !== null && present.some((n) => n !== best);

        return (
          <Row key={s.key}>
            {cols.map((e) => {
              if (!e)
                return (
                  <td
                    key="label"
                    className={`px-3 py-1.5 text-center text-[10px] tracking-[0.15em] whitespace-nowrap text-ink ${LINE}`}
                  >
                    {s.label}
                  </td>
                );
              const win = split && nums[entities.indexOf(e)] === best;
              return (
                <td
                  key={e.id}
                  className={`px-3 py-1.5 text-center tabular-nums ${LINE} ${
                    win ? "font-bold text-good" : "text-ink-2"
                  }`}
                >
                  {teamStatText(values[e.id]?.[s.key] ?? null)}
                </td>
              );
            })}
          </Row>
        );
      })}
    </Table>
  );
}

const CHECKBOX =
  "h-3.5 w-3.5 shrink-0 appearance-none border border-line bg-surface checked:border-accent checked:bg-accent";

/** The full stat table: one row per entity, columns narrowed to whichever
 *  keys `selected` names (every column of the group when empty). The picker
 *  writes `stats` back to the URL, same as the rest of the page's controls. */
export function CompareTable({
  columns,
  selected,
  entities,
  values,
}: {
  columns: TeamStatCol[];
  /** Column keys checked in the URL's `stats` param — every column when empty. */
  selected: string[];
  entities: CompareEntity[];
  values: Record<number, Record<string, TeamStatValue> | null>;
}) {
  const setParam = useSetParam();
  const [open, setOpen] = useState(false);
  /* Read off the result, not off `selected`: switching between the standard
     and advanced views carries a selection of keys the other set has none of,
     and a table of no columns at all is worse than the full one. */
  const picked = columns.filter((c) => selected.includes(c.key));
  const shown = picked.length ? picked : columns;

  const toggle = (key: string) => {
    const all = columns.map((c) => c.key);
    const current = selected.length ? selected : all;
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key];
    // Checking everything (or unchecking down to nothing) is the same as no filter.
    setParam({
      stats: next.length === all.length || next.length === 0 ? null : next.join(","),
    });
  };

  return (
    <Panel
      title="Stats"
      right={
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded border border-line px-1.5 py-0.5 text-[10px] tracking-wider text-ink-3 hover:border-accent hover:text-ink"
        >
          {open ? "HIDE COLUMNS" : "CHOOSE COLUMNS"}
        </button>
      }
    >
      {open && (
        <ul className="mb-3 grid grid-cols-2 gap-1.5 border-b border-line pb-3 sm:grid-cols-3 lg:grid-cols-4">
          {columns.map((c) => (
            <li key={c.key}>
              <label
                className="flex cursor-pointer items-center gap-2 text-[11px] text-ink-2 hover:text-ink"
                title={c.title}
              >
                <input
                  type="checkbox"
                  checked={shown.includes(c)}
                  onChange={() => toggle(c.key)}
                  className={CHECKBOX}
                />
                {c.label}
              </label>
            </li>
          ))}
        </ul>
      )}
      <EntityTable columns={shown} entities={entities} values={values} />
    </Panel>
  );
}

/** One row per entity under a fixed set of columns — the stats table's body,
 *  and on its own the value and sabermetric sections under it. */
function EntityTable({
  columns,
  entities,
  values,
  fit = false,
}: {
  fit?: boolean;
  columns: TeamStatCol[];
  entities: CompareEntity[];
  values: Record<number, Record<string, TeamStatValue> | null>;
}) {
  return (
    <Table
      fit={fit}
      head={["", ...columns.map((c) => c.label)]}
      maxHeight="none"
      align={"l" + "r".repeat(columns.length)}
      dense
    >
      {entities.length === 0 && <Empty what="ADD ENTITIES TO COMPARE" cols={columns.length + 1} />}
      {entities.map((e) => (
        <Row key={e.id}>
          <td className="border-r border-grid px-1 py-1 whitespace-nowrap">
            <Link href={e.href} className="flex items-center gap-1.5 text-ink hover:text-accent">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={e.image} alt="" width={18} height={18} className="h-[18px] w-[18px] shrink-0" />
              <span className="truncate">{e.name}</span>
            </Link>
          </td>
          {columns.map((c) => (
            <td
              key={c.key}
              title={c.title}
              className="border-r border-grid pl-0.5 pr-2 py-1 text-right text-[12px] tabular-nums text-ink-2 last:border-r-0"
            >
              {values[e.id] ? teamStatText(values[e.id]![c.key] ?? null) : "—"}
            </td>
          ))}
        </Row>
      ))}
    </Table>
  );
}

/** A titled table with no column picker — the fixed sections under the stats. */
export function CompareSection({
  title,
  columns,
  entities,
  values,
}: {
  title: string;
  columns: TeamStatCol[];
  entities: CompareEntity[];
  values: Record<number, Record<string, TeamStatValue> | null>;
}) {
  return (
    <Panel title={title}>
      <EntityTable fit columns={columns} entities={entities} values={values} />
    </Panel>
  );
}

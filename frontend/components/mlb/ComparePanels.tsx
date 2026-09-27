"use client";

import { Fragment, useState } from "react";
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
  /** Long form, for the tooltip in the stat dropdown. */
  title?: string;
  /** The dropdown's label, where its section already says the group. */
  name?: string;
  /** A labelled band the headline draws above this row — where awards start. */
  band?: string;
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
      <div key={e.id} className="flex flex-col items-center gap-2 py-2 normal-case tracking-normal">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={e.image} alt="" width={64} height={64} className="h-16 w-16" />
        <Link href={e.href} className="max-w-[12rem] truncate text-sm font-bold text-ink hover:text-accent">
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
      widths={cols.map((e) => (e ? "14rem" : "9rem"))}
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
          <Fragment key={s.key}>
            {s.band && (
              <tr className="border-y border-line bg-surface">
                <th
                  scope="colgroup"
                  colSpan={cols.length}
                  className="px-3 py-1.5 text-center text-[10px] tracking-widest text-ink"
                >
                  {s.band.toUpperCase()}
                </th>
              </tr>
            )}
            <Row>
              {cols.map((e) => {
                if (!e)
                  return (
                    <td
                      key="label"
                      className={`px-3 py-2 text-center text-[11px] tracking-[0.15em] whitespace-nowrap text-ink ${LINE}`}
                    >
                      {s.label}
                    </td>
                  );
                const win = split && nums[entities.indexOf(e)] === best;
                return (
                  <td
                    key={e.id}
                    className={`px-3 py-2 text-center text-sm tabular-nums ${LINE} ${
                      win ? "font-bold text-good" : "text-ink-2"
                    }`}
                  >
                    {teamStatText(values[e.id]?.[s.key] ?? null)}
                  </td>
                );
              })}
            </Row>
          </Fragment>
        );
      })}
    </Table>
  );
}

const CHECKBOX =
  "h-3.5 w-3.5 shrink-0 appearance-none border border-line bg-surface checked:border-accent checked:bg-accent";

/** The full stat table: one row per entity, every column of the group. */
export function CompareTable({
  columns,
  entities,
  values,
}: {
  columns: TeamStatCol[];
  entities: CompareEntity[];
  values: Record<number, Record<string, TeamStatValue> | null>;
}) {
  return (
    <Panel title="Stats">
      <EntityTable columns={columns} entities={entities} values={values} />
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
      /* A fitted table gets one even width per figure, so a short section
         reads as a tidy block rather than columns sized to their contents. */
      widths={fit ? ["10rem", ...columns.map(() => "3.75rem")] : undefined}
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

/** One titled block of the stat dropdown. */
export interface StatSection {
  title: string;
  stats: HeadlineStat[];
}

/** The headline's stat chooser: everything comparable, in sections, as one
 *  tall list. Ticks collect in a draft until UPDATE writes them to `h` in the
 *  URL — the main line when it is absent — so a handful of picks is one
 *  reload, not one each. The caller keys it on `selected` to resync. */
export function CompareStatPicker({
  sections,
  selected,
  defaults,
}: {
  sections: StatSection[];
  selected: string[];
  defaults: string[];
}) {
  const setParam = useSetParam();
  const write = (next: string[]) =>
    setParam({ h: next.length === 0 || next.join(",") === defaults.join(",") ? null : next.join(",") });
  const [draft, setDraft] = useState(selected);
  const toggle = (key: string) =>
    setDraft(draft.includes(key) ? draft.filter((k) => k !== key) : [...draft, key]);
  const dirty = draft.join(",") !== selected.join(",");

  return (
    <details className="group relative w-fit">
      <summary className="flex cursor-pointer list-none items-center gap-3 border border-line bg-surface px-3 py-2 text-xs tracking-wider text-ink hover:border-accent">
        STATS
        <span className="text-[10px] text-ink-3">{selected.length} SHOWN</span>
        <span className="text-ink-3 transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="absolute z-30 mt-px max-h-[70vh] w-80 overflow-y-auto border border-line bg-surface shadow-lg">
        {sections.map((sec) => (
          <section key={sec.title}>
            <h3 className="sticky top-0 border-y border-line bg-surface-2 px-3 py-1.5 text-[10px] font-bold tracking-widest text-ink">
              {sec.title.toUpperCase()}
            </h3>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 py-2">
              {sec.stats.map((st) => (
                <li key={st.key}>
                  <label
                    className="flex cursor-pointer items-center gap-2 text-[11px] text-ink-2 hover:text-ink"
                    title={st.title}
                  >
                    <input
                      type="checkbox"
                      checked={draft.includes(st.key)}
                      onChange={() => toggle(st.key)}
                      className={CHECKBOX}
                    />
                    {st.name ?? st.label}
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <div className="sticky bottom-0 flex border-t border-line bg-surface text-[10px] tracking-widest">
          <button
            type="button"
            onClick={() => setDraft(defaults)}
            className="flex-1 px-3 py-2 text-ink-3 hover:text-accent"
          >
            RESET TO MAIN STATS
          </button>
          <button
            type="button"
            disabled={!dirty}
            onClick={() => write(draft)}
            className="flex-1 border-l border-line bg-accent px-3 py-2 font-bold text-white disabled:bg-surface disabled:font-normal disabled:text-ink-3"
          >
            UPDATE
          </button>
        </div>
      </div>
    </details>
  );
}

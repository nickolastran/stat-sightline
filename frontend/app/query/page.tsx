import type { Metadata } from "next";
import Link from "next/link";
import QueryTable from "@/components/dashboard/QueryTable";
import Sidebar from "@/components/dashboard/Sidebar";
import Panel from "@/components/ui/Panel";
import {
  getQueryBoard,
  pickQuery,
  QUERY_PITCH_TYPES,
  QUERY_STATS,
  SAMPLE_LABEL,
} from "@/lib/customQuery";
import { filtersFromQuery, filtersToQuery, type FilterState } from "@/lib/filters";
import { seasonOf, todayPT } from "@/lib/mlb";
import { STATCAST_FIRST_SEASON } from "@/lib/statcast";

/*
 * CUSTOM QUERIES (Q-01): pick a stat, a pitch-level slice and a floor, and
 * get every pitcher or hitter in the league ranked on it (lib/customQuery).
 *
 * The controls are a plain GET form: submitting it is the URL, so a board is
 * a link and the page needs no client state of its own. The slice keeps the
 * dashboard's parameter names, which is what lets each row open that
 * player's module already filtered the same way.
 */

export const metadata: Metadata = {
  title: "Custom Queries",
  description: "Leaderboards over any pitch-level slice: stat, filters, minimum sample, CSV.",
};

const field =
  "w-full border border-line bg-surface px-2 py-1 text-[11px] text-ink-2 focus:border-accent focus:outline-none";
const label = "mb-1 block text-[10px] tracking-[0.2em] text-ink-3";

/** The slice in a line, for the board's header: "SL · 2 STRIKES · VS. LHB". */
function describe(f: FilterState): string {
  const parts: string[] = [];
  if (f.pitchTypes?.length) parts.push(f.pitchTypes.join("/"));
  if (f.balls !== null && f.strikes !== null) parts.push(`${f.balls}-${f.strikes} COUNT`);
  else if (f.balls !== null) parts.push(`${f.balls} BALLS`);
  else if (f.strikes !== null) parts.push(`${f.strikes} STRIKES`);
  if (f.stand) parts.push(`VS. ${f.stand}HB`);
  if (f.pThrows) parts.push(`${f.pThrows}HP`);
  if (f.twoOuts) parts.push("2 OUTS");
  if (f.lateInnings) parts.push("7TH+");
  if (f.dateFrom || f.dateTo) parts.push(`${f.dateFrom ?? "START"} → ${f.dateTo ?? "END"}`);
  return parts.length ? parts.join(" · ") : "EVERY PITCH";
}

function Select({
  name,
  title,
  value,
  options,
}: {
  name: string;
  title: string;
  value: string;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <label className="block">
      <span className={label}>{title}</span>
      <select name={name} defaultValue={value} className={field}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export default async function QueryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const current = seasonOf(todayPT());
  const q = pickQuery(sp, current, STATCAST_FIRST_SEASON);
  /* Untouched selects arrive empty; only what was set is the slice. */
  const f = filtersFromQuery(
    new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1])),
  );
  const rows = await getQueryBoard(q, f).catch(() => null);
  const who = q.role === "pitcher" ? "PITCHERS" : "HITTERS";
  const sample = SAMPLE_LABEL[q.stat.sample];

  return (
    <div className="flex min-h-[calc(100vh-3rem)] flex-col lg:flex-row">
      <aside className="shrink-0 border-b border-line bg-surface lg:sticky lg:top-12 lg:h-[calc(100vh-3rem)] lg:w-64 lg:overflow-y-auto lg:border-r lg:border-b-0">
        <Sidebar active="Q-01" />
        <form method="get" action="/query" aria-label="Query" className="space-y-3 px-3 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] tracking-[0.25em] text-ink-3">QUERY</h2>
            <Link href="/query" className="border border-line px-1.5 py-0.5 text-[10px] text-ink-3 hover:border-accent hover:text-ink">
              RESET
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select name="role" title="RANK" value={q.role} options={[["pitcher", "PITCHERS"], ["batter", "HITTERS"]]} />
            <Select
              name="season"
              title="SEASON"
              value={String(q.season)}
              options={Array.from({ length: current - STATCAST_FIRST_SEASON + 1 }, (_, i) => {
                const y = String(current - i);
                return [y, y] as const;
              })}
            />
          </div>
          <Select name="stat" title="STAT" value={q.stat.key} options={QUERY_STATS.map((s) => [s.key, `${s.label} — ${s.title}`] as const)} />
          <label className="block">
            <span className={label}>MINIMUM SAMPLE</span>
            <input type="number" name="min" min={0} defaultValue={q.min} className={field} />
            <span className="mt-1 block text-[10px] text-ink-3">
              IN THE STAT&apos;S OWN UNIT — {sample} FOR {q.stat.label}
            </span>
          </label>

          <h3 className="border-t border-grid pt-3 text-[10px] tracking-[0.25em] text-ink-3">PITCHES</h3>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={label}>FROM</span>
              <input type="date" name="from" defaultValue={f.dateFrom ?? ""} className={field} />
            </label>
            <label className="block">
              <span className={label}>TO</span>
              <input type="date" name="to" defaultValue={f.dateTo ?? ""} className={field} />
            </label>
          </div>
          <Select name="pt" title="PITCH TYPE" value={f.pitchTypes?.[0] ?? ""} options={[["", "ANY"], ...QUERY_PITCH_TYPES.map(([c, n]) => [c, `${c} — ${n}`] as const)]} />
          <div className="grid grid-cols-2 gap-2">
            <Select name="b" title="BALLS" value={f.balls === null ? "" : String(f.balls)} options={[["", "ANY"], ["0", "0"], ["1", "1"], ["2", "2"], ["3", "3"]]} />
            <Select name="s" title="STRIKES" value={f.strikes === null ? "" : String(f.strikes)} options={[["", "ANY"], ["0", "0"], ["1", "1"], ["2", "2"]]} />
            <Select name="bat" title="BATTER" value={f.stand ?? ""} options={[["", "ANY"], ["L", "LHB"], ["R", "RHB"]]} />
            <Select name="arm" title="PITCHER" value={f.pThrows ?? ""} options={[["", "ANY"], ["L", "LHP"], ["R", "RHP"]]} />
          </div>
          <div className="flex gap-4 text-[11px] text-ink-2">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" name="outs2" value="1" defaultChecked={f.twoOuts} /> 2 OUTS
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" name="late" value="1" defaultChecked={f.lateInnings} /> 7TH+
            </label>
          </div>
          <button type="submit" className="w-full border border-accent bg-accent px-3 py-1.5 text-[10px] font-bold tracking-[0.2em] text-white hover:opacity-90">
            RUN QUERY
          </button>
        </form>
      </aside>

      <main className="min-w-0 flex-1 space-y-3 p-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border border-line bg-surface px-3 py-2">
          <h1 className="text-base font-bold tracking-wide">
            {q.stat.label} — {who}
          </h1>
          <span className="text-[11px] text-ink-3">
            {q.season} · {describe(f)} · MIN {q.min.toLocaleString()} {sample}
            {rows && ` · ${rows.length.toLocaleString()} QUALIFY`}
          </span>
        </div>

        <Panel title="LEADERBOARD">
          {rows ? (
            <QueryTable
              rows={rows}
              role={q.role}
              stat={{ label: q.stat.label, kind: q.stat.kind }}
              sampleLabel={sample}
              slice={filtersToQuery(f).toString()}
              filename={`${q.stat.key}-${q.role}s-${q.season}.csv`}
            />
          ) : (
            <p className="text-xs leading-5 text-ink-2">
              Baseball Savant didn&apos;t answer the query. It&apos;s usually
              momentary; try again.
            </p>
          )}
        </Panel>
      </main>
    </div>
  );
}

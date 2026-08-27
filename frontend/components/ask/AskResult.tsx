"use client";

import DataTable, { type Column } from "@/components/ui/DataTable";
import MetricCard from "@/components/ui/MetricCard";
import Panel from "@/components/ui/Panel";
import PlayerLink from "@/components/mlb/PlayerLink";
import type { AskAnswer, AskGame, AskLeader, AskResponse } from "@/lib/api";

/*
 * One answer card: the number, how it splits, and every play behind it.
 *
 * Client-side because the game log rides on DataTable (sortable, windowed) —
 * its columns are render functions, which can't cross the server boundary.
 * Numbers arrive pre-formatted from the API so the headline here and the
 * total in the log can't disagree about rounding.
 */

const num = (v: number | null, digits = 1, unit = "") =>
  v === null || v === undefined ? "—" : `${v.toFixed(digits)}${unit}`;

/** W green, L red — the one place colour carries meaning in this table. */
function Result({ result }: { result: string | null }) {
  if (!result) return <span className="text-ink-3">—</span>;
  const tone = result.startsWith("W")
    ? "text-good"
    : result.startsWith("L")
      ? "text-crit"
      : "text-ink-2";
  return <span className={tone}>{result}</span>;
}

function logColumns(role: "batter" | "pitcher"): Column<AskGame>[] {
  return [
    {
      key: "date",
      label: "DATE",
      sortValue: (r) => r.date,
      render: (r) => (
        <span className="whitespace-nowrap">
          <span className="text-ink-3">{r.day_of_week} </span>
          {r.date.slice(5).replace("-", "/")}
        </span>
      ),
    },
    {
      key: "opp",
      label: "OPP",
      sortValue: (r) => r.opponent ?? "",
      render: (r) => (
        <span>
          <span className="text-ink-3">{r.is_home ? "vs" : "@"} </span>
          {r.opponent ?? "—"}
        </span>
      ),
    },
    {
      key: "result",
      label: "RESULT",
      sortValue: (r) => r.result ?? "",
      render: (r) => <Result result={r.result} />,
    },
    {
      key: "inning",
      label: "INN",
      align: "right",
      sortValue: (r) => r.inning,
      render: (r) => r.inning ?? "—",
    },
    {
      key: "other",
      label: role === "batter" ? "PITCHER" : "BATTER",
      sortValue: (r) => r.other_name ?? "",
      render: (r) => (
        <span className="flex items-center gap-1">
          <PlayerLink id={r.other_id} headshot={false}>
            {r.other_name ?? "—"}
          </PlayerLink>
          {r.other_hand && (
            <span className="text-ink-3">({r.other_hand})</span>
          )}
        </span>
      ),
    },
    {
      key: "ev",
      label: "EV",
      align: "right",
      sortValue: (r) => r.launch_speed,
      render: (r) => num(r.launch_speed, 1),
    },
    {
      key: "la",
      label: "LA",
      align: "right",
      sortValue: (r) => r.launch_angle,
      render: (r) => num(r.launch_angle, 0, "°"),
    },
    {
      key: "dist",
      label: "DIST",
      align: "right",
      sortValue: (r) => r.distance,
      render: (r) => num(r.distance, 0, " ft"),
    },
    {
      key: "detail",
      label: "PLAY",
      sortValue: (r) => r.detail ?? "",
      render: (r) => (
        <span
          className="block max-w-[26rem] truncate text-ink-3"
          title={r.detail ?? undefined}
        >
          {r.detail ?? r.event ?? "—"}
        </span>
      ),
    },
  ];
}

export default function AskResult({ data }: { data: AskResponse }) {
  const { answer, summary_stats: s, comparison, game_log: log } = data;

  if (!answer) {
    return (
      <div className="border border-line bg-surface p-6">
        <p className="text-sm text-ink">NO ANSWER FOR THAT ONE.</p>
        <ul className="mt-3 space-y-1 text-xs text-ink-2">
          {data.notes.map((n) => (
            <li key={n}>— {n}</li>
          ))}
        </ul>
        {data.suggestions.length > 0 && (
          <p className="mt-4 text-xs text-ink-3">
            DID YOU MEAN: {data.suggestions.join(" · ")}
          </p>
        )}
      </div>
    );
  }

  const handLabel =
    answer.role === "batter" ? "VS LHP / RHP" : "VS LHB / RHB";
  const isRate = answer.display.startsWith(".");
  // Two shapes share `comparison`: a ranked leaderboard, or the two-or-more
  // named subjects of a head-to-head. They render differently.
  const leaders = comparison.filter(
    (c): c is AskLeader => typeof (c as AskLeader).rank === "number"
  );
  const rivals = comparison.filter(
    (c): c is AskAnswer => "subject" in c
  );
  const peak = Math.max(...leaders.map((l) => l.value), 1);
  const rivalPeak = Math.max(...rivals.map((r) => r.value), 1);

  return (
    <div className="space-y-4">
      {/* ── the answer ─────────────────────────────────────────────── */}
      <section className="border border-line bg-surface">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-2">
          <h2 className="text-[10px] tracking-[0.25em] text-ink-3">
            {answer.subject.toUpperCase()} — {answer.label.toUpperCase()}
          </h2>
          <span className="text-[10px] tracking-wider text-ink-3">
            {answer.timeframe.toUpperCase()}
          </span>
        </header>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3 px-4 py-6">
          <p className="text-6xl leading-none font-bold tracking-tight text-ink tabular-nums">
            {answer.display}
          </p>
          <div className="pb-1">
            <p className="text-sm text-ink-2">
              {answer.subject_kind === "player" && answer.subject_id ? (
                <PlayerLink id={answer.subject_id}>{answer.subject}</PlayerLink>
              ) : (
                answer.subject
              )}
            </p>
            <p className="mt-1 text-[10px] tracking-widest text-ink-3">
              {answer.label.toUpperCase()}
              {answer.rank && ` · ${answer.rank.toUpperCase()}`}
            </p>
          </div>
          {answer.filters.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 pb-1">
              {answer.filters.map((f) => (
                <li
                  key={f}
                  className="border border-line px-2 py-0.5 text-[10px] tracking-wider text-ink-2"
                >
                  {f.toUpperCase()}
                </li>
              ))}
            </ul>
          )}
        </div>
        {data.notes.length > 0 && (
          <ul className="space-y-1 border-t border-line px-4 py-2 text-[10px] text-ink-3">
            {data.notes.map((n) => (
              <li key={n}>— {n}</li>
            ))}
          </ul>
        )}
      </section>

      {/* ── splits ─────────────────────────────────────────────────── */}
      {s && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricCard
            label="HOME / ROAD"
            value={`${s.home} / ${s.road}`}
            sub={`${s.games} GAMES`}
          />
          <MetricCard
            label={handLabel}
            value={`${s.vs_lhp} / ${s.vs_rhp}`}
          />
          <MetricCard
            label={isRate ? "AT-BATS" : "TOTAL"}
            value={String(isRate ? s.denom : s.total)}
          />
          <MetricCard
            label="SPAN"
            value={s.first_date ? s.first_date.slice(5) : "—"}
            sub={s.last_date ? `THROUGH ${s.last_date}` : undefined}
          />
        </div>
      )}

      {/* ── head to head, when the question named two people ───────── */}
      {rivals.length > 1 && (
        <Panel title="HEAD TO HEAD">
          <ol className="space-y-1">
            {rivals.map((r) => (
              <li key={r.subject} className="flex items-center gap-2 text-xs">
                <span className="w-44 shrink-0 truncate">
                  <PlayerLink id={r.subject_id} headshot={false}>
                    {r.subject}
                  </PlayerLink>
                </span>
                <span
                  className="h-2 bg-accent"
                  style={{ width: `${Math.max(2, (r.value / rivalPeak) * 100)}%` }}
                />
                <span className="ml-auto shrink-0 tabular-nums text-ink">
                  {r.display}
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      {/* ── leaderboard, when the question was comparative ─────────── */}
      {leaders.length > 1 && (
        <Panel title="LEADERBOARD — SAME FILTERS">
          <ol className="space-y-1">
            {leaders.map((l) => (
              <li key={l.player_id} className="flex items-center gap-2 text-xs">
                <span className="w-6 shrink-0 text-right text-ink-3 tabular-nums">
                  {l.rank}
                </span>
                <span className="w-44 shrink-0 truncate">
                  <PlayerLink id={l.player_id} headshot={false}>
                    {l.name}
                  </PlayerLink>
                </span>
                <span
                  className="h-2 bg-accent"
                  style={{ width: `${Math.max(2, (l.value / peak) * 100)}%` }}
                />
                <span className="ml-auto shrink-0 tabular-nums text-ink">
                  {l.display}
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      {/* ── the plays behind the number ────────────────────────────── */}
      <Panel
        title={`GAME LOG — ${answer.subject.toUpperCase()}`}
        right={
          <span className="text-[10px] tracking-wider text-ink-3">
            {data.truncated ? "FIRST 200, NEWEST FIRST" : "NEWEST FIRST"}
          </span>
        }
      >
        <DataTable
          columns={logColumns(answer.role)}
          rows={log}
          rowKey={(r, i) => `${r.game_pk}-${i}`}
          defaultSort={{ key: "date", dir: "desc" }}
          emptyLabel="NO PLAYS IN SLICE"
        />
      </Panel>
    </div>
  );
}

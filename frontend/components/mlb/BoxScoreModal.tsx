"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  gameStatus,
  teamLogo,
  type BoxBatter,
  type BoxPitcher,
  type BoxScore,
  type BoxTeam,
  type Game,
} from "@/lib/mlb";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";

/*
 * Full box score for one game, opened from a card in the scoreboard strip.
 * The game itself is already in hand (the strip fetched the schedule), so
 * only the batting/pitching/linescore payload is pulled on open, from the
 * same-origin /api/games/[pk] proxy.
 */

const BAT_COLS = ["AB", "R", "H", "RBI", "BB", "K", "AVG"] as const;
const PIT_COLS = ["IP", "H", "R", "ER", "BB", "K", "HR", "P-S", "ERA"] as const;

const batCells = (b: BoxBatter) => [b.ab, b.r, b.h, b.rbi, b.bb, b.k, b.avg];
const pitCells = (p: BoxPitcher) => [
  p.ip,
  p.h,
  p.r,
  p.er,
  p.bb,
  p.k,
  p.hr,
  `${p.pitches}-${p.strikes}`,
  p.era,
];

/* ── Linescore ───────────────────────────────────────────────────────── */

function Linescore({ box, final }: { box: BoxScore; final: boolean }) {
  // Extra innings extend past the scheduled 9; a suspended game can fall short.
  const count = Math.max(box.scheduledInnings, box.innings.length);
  const nums = Array.from({ length: count }, (_, i) => i + 1);
  const rows: { team: BoxTeam; side: "away" | "home" }[] = [
    { team: box.away, side: "away" },
    { team: box.home, side: "home" },
  ];

  return (
    <div className="overflow-x-auto border border-line">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="px-2 py-1.5 text-left text-[10px] tracking-widest text-ink-3">
              &nbsp;
            </th>
            {nums.map((n) => (
              <th
                key={n}
                scope="col"
                className="w-7 px-1 py-1.5 text-center text-[10px] text-ink-3 tabular-nums"
              >
                {n}
              </th>
            ))}
            {["R", "H", "E"].map((c) => (
              <th
                key={c}
                scope="col"
                className="w-8 border-l border-line px-1 py-1.5 text-center text-[10px] tracking-widest text-ink-2"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ team, side }) => (
            <tr key={side} className="border-b border-grid last:border-b-0">
              <th
                scope="row"
                className="px-2 py-1.5 text-left text-xs font-bold whitespace-nowrap text-ink"
              >
                {team.abbr}
              </th>
              {nums.map((n) => {
                const inn = box.innings.find((i) => i.num === n);
                const runs = inn?.[side] ?? null;
                // A home team that never had to bat gets an X, the scorecard
                // convention — but only once the game is over; mid-game the
                // half simply hasn't happened yet.
                const blank = inn && final ? "X" : "";
                return (
                  <td
                    key={n}
                    className="px-1 py-1.5 text-center tabular-nums text-ink-2"
                  >
                    {runs ?? blank}
                  </td>
                );
              })}
              {[team.runs, team.hits, team.errors].map((v, i) => (
                <td
                  key={i}
                  className={`border-l border-line px-1 py-1.5 text-center tabular-nums ${
                    i === 0 ? "font-bold text-ink" : "text-ink-2"
                  }`}
                >
                  {v ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Batting / pitching lines ────────────────────────────────────────── */

function StatTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: readonly string[];
  rows: { key: number; label: React.ReactNode; cells: (string | number)[] }[];
}) {
  return (
    <div className="overflow-x-auto border border-line">
      <table className="w-full border-collapse text-xs">
        <caption className="border-b border-line px-2 py-1.5 text-left text-[10px] tracking-[0.25em] text-ink-3">
          {caption}
        </caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="px-2 py-1 text-left text-[10px] tracking-widest text-ink-3">
              PLAYER
            </th>
            {columns.map((c) => (
              <th
                key={c}
                scope="col"
                className="px-2 py-1 text-right text-[10px] tracking-widest text-ink-3"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length + 1}
                className="px-2 py-4 text-center text-ink-3"
              >
                NO LINES YET
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr
              key={r.key}
              className="border-b border-grid last:border-b-0 hover:bg-surface-2"
            >
              <td className="px-2 py-1 whitespace-nowrap text-ink-2">{r.label}</td>
              {r.cells.map((c, i) => (
                <td
                  key={i}
                  className="px-2 py-1 text-right tabular-nums whitespace-nowrap text-ink-2"
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamLines({ team }: { team: BoxTeam }) {
  return (
    <div className="space-y-2">
      <StatTable
        caption={`${team.abbr} BATTING`}
        columns={BAT_COLS}
        rows={team.batters.map((b) => ({
          key: b.id,
          label: (
            <span className={b.sub ? "pl-3" : ""}>
              {b.sub && <span className="text-ink-3">↳ </span>}
              {b.name}
              <span className="ml-1.5 text-[10px] text-ink-3">{b.pos}</span>
            </span>
          ),
          cells: batCells(b),
        }))}
      />
      <StatTable
        caption={`${team.abbr} PITCHING`}
        columns={PIT_COLS}
        rows={team.pitchers.map((p) => ({
          key: p.id,
          label: (
            <span>
              {p.name}
              {p.decision && (
                <span className="ml-1.5 text-[10px] text-accent">
                  {p.decision}
                </span>
              )}
            </span>
          ),
          cells: pitCells(p),
        }))}
      />
    </div>
  );
}

/* ── Modal shell ─────────────────────────────────────────────────────── */

function HeaderSide({ side }: { side: Game["away"] }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={teamLogo(side.id)} alt="" width={28} height={28} className="h-7 w-7 shrink-0" />
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-ink">
          {side.abbr !== "—" ? side.abbr : side.name}
        </p>
        {side.wins !== null && (
          <p className="text-[10px] text-ink-3">
            {side.wins}-{side.losses}
          </p>
        )}
      </div>
      <span className="ml-1 text-xl tabular-nums text-ink">{side.score ?? "—"}</span>
    </div>
  );
}

export default function BoxScoreModal({
  game,
  onClose,
}: {
  game: Game;
  onClose: () => void;
}) {
  const [box, setBox] = useState<BoxScore | null>(null);
  const [error, setError] = useState(false);
  const [side, setSide] = useState<"away" | "home">("away");
  const closeRef = useRef<HTMLButtonElement>(null);

  const st = gameStatus(game);

  useEffect(() => {
    let alive = true;
    fetch(`/api/games/${game.pk}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.box) setBox(d.box);
        else setError(true);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [game.pk]);

  // Esc closes; the page behind must not scroll while the dialog is up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const tone =
    st.tone === "live" ? "text-good" : st.tone === "final" ? "text-ink-3" : "text-accent";

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`Box score — ${game.away.name} at ${game.home.name}`}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="w-full max-w-3xl border border-line bg-surface"
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <HeaderSide side={game.away} />
            <span className="text-[10px] text-ink-3">@</span>
            <HeaderSide side={game.home} />
          </div>
          <div className="shrink-0 text-right">
            <p className={`text-[10px] tracking-widest ${tone}`}>
              {st.tone === "live" && (
                <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-good align-middle" />
              )}
              {st.text}
            </p>
            {game.venue && (
              <p className="hidden text-[10px] text-ink-3 sm:block">{game.venue}</p>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close box score"
            onClick={onClose}
            className="h-7 w-7 shrink-0 border border-line text-ink-2 hover:border-accent hover:text-ink"
          >
            ×
          </button>
        </div>

        {/* ── Body ────────────────────────────────────────────── */}
        <div className="space-y-2 p-3">
          {error ? (
            <p className="py-8 text-center text-xs text-ink-3">
              BOX SCORE UNAVAILABLE — MLB API UNREACHABLE
            </p>
          ) : !box ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-40 w-full" delay={0.15} />
            </div>
          ) : (
            <>
              <Linescore box={box} final={game.state === "Final"} />
              {box.away.batters.length === 0 && box.home.batters.length === 0 ? (
                <div className="border border-line px-3 py-6 text-center">
                  <p className="text-xs text-ink-3">
                    NOT STARTED — NO BOX SCORE YET
                  </p>
                  <p className="mt-2 text-[11px] text-ink-2">
                    {game.away.probable?.name ?? "TBD"}
                    <span className="mx-2 text-ink-3">vs</span>
                    {game.home.probable?.name ?? "TBD"}
                  </p>
                </div>
              ) : (
                <>
                  <SegmentedControl
                    ariaLabel="Team"
                    value={side}
                    onChange={setSide}
                    options={[
                      { value: "away" as const, label: box.away.abbr },
                      { value: "home" as const, label: box.home.abbr },
                    ]}
                  />
                  <TeamLines team={side === "away" ? box.away : box.home} />
                </>
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

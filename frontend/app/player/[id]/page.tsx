import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Panel from "@/components/ui/Panel";
import MetricCard from "@/components/ui/MetricCard";
import {
  getPlayer,
  seasonOf,
  teamLogo,
  todayET,
  type PlayerSummary,
  type StatLine,
} from "@/lib/mlb";

/*
 * One player's season summary — the target of every PlayerLink. Identity bar
 * plus one panel per stat group (a two-way player gets both), each opening
 * with the four headline tiles from lib/mlb's key order and listing the rest
 * as a label/value grid. A dead MLB API degrades to a notice, matching the
 * league sections; an unknown id 404s.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const p = await getPlayer(Number(id), seasonOf(todayET())).catch(() => null);
  return { title: p ? `${p.name} — STAT//SIGHTLINE` : "STAT//SIGHTLINE" };
}

function Identity({ p }: { p: PlayerSummary }) {
  const facts = [
    p.pos,
    p.number && `#${p.number}`,
    `B/T ${p.bats}/${p.throws}`,
    p.age !== null && `AGE ${p.age}`,
    p.height && p.weight ? `${p.height} · ${p.weight} LB` : "",
    p.debut && `DEBUT ${p.debut}`,
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-3 border border-line bg-surface px-3 py-3">
      {p.teamId && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={teamLogo(p.teamId)}
          alt=""
          width={36}
          height={36}
          className="h-9 w-9 shrink-0"
        />
      )}
      <div className="min-w-0">
        <h1 className="truncate text-base font-bold tracking-wider text-ink">
          {p.name.toUpperCase()}
        </h1>
        <p className="mt-1 truncate text-[10px] tracking-[0.2em] text-ink-3">
          {[p.team.toUpperCase(), ...facts].join(" · ")}
        </p>
      </div>
    </div>
  );
}

function GroupPanel({ line, season }: { line: StatLine; season: number }) {
  const [head, rest] = [line.stats.slice(0, 4), line.stats.slice(4)];
  return (
    <Panel
      title={`${line.group.toUpperCase()} — ${season} SEASON`}
      right={
        line.team ? (
          <span className="text-[10px] text-ink-3">{line.team.toUpperCase()}</span>
        ) : undefined
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {head.map(([label, value]) => (
          <MetricCard key={label} label={label} value={value} />
        ))}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {rest.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-2 border border-line bg-bg px-2 py-1.5"
          >
            <dt className="text-[10px] tracking-widest text-ink-3">{label}</dt>
            <dd className="text-xs tabular-nums text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const playerId = Number(id);
  if (!Number.isFinite(playerId)) notFound();
  const season = seasonOf(todayET());

  let player: PlayerSummary | null;
  try {
    player = await getPlayer(playerId, season);
  } catch {
    return (
      <div className="mx-auto max-w-7xl p-3">
        <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
          PLAYER UNAVAILABLE — MLB API UNREACHABLE
        </p>
      </div>
    );
  }
  if (!player) notFound();

  return (
    <div className="mx-auto max-w-7xl space-y-3 p-3">
      <Identity p={player} />
      {player.lines.length === 0 ? (
        <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
          NO {season} SEASON STATS FOR THIS PLAYER
        </p>
      ) : (
        player.lines.map((l) => (
          <GroupPanel key={l.group} line={l} season={season} />
        ))
      )}
    </div>
  );
}

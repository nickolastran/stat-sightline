import AutoRefresh from "@/components/mlb/AutoRefresh";
import Panel from "@/components/ui/Panel";
import PlayerLink from "@/components/mlb/PlayerLink";
import TeamTotals from "@/components/mlb/TeamTotals";
import {
  getLive,
  scoringPlays,
  type AtBat,
  type BoxScore,
  type Game,
  type LivePitch,
  type PlayProb,
} from "@/lib/mlb";

/*
 * A game while it is being played: the at-bat under way pitch by pitch, the
 * runs that have scored, how the two clubs' totals compare, and what the
 * innings have done to each side's chances.
 *
 * Server-rendered off requests that revalidate every fifteen seconds, with a
 * timer asking for a fresh render — no second copy of any of this in the
 * browser, and the box score above it comes along on the same refresh.
 */

const REFRESH_SECONDS = 20;

function Notice({ what }: { what: string }) {
  return (
    <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
      {what}
    </p>
  );
}

/* ── The count ──────────────────────────────────────────────────────── */

function Dots({ label, filled, of }: { label: string; filled: number; of: number }) {
  return (
    <p className="flex items-center gap-1.5 text-[10px] tracking-[0.2em] text-ink-3">
      {label}
      <span className="flex gap-1" aria-hidden>
        {Array.from({ length: of }, (_, i) => (
          <span
            key={i}
            className={`h-2 w-2 rounded-full border ${
              i < filled ? "border-accent bg-accent" : "border-line"
            }`}
          />
        ))}
      </span>
      <span className="sr-only">
        {filled} of {of}
      </span>
    </p>
  );
}

/* ── Strike zone, this at-bat only ──────────────────────────────────── */

/* Catcher's view, feet: a little wider than the plate and from the dirt to
   over the letters, so a pitch nobody swung at still lands on the plot. */
const XD: [number, number] = [-2.2, 2.2];
const ZD: [number, number] = [0.4, 4.6];
const PX_FT = 46;
const W = (XD[1] - XD[0]) * PX_FT;
const H = (ZD[1] - ZD[0]) * PX_FT;
const sx = (x: number) => (x - XD[0]) * PX_FT;
const sz = (z: number) => H - (z - ZD[0]) * PX_FT;
/** Half the plate plus a ball's width either side — the rulebook's own box. */
const PLATE = 0.83;

const TONE: Record<LivePitch["outcome"], string> = {
  ball: "fill-good",
  strike: "fill-crit",
  "in-play": "fill-accent",
};

function Zone({ atBat }: { atBat: AtBat }) {
  const located = atBat.pitches.filter((p) => p.x !== null && p.z !== null);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full max-w-[13rem]"
      role="img"
      aria-label={`Pitch locations this at-bat, catcher's view — ${located.length} located`}
    >
      {/* The batter's own zone, and its thirds. */}
      <rect
        x={sx(-PLATE)}
        y={sz(atBat.zoneTop)}
        width={PLATE * 2 * PX_FT}
        height={(atBat.zoneTop - atBat.zoneBottom) * PX_FT}
        className="fill-surface-2 stroke-ink-3"
        strokeWidth={1.5}
      />
      {[1, 2].map((i) => (
        <g key={i} className="stroke-grid" strokeWidth={1}>
          <line
            x1={sx(-PLATE + (PLATE * 2 * i) / 3)}
            y1={sz(atBat.zoneTop)}
            x2={sx(-PLATE + (PLATE * 2 * i) / 3)}
            y2={sz(atBat.zoneBottom)}
          />
          <line
            x1={sx(-PLATE)}
            y1={sz(atBat.zoneBottom + ((atBat.zoneTop - atBat.zoneBottom) * i) / 3)}
            x2={sx(PLATE)}
            y2={sz(atBat.zoneBottom + ((atBat.zoneTop - atBat.zoneBottom) * i) / 3)}
          />
        </g>
      ))}
      {/* Home plate, so the box is not floating in nothing. */}
      <polygon
        points={`${sx(-PLATE)},${sz(0.62)} ${sx(PLATE)},${sz(0.62)} ${sx(PLATE)},${sz(0.72)} ${sx(0)},${sz(0.82)} ${sx(-PLATE)},${sz(0.72)}`}
        className="fill-grid"
      />
      {located.map((p) => (
        <g key={p.number}>
          <circle
            cx={sx(p.x as number)}
            cy={sz(p.z as number)}
            r={9}
            className={`${TONE[p.outcome]} stroke-bg`}
            strokeWidth={1.5}
          />
          <text
            x={sx(p.x as number)}
            y={sz(p.z as number) + 3.5}
            textAnchor="middle"
            fontSize={10}
            fontWeight="bold"
            className="fill-bg"
          >
            {p.number}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ── Who is on ──────────────────────────────────────────────────────── */

function Bases({ bases }: { bases: LiveGameProps["live"]["bases"] }) {
  const label = ["1B", "2B", "3B"];
  /* Second sits at the top of the diamond, first to its right, third to its
     left — the shape read off a scoreboard, not a list. */
  const at = [
    { x: 26, y: 14 },
    { x: 14, y: 2 },
    { x: 2, y: 14 },
  ];
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 40 28" className="h-7 w-10 shrink-0" role="img" aria-hidden>
        {bases.map((runner, i) => (
          <rect
            key={i}
            x={at[i].x}
            y={at[i].y}
            width={11}
            height={11}
            transform={`rotate(45 ${at[i].x + 5.5} ${at[i].y + 5.5})`}
            className={runner ? "fill-accent" : "fill-none stroke-ink-3"}
            strokeWidth={1.2}
          />
        ))}
      </svg>
      <p className="min-w-0 flex-1 text-[11px] text-ink-3">
        {bases.map((runner, i) => (
          <span key={i} className="mr-3 inline-block whitespace-nowrap">
            <span className="mr-1 text-[10px] tracking-wider">{label[i]}</span>
            {runner ? (
              <span className="text-ink-2">
                <PlayerLink id={runner.id} headshot={false}>
                  {runner.name}
                </PlayerLink>
              </span>
            ) : (
              "EMPTY"
            )}
          </span>
        ))}
      </p>
    </div>
  );
}

/* ── Win probability ────────────────────────────────────────────────── */

const CHART_W = 600;
const CHART_H = 150;

function WinProbability({ game, plays }: { game: Game; plays: PlayProb[] }) {
  const last = plays.at(-1);
  /* The at-bat under way is in the log already, with nothing to say about
     itself yet — the caption reads the last play that finished. */
  const recent = [...plays].reverse().find((p) => p.description) ?? last;
  const step = plays.length > 1 ? CHART_W / (plays.length - 1) : 0;
  const y = (prob: number) => CHART_H - (prob / 100) * CHART_H;
  const line = plays.map((p, i) => `${i * step},${y(p.homeProb)}`).join(" ");
  /* One tick where each inning starts — the x axis is plays, but a reader
     counts in innings. */
  const innings = plays
    .map((p, i) => ({ i, p }))
    .filter(({ i, p }) => i === 0 || p.inning !== plays[i - 1].inning);

  return (
    <div className="space-y-2">
      <p className="text-right text-xs tabular-nums text-ink">
        {game.home.abbr} {last ? last.homeProb.toFixed(1) : "50.0"}%
      </p>
      <div className="flex gap-2">
        <div className="flex w-10 shrink-0 flex-col justify-between text-[10px] tracking-wider text-ink-3">
          <span>{game.home.abbr}</span>
          <span>EVEN</span>
          <span>{game.away.abbr}</span>
        </div>
        <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="min-w-0 flex-1"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Home win probability by play, now ${last ? last.homeProb.toFixed(1) : 50} percent`}
      >
        <line x1={0} y1={y(50)} x2={CHART_W} y2={y(50)} className="stroke-grid" strokeWidth={2} />
        {innings.map(({ i, p }) => (
          <line
            key={`${p.inning}-${i}`}
            x1={i * step}
            y1={0}
            x2={i * step}
            y2={CHART_H}
            className="stroke-grid"
            strokeWidth={1}
            strokeDasharray="3 5"
          />
        ))}
        <polyline
          points={line}
          fill="none"
          className="stroke-accent"
          strokeWidth={3}
          vectorEffect="non-scaling-stroke"
        />
        </svg>
        <div className="flex w-7 shrink-0 flex-col justify-between text-right text-[10px] tabular-nums text-ink-3">
          <span>100</span>
          <span>50</span>
          <span>0</span>
        </div>
      </div>
      {recent?.description && (
        <p className="border border-line bg-bg px-2 py-1.5 text-[11px] text-ink-2">
          <span className="mr-2 text-[10px] tracking-wider text-ink-3">
            {recent.half === "top" ? "TOP" : "BOT"} {recent.inning} ·{" "}
            {game.away.abbr} {recent.awayScore}-{recent.homeScore}{" "}
            {game.home.abbr}
          </span>
          {recent.description}
        </p>
      )}
    </div>
  );
}

/* ── The view ───────────────────────────────────────────────────────── */

interface LiveGameProps {
  game: Game;
  box: BoxScore;
  live: Awaited<ReturnType<typeof getLive>>;
}

/** Today's line for whoever is on the mound / at the plate, out of the box. */
const pitcherLine = (box: BoxScore, id: number | undefined) =>
  [...box.away.pitchers, ...box.home.pitchers].find((p) => p.id === id) ?? null;
const batterLine = (box: BoxScore, id: number | undefined) =>
  [...box.away.batters, ...box.home.batters].find((b) => b.id === id) ?? null;

function AtBatPanel({ game, box, live }: LiveGameProps) {
  const ab = live.atBat!;
  const arm = pitcherLine(box, ab.pitcher?.id);
  const bat = batterLine(box, ab.batter?.id);

  return (
    <div className="space-y-3">
      {/* Who is facing whom, and what each has done today. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        {[
          {
            role: "PITCHER",
            who: ab.pitcher,
            hand: ab.hand,
            line: arm
              ? `${arm.ip} IP, ${arm.h} H, ${arm.er} ER, ${arm.k} K, ${arm.bb} BB`
              : "—",
          },
          {
            role: "BATTER",
            who: ab.batter,
            hand: ab.side,
            line: bat ? `${bat.h}-${bat.ab} TODAY` : "—",
          },
        ].map((s) => (
          <div key={s.role} className="min-w-0">
            <p className="text-[10px] tracking-[0.25em] text-ink-3">{s.role}</p>
            <p className="truncate text-sm text-ink">
              <PlayerLink id={s.who?.id}>{s.who?.name ?? "—"}</PlayerLink>
              {s.hand && (
                <span className="ml-1.5 text-[10px] text-ink-3">{s.hand}</span>
              )}
            </p>
            <p className="text-[10px] tabular-nums text-ink-2">{s.line}</p>
          </div>
        ))}
        <div className="text-right text-[10px] tracking-wider text-ink-3">
          {arm && <p className="tabular-nums">PITCH COUNT {arm.pitches}</p>}
          {live.onDeck && (
            <p>
              ON DECK{" "}
              <span className="text-ink-2">
                <PlayerLink id={live.onDeck.id} headshot={false}>
                  {live.onDeck.name}
                </PlayerLink>
              </span>
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 border-t border-grid pt-3">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Dots label="BALLS" filled={ab.balls} of={3} />
            <Dots label="STRIKES" filled={ab.strikes} of={2} />
            <Dots label="OUTS" filled={ab.outs} of={2} />
          </div>
          <Zone atBat={ab} />
          <Bases bases={live.bases} />
        </div>

        {/* The same pitches as a list — the plot's table twin, and the only
            reading of a pitch that never left the plate's view. */}
        <ul className="min-w-[13rem] flex-1 space-y-px">
          {ab.pitches.length === 0 && (
            <li className="text-xs text-ink-3">NO PITCH YET THIS AT-BAT</li>
          )}
          {[...ab.pitches].reverse().map((p) => (
            <li
              key={p.number}
              className="flex items-center gap-2 border border-line bg-bg px-2 py-1.5 text-xs"
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-bg ${
                  p.outcome === "ball"
                    ? "bg-good"
                    : p.outcome === "strike"
                      ? "bg-crit"
                      : "bg-accent"
                }`}
              >
                {p.number}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ink">
                  {p.call.toUpperCase()}
                </span>
                <span className="block truncate text-[10px] text-ink-3">
                  {p.name}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-ink-2">
                {p.speed !== null ? `${p.speed.toFixed(0)} MPH` : "—"}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="sr-only">
        {game.away.abbr} at {game.home.abbr}, refreshed every {REFRESH_SECONDS}{" "}
        seconds.
      </p>
    </div>
  );
}

export default async function LiveGame({
  game,
  box,
}: {
  game: Game;
  box: BoxScore;
}) {
  const live = await getLive(game.pk).catch(() => null);
  if (!live)
    return (
      <div className="mt-2">
        <Notice what="LIVE FEED UNAVAILABLE — MLB API UNREACHABLE" />
      </div>
    );

  const scored = scoringPlays(live.plays);

  return (
    <div className="space-y-2">
      <AutoRefresh seconds={REFRESH_SECONDS} />

      <Panel title="AT BAT">
        {live.atBat ? (
          <AtBatPanel game={game} box={box} live={live} />
        ) : (
          <Notice what="BETWEEN INNINGS" />
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <Panel title="SCORING">
          {scored.length === 0 ? (
            <Notice what="NOBODY HAS SCORED" />
          ) : (
            <ul className="space-y-px">
              {scored.map((p, i) => (
                <li
                  key={`${p.inning}-${p.half}-${i}`}
                  className="flex gap-2 border border-line bg-bg px-2 py-1.5 text-[11px]"
                >
                  <span className="w-14 shrink-0 text-[10px] tracking-wider text-ink-3">
                    {p.half === "top" ? "TOP" : "BOT"} {p.inning}
                  </span>
                  <span className="min-w-0 flex-1 text-ink-2">{p.description}</span>
                  <span className="shrink-0 tabular-nums text-ink">
                    {p.awayScore}-{p.homeScore}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="TEAM TOTALS">
          <TeamTotals box={box} />
        </Panel>
      </div>

      <Panel title="WIN PROBABILITY">
        {live.plays.length === 0 ? (
          <Notice what="NO PLAYS YET" />
        ) : (
          <WinProbability game={game} plays={live.plays} />
        )}
      </Panel>
    </div>
  );
}

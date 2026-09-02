import Link from "next/link";
import DivisionTable from "@/components/mlb/DivisionTable";
import { MiniBox } from "@/components/mlb/BoxScoreView";
import Panel from "@/components/ui/Panel";
import WinProbChart from "@/components/mlb/WinProbChart";
import PlayerLink from "@/components/mlb/PlayerLink";
import TeamTotals from "@/components/mlb/TeamTotals";
import {
  FALLBACK_TZ,
  gameStatus,
  getHotZones,
  getLive,
  getStandings,
  getTeamSchedule,
  halfInnings,
  headToHead,
  scoringPlays,
  seasonOf,
  teamLogo,
  type AtBat,
  type BoxScore,
  type Game,
  type HeatZone,
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

/** The page re-renders on this beat whichever tab is open — the page owns the
 *  timer, this view owns the number. */
export const REFRESH_SECONDS = 20;

function Notice({ what }: { what: string }) {
  return (
    <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
      {what}
    </p>
  );
}

/* ── The count ──────────────────────────────────────────────────────── */

/* The scoreboard's own colours — a ball is in the hitter's favour, a strike
   against him, an out is neither. Written out because Tailwind reads class
   names as literals. */
const DOT = {
  ball: "border-good bg-good",
  strike: "border-crit bg-crit",
  out: "border-accent bg-accent",
} as const;

function Dots({
  label,
  filled,
  of,
  tone,
}: {
  label: string;
  filled: number;
  of: number;
  tone: keyof typeof DOT;
}) {
  return (
    <p className="flex items-center gap-1.5 text-[10px] tracking-[0.2em] text-ink-3">
      {label}
      <span className="flex gap-1" aria-hidden>
        {Array.from({ length: of }, (_, i) => (
          <span
            key={i}
            className={`h-2 w-2 rounded-full border ${
              i < filled ? DOT[tone] : "border-line"
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

/* ── The batter's season, by part of the zone ───────────────────────── */

/* MLB grades each cell itself; these are its five grades in the app's own two
   colours, hot to cold. Spelled out because Tailwind reads class names. */
/* Transparent rather than unfilled for the middling cells: a rect with no
   fill isn't there as far as the pointer is concerned, and every cell has an
   average to show. */
const HEAT: Record<string, string> = {
  hot: "fill-crit/45",
  warm: "fill-crit/20",
  lukewarm: "fill-transparent",
  cool: "fill-accent/20",
  cold: "fill-accent/45",
};

function Heat({ zones, atBat }: { zones: HeatZone[]; atBat: AtBat }) {
  if (zones.length === 0) return null;
  const w = (PLATE * 2) / 3;
  const h = (atBat.zoneTop - atBat.zoneBottom) / 3;
  const midZ = (atBat.zoneTop + atBat.zoneBottom) / 2;
  const cell = (x: number, z: number, wide: number, tall: number, zone: string) => {
    const heat = zones.find((z) => z.zone === zone);
    return (
      <rect
        key={zone}
        x={sx(x)}
        y={sz(z + tall)}
        width={wide * PX_FT}
        height={tall * PX_FT}
        className={HEAT[heat?.temp ?? ""] ?? "fill-transparent"}
      >
        {/* The browser's own tooltip: the shading says hot or cold, this says
            how hot. */}
        {heat && <title>{`${heat.value} in this zone this season`}</title>}
      </rect>
    );
  };

  return (
    <g>
      {/* The four quadrants outside the zone, one cell deep so the shading
          stays around the plate instead of flooding the plot. They tile the
          whole band and the strike zone paints back over the middle. */}
      {cell(-PLATE - w, midZ, PLATE + w, atBat.zoneTop + h - midZ, "11")}
      {cell(0, midZ, PLATE + w, atBat.zoneTop + h - midZ, "12")}
      {cell(-PLATE - w, atBat.zoneBottom - h, PLATE + w, midZ - atBat.zoneBottom + h, "13")}
      {cell(0, atBat.zoneBottom - h, PLATE + w, midZ - atBat.zoneBottom + h, "14")}
      {/* The zone's own nine, left to right and top to bottom. */}
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) =>
          cell(
            -PLATE + c * w,
            atBat.zoneTop - (r + 1) * h,
            w,
            h,
            `0${r * 3 + c + 1}`
          )
        )
      )}
    </g>
  );
}

function Zone({ atBat, zones }: { atBat: AtBat; zones: HeatZone[] }) {
  const located = atBat.pitches.filter((p) => p.x !== null && p.z !== null);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full max-w-[15rem]"
      role="img"
      aria-label={`Pitch locations this at-bat, catcher's view — ${located.length} located, shaded by the batter's season average in each part of the zone`}
    >
      <Heat zones={zones} atBat={atBat} />
      {/* The batter's own zone, and its thirds. Unfilled, so the shading
          underneath still reads through it. */}
      <rect
        x={sx(-PLATE)}
        y={sz(atBat.zoneTop)}
        width={PLATE * 2 * PX_FT}
        height={(atBat.zoneTop - atBat.zoneBottom) * PX_FT}
        className="fill-none stroke-ink-3"
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
      {/* A filled bag already says the base is occupied, so the line beside
          the diamond only names the runners who are actually on. */}
      <p className="min-w-0 flex-1 text-[11px] text-ink-3">
        {bases.map(
          (runner, i) =>
            runner && (
              <span key={i} className="mr-3 inline-block whitespace-nowrap">
                <span className="mr-1 text-[10px] tracking-wider">{label[i]}</span>
                <span className="text-ink-2">
                  <PlayerLink id={runner.id} headshot={false}>
                    {runner.name}
                  </PlayerLink>
                </span>
              </span>
            )
        )}
      </p>
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

function AtBatPanel({
  game,
  box,
  live,
  zones,
}: LiveGameProps & { zones: HeatZone[] }) {
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
            <Dots label="BALLS" filled={ab.balls} of={3} tone="ball" />
            <Dots label="STRIKES" filled={ab.strikes} of={2} tone="strike" />
            <Dots label="OUTS" filled={ab.outs} of={2} tone="out" />
          </div>
          <Zone atBat={ab} zones={zones} />
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

/* ── The season series ─────────────────────────────────────────────── */

/* Eastern rather than the reader's zone: this list is rendered on the server,
   and a mismatch at hydration is worse than a date they have to translate. */
const gameDay = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    timeZone: FALLBACK_TZ,
  }).format(new Date(iso));

/** Every game the two clubs play each other this season, each one a way into
 *  its own box score. */
function SeasonSeries({ game, games }: { game: Game; games: Game[] }) {
  const played = games.filter((g) => g.state === "Final");
  const awayWins = played.filter(
    (g) => (g.home.id === game.away.id ? g.home : g.away).isWinner
  ).length;
  const homeWins = played.length - awayWins;
  const lead =
    played.length === 0
      ? "NOT PLAYED YET"
      : awayWins === homeWins
        ? `SERIES TIED ${awayWins}-${homeWins}`
        : awayWins > homeWins
          ? `${game.away.abbr} LEADS ${awayWins}-${homeWins}`
          : `${game.home.abbr} LEADS ${homeWins}-${awayWins}`;

  return (
    <Panel title="SEASON SERIES">
      {games.length === 0 ? (
        <Notice what="NO SERIES SCHEDULED" />
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] tracking-[0.2em] text-ink-3">{lead}</p>
          <ul className="space-y-px">
            {games.map((g, i) => (
              <li key={g.pk}>
                <Link
                  href={`/game/${g.pk}`}
                  aria-current={g.pk === game.pk ? "page" : undefined}
                  className={`block border bg-bg px-2 py-1.5 hover:border-accent ${
                    g.pk === game.pk ? "border-accent" : "border-line"
                  }`}
                >
                  <p className="flex justify-between gap-2 text-[10px] tracking-wider text-ink-3">
                    <span>
                      GAME {i + 1} · {gameDay(g.startTime)}
                    </span>
                    <span className="truncate">
                      {gameStatus(g, FALLBACK_TZ).text}
                    </span>
                  </p>
                  {/* The marks are taller than the line they sit on, so the
                      two rows get their own breathing room. */}
                  <span className="mt-1 block space-y-1">
                    {[g.away, g.home].map((s) => (
                      <span
                        key={s.id}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span
                          className={`flex min-w-0 items-center gap-1.5 ${
                            s.isWinner ? "font-bold text-ink" : "text-ink-2"
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={teamLogo(s.id)}
                            alt=""
                            width={16}
                            height={16}
                            className="h-4 w-4 shrink-0"
                          />
                          {s.abbr}
                        </span>
                        <span
                          className={`tabular-nums ${s.isWinner ? "font-bold text-ink" : "text-ink-2"}`}
                        >
                          {s.score ?? "—"}
                        </span>
                      </span>
                    ))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

/* ── The situation, for the other tabs ─────────────────────────────── */

/**
 * Who is facing whom, the count, and who is on — the header the box score and
 * the play log carry so a reader who has left the gamecast still knows where
 * the game stands.
 */
export function Situation({
  box,
  live,
}: {
  box: BoxScore;
  live: Awaited<ReturnType<typeof getLive>> | null;
}) {
  const ab = live?.atBat;
  if (!ab) return null;
  const arm = pitcherLine(box, ab.pitcher?.id);
  const bat = batterLine(box, ab.batter?.id);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border border-line bg-surface px-3 py-2">
      {[
        {
          role: "PITCHER",
          who: ab.pitcher,
          line: arm ? `${arm.ip} IP, ${arm.er} ER, ${arm.k} K, ${arm.pitches} P` : "—",
        },
        {
          role: "BATTER",
          who: ab.batter,
          line: bat ? `${bat.h}-${bat.ab} TODAY, ${bat.avg} AVG` : "—",
        },
      ].map((s) => (
        <div key={s.role} className="min-w-0">
          <p className="text-[10px] tracking-[0.25em] text-ink-3">{s.role}</p>
          <p className="truncate text-sm text-ink">
            <PlayerLink id={s.who?.id}>{s.who?.name ?? "—"}</PlayerLink>
          </p>
          <p className="text-[10px] tabular-nums text-ink-2">{s.line}</p>
        </div>
      ))}
      <div className="space-y-1">
        <Dots label="B" filled={ab.balls} of={3} tone="ball" />
        <Dots label="S" filled={ab.strikes} of={2} tone="strike" />
        <Dots label="O" filled={ab.outs} of={2} tone="out" />
      </div>
      <Bases bases={live.bases} />
    </div>
  );
}

/* ── Scoring summary ────────────────────────────────────────────────── */

/* MLB writes a home run as "homers (18)" — the hitter's season total, which
   the box score already carries. How far it went, it does not say anywhere
   else, so the distance takes that slot. */
const withDistance = (p: PlayProb) =>
  p.distance === null
    ? p.description
    : p.description.replace(/\(\d+\)/, `(${p.distance} ft)`);

/** The plays that put a run on the board. Shown twice on the page — once
 *  beside the running totals, once under the full box score. */
export function ScoringSummary({ plays }: { plays: PlayProb[] }) {
  const scored = scoringPlays(plays);
  return (
    <Panel title="SCORING SUMMARY">
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
              <span className="min-w-0 flex-1 text-ink-2">{withDistance(p)}</span>
              <span className="shrink-0 tabular-nums text-ink">
                {p.awayScore}-{p.homeScore}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ── Play by play ───────────────────────────────────────────────────── */

/**
 * Every plate appearance of the game, newest half-inning first. The log is
 * the win-probability feed the chart above is already drawn from, so this
 * section costs no extra request; the plays that scored read in the accent.
 */
export function PlayByPlay({
  game,
  plays,
  scoringOnly,
  tabs,
}: {
  game: Game;
  plays: PlayProb[];
  scoringOnly?: boolean;
  /** The all-plays / scoring-plays strip, which the page owns because it is
   *  the one that reads the query. */
  tabs?: React.ReactNode;
}) {
  const scored = new Set(scoringPlays(plays));
  /* Dropping the plays that didn't score leaves the scores untouched — a play
     that scored nothing carried the same figures as the one before it — so the
     halves still count their runs right off the filtered log. */
  const halves = halfInnings(scoringOnly ? scoringPlays(plays) : plays);

  return (
    <div className="space-y-2">
      {tabs}
      {halves.length === 0 ? (
        <Notice what={scoringOnly ? "NOBODY HAS SCORED" : "NO PLAYS YET"} />
      ) : (
        <div className="space-y-2">
          {[...halves].reverse().map((h) => (
            <div key={`${h.inning}-${h.half}`} className="border border-line">
              <p className="flex items-center justify-between gap-2 border-b border-line bg-bg px-2 py-1.5 text-[10px] tracking-widest text-ink-3">
                <span>
                  {h.half === "top" ? "TOP" : "BOT"} {h.inning} ·{" "}
                  <span className="text-ink-2">
                    {h.half === "top" ? game.away.abbr : game.home.abbr}
                  </span>{" "}
                  BATTING
                </span>
                <span className="tabular-nums text-ink-2">
                  {h.runs} {h.runs === 1 ? "RUN" : "RUNS"}
                </span>
              </p>
              <ul>
                {h.plays.map((p, i) => (
                  <li
                    key={i}
                    className="flex gap-2 border-b border-grid px-2 py-1.5 text-[11px] last:border-b-0"
                  >
                    <span
                      className={`min-w-0 flex-1 ${
                        scored.has(p) ? "text-accent" : "text-ink-2"
                      }`}
                    >
                      {/* The at-bat under way is in the log with nothing to
                          say about itself yet. */}
                      {p.description || "AT BAT"}
                    </span>
                    <span className="shrink-0 tabular-nums text-ink-3">
                      {p.awayScore}-{p.homeScore}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── The live section ───────────────────────────────────────────────── */

/**
 * The gamecast, in two columns: the narrow rail carries how the two clubs
 * compare and where the game's odds stand, the wide one the at-bat under way
 * and every run that has scored — the same split a scoreboard reads on.
 */
export default async function LiveGame({
  game,
  box,
  live,
}: {
  game: Game;
  box: BoxScore;
  live: Awaited<ReturnType<typeof getLive>> | null;
}) {
  if (!live) return <Notice what="LIVE FEED UNAVAILABLE — MLB API UNREACHABLE" />;

  const batter = live.atBat?.batter?.id;
  const season = seasonOf(game.startTime);
  /* The visiting club's schedule and the standings are both already cached by
     the rest of the site, so the right rail costs the page nothing new. */
  const [zones, schedule, standings] = await Promise.all([
    batter ? getHotZones(batter) : [],
    getTeamSchedule(game.away.id, season).catch(() => null),
    getStandings(season).catch(() => null),
  ]);
  const divisionOf = (id: number) =>
    standings?.find((d) => d.teams.some((t) => t.id === id)) ?? null;

  return (
    /* Both rails are sized to what they carry — a standings table wants its
       seven columns — and the middle takes whatever is left, which is where
       the at-bat and the play descriptions want it. Below the breakpoint the
       three stack, each at the full width of the page. */
    <div className="grid grid-cols-1 gap-2 min-[1440px]:grid-cols-[28rem_minmax(0,1fr)_28rem]">
      <div className="space-y-2">
        <MiniBox box={box} pk={game.pk} />
        <Panel title="TEAM TOTALS">
          <TeamTotals box={box} />
        </Panel>
        <Panel title="WIN PROBABILITY">
          {live.plays.length === 0 ? (
            <Notice what="NO PLAYS YET" />
          ) : (
            <WinProbChart game={game} plays={live.plays} />
          )}
        </Panel>
      </div>

      <div className="space-y-2">
        <Panel title="AT BAT">
          {live.atBat ? (
            <AtBatPanel game={game} box={box} live={live} zones={zones} />
          ) : (
            <Notice what="BETWEEN INNINGS" />
          )}
        </Panel>
        <ScoringSummary plays={live.plays} />
      </div>

      {/* Where this game sits in the season: the clubs' own series, and the
          race each of them is in. One table when they share a division — a
          race read twice is not two races. */}
      <div className="space-y-2">
        <SeasonSeries
          game={game}
          games={schedule ? headToHead(schedule, game.home.id) : []}
        />
        {[game.away, game.home]
          .filter(
            (s, i) => i === 0 || divisionOf(s.id)?.id !== divisionOf(game.away.id)?.id
          )
          .map((s) => {
            const division = divisionOf(s.id);
            return division ? (
              <DivisionTable
                key={s.id}
                division={division}
                teamId={[game.away.id, game.home.id]}
                full
              />
            ) : (
              <Panel key={s.id} title={`${s.abbr} STANDINGS`}>
                <Notice what="NO STANDINGS FOR THIS SEASON YET" />
              </Panel>
            );
          })}
      </div>
    </div>
  );
}

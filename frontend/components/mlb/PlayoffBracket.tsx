import Link from "next/link";
import { teamColor, teamHref, teamLogo, type Division } from "@/lib/mlb";
import { isSeeded, leagueBracket, seedField, type Seed } from "@/lib/playoffs";
import type { TeamOdds } from "@/lib/api";

/*
 * The postseason bracket, drawn the way MLB draws its own: each club a
 * diamond in its own colour with its seed on the corner, the two leagues
 * folded in on the World Series from either side, and grey slots for the
 * places nobody has reached yet.
 *
 * It is one SVG rather than boxes and CSS borders because the shape is a
 * tree, and a tree is elbows — geometry that a grid can only approximate and
 * that has to keep lining up as the thing scales. A viewBox does that for
 * free. It also means the whole bracket is one coordinate system: every
 * position below comes off four constants, and the right half is the left
 * half through `mirror`.
 *
 * Before October the seeds are the field as the standings have it today,
 * which is the only version of the question worth asking in August — so it
 * says so underneath rather than passing itself off as a result. The seeding
 * rule doesn't know whether the season is over, so the same component draws
 * the real bracket once it is.
 */

/* ── The canvas, and everything positioned on it ─────────────────────── */

const W = 1024;
const H = 660;
const MID = H / 2;

/** Column centres across the left half: wild card, division, championship,
 *  pennant. The right half is each of these mirrored. */
const COL = [76, 212, 348, 452];
const mirror = (x: number) => W - x;

/** Half the diagonal of a diamond — where a connector meets one. */
const HALF = 34;
/** Half the side of the square that, rotated, is that diamond. */
const SIDE = 48;

/* Vertically: the two championship-series slots sit either side of the
   middle, each fed by a wild-card winner and the bye seed a hundred below
   it, and each wild-card pair straddles its own winner's slot. */
/* The two championship slots either side of the middle. Wide enough that the
   round names, which sit on the middle line, clear the seed badge of the
   nearest club below them — at 130 the WILD CARD label printed straight
   through the 5 seed. */
const CS_SPREAD = 175;
const BYE_GAP = 100;
/* Half the gap inside a wild-card pair. It has to clear a diamond's half
   diagonal plus the caption under it plus the next badge above it, or the
   upper club's record prints through the lower club's seed. */
const WC_GAP = 56;

const dsTop = MID - CS_SPREAD;
const dsBottom = MID + CS_SPREAD;
const rows = {
  wcWinnerTop: dsTop - BYE_GAP / 2,
  byeTop: dsTop + BYE_GAP / 2,
  wcWinnerBottom: dsBottom - BYE_GAP / 2,
  byeBottom: dsBottom + BYE_GAP / 2,
};
const LABEL_Y = H - 28;

/** "American League" → "AL", for the round names down the middle. */
const abbr = (league: string) =>
  league
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase();

/** "Dodgers" out of "Los Angeles Dodgers" — a diamond is 68 pixels wide. */
const nickname = (name: string, city: string) =>
  (city && name.startsWith(city) ? name.slice(city.length).trim() : "") || name;

/* ── Pieces ─────────────────────────────────────────────────────────── */

/**
 * One elbow: two slots on one column joined, and a line out of the join to
 * the slot they feed. `dir` is the direction the bracket runs, so the right
 * half draws itself by flipping one number.
 */
function Elbow({
  x,
  yA,
  yB,
  toX,
  toY,
  dir,
}: {
  x: number;
  yA: number;
  yB: number;
  toX: number;
  toY: number;
  dir: 1 | -1;
}) {
  const edge = x + dir * HALF;
  const arrive = toX - dir * HALF;
  const bend = (edge + arrive) / 2;
  return (
    <path
      d={`M${edge},${yA} H${bend} M${edge},${yB} H${bend} M${bend},${yA} V${yB} M${bend},${toY} H${arrive}`}
      fill="none"
      stroke="var(--color-grid)"
      strokeWidth={2}
    />
  );
}

/** A slot nobody has reached: the same diamond, empty. */
const Empty = ({ cx, cy }: { cx: number; cy: number }) => (
  <rect
    x={cx - SIDE / 2}
    y={cy - SIDE / 2}
    width={SIDE}
    height={SIDE}
    transform={`rotate(45 ${cx} ${cy})`}
    fill="var(--color-surface-2)"
    stroke="var(--color-grid)"
    strokeWidth={2}
  />
);

/**
 * One club. The diamond carries the club's colour at a low enough alpha that
 * its own logo still reads on top of it — MLB prints a white cap logo on
 * solid colour, and the colour logo this CDN serves would disappear into it.
 */
function Club({
  cx,
  cy,
  seed,
  badge,
  odds,
}: {
  cx: number;
  cy: number;
  seed: Seed;
  /** Which corner the seed number sits on — away from the bracket's centre. */
  badge: 1 | -1;
  odds?: number;
}) {
  const color = teamColor(seed.team.id);
  const short = nickname(seed.team.name, seed.team.city);
  const record = `${seed.team.wins}-${seed.team.losses}`;
  return (
    <a href={teamHref(seed.team.id, seed.team.name)}>
      <title>
        {`${short} · ${seed.seed} seed · ${record}${
          odds !== undefined ? ` · ${(odds * 100).toFixed(1)}% to win the World Series` : ""
        }`}
      </title>
      <rect
        x={cx - SIDE / 2}
        y={cy - SIDE / 2}
        width={SIDE}
        height={SIDE}
        transform={`rotate(45 ${cx} ${cy})`}
        fill={color}
        fillOpacity={0.14}
        stroke={color}
        strokeWidth={2}
      />
      <image
        href={teamLogo(seed.team.id)}
        x={cx - 19}
        y={cy - 19}
        width={38}
        height={38}
        preserveAspectRatio="xMidYMid meet"
      />
      {/* The seed, on the outward corner, so it never sits over a connector. */}
      <circle
        cx={cx + badge * 28}
        cy={cy - 28}
        r={11}
        fill="var(--color-bg)"
        stroke={color}
        strokeWidth={2}
      />
      <text
        x={cx + badge * 28}
        y={cy - 28}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={12}
        fontWeight="bold"
        fill="var(--color-ink)"
      >
        {seed.seed}
      </text>
      <text
        x={cx}
        y={cy + HALF + 13}
        textAnchor="middle"
        fontSize={10}
        fill="var(--color-ink-2)"
      >
        {short}
        <tspan dx={5} fill="var(--color-ink-3)">
          {record}
        </tspan>
        {odds !== undefined && (
          <tspan dx={5} fill="var(--color-accent)">
            {`${(odds * 100).toFixed(1)}%`}
          </tspan>
        )}
      </text>
    </a>
  );
}

/** A round's name down the middle of its column, and how long it runs. */
const RoundLabel = ({
  x,
  title,
  best,
  size = 15,
}: {
  x: number;
  title: string;
  best: number;
  /** Smaller for the long wild-card name, which is centred on the outermost
   *  column and would otherwise overhang the edge of the canvas. */
  size?: number;
}) => (
  <>
    <text
      x={x}
      y={MID}
      textAnchor="middle"
      fontSize={size}
      fontWeight="bold"
      letterSpacing={size >= 15 ? 2 : 1.5}
      fill="var(--color-ink)"
    >
      {title}
    </text>
    <text
      x={x}
      y={LABEL_Y}
      textAnchor="middle"
      fontSize={10}
      letterSpacing={1.5}
      fill="var(--color-ink-3)"
    >
      {`BEST OF ${best}`}
    </text>
  </>
);

/* ── The bracket ────────────────────────────────────────────────────── */

/** One league's eleven positions, left half or right half. */
function Half({
  seeds,
  league,
  dir,
  ws,
}: {
  seeds: Seed[];
  league: string;
  dir: 1 | -1;
  ws: Map<number, number>;
}) {
  const at = (i: number) => (dir === 1 ? COL[i] : mirror(COL[i]));
  const { wc } = leagueBracket(seeds);
  const odds = (s: Seed) => ws.get(s.team.id);

  /* Top group is the 3/6 series and the 2 seed that meets its winner; bottom
     is 4/5 and the 1 seed. MLB doesn't reseed, and that pairing is the whole
     of what "doesn't reseed" means on a drawn bracket. */
  const groups = [
    {
      pair: wc[0],
      bye: seeds[1],
      wcWinner: rows.wcWinnerTop,
      byeRow: rows.byeTop,
      ds: dsTop,
    },
    {
      pair: wc[1],
      bye: seeds[0],
      wcWinner: rows.wcWinnerBottom,
      byeRow: rows.byeBottom,
      ds: dsBottom,
    },
  ];

  return (
    <>
      {groups.map((g, i) => {
        const upper = g.wcWinner - WC_GAP;
        const lower = g.wcWinner + WC_GAP;
        const home = isSeeded(g.pair.home) ? g.pair.home.seed : null;
        const away = isSeeded(g.pair.away) ? g.pair.away.seed : null;
        return (
          <g key={i}>
            <Elbow x={at(0)} yA={upper} yB={lower} toX={at(1)} toY={g.wcWinner} dir={dir} />
            <Elbow x={at(1)} yA={g.wcWinner} yB={g.byeRow} toX={at(2)} toY={g.ds} dir={dir} />
            {/* The higher seed number goes on top, as every bracket prints it. */}
            {away && <Club cx={at(0)} cy={upper} seed={away} badge={-dir as 1 | -1} odds={odds(away)} />}
            {home && <Club cx={at(0)} cy={lower} seed={home} badge={-dir as 1 | -1} odds={odds(home)} />}
            <Empty cx={at(1)} cy={g.wcWinner} />
            <Club cx={at(1)} cy={g.byeRow} seed={g.bye} badge={-dir as 1 | -1} odds={odds(g.bye)} />
            <Empty cx={at(2)} cy={g.ds} />
          </g>
        );
      })}

      <Elbow x={at(2)} yA={dsTop} yB={dsBottom} toX={at(3)} toY={MID} dir={dir} />
      <Empty cx={at(3)} cy={MID} />

      <RoundLabel x={at(0)} title={`${abbr(league)} WILD CARD`} best={3} size={13} />
      <RoundLabel x={at(1)} title={`${abbr(league)}DS`} best={5} />
      <RoundLabel x={at(2)} title={`${abbr(league)}CS`} best={7} />
    </>
  );
}

export default function PlayoffBracket({
  divisions,
  odds = [],
  seeded = false,
}: {
  divisions: Division[];
  /** The simulation, when it is up — the figure under each club. */
  odds?: TeamOdds[];
  /** The field is final rather than a projection off the standings. */
  seeded?: boolean;
}) {
  const field = seedField(divisions);
  const ws = new Map(odds.map((t) => [t.team_id, t.win_world_series]));

  if (field.length < 2 || field.some((f) => f.seeds.length < 6))
    return (
      <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
        NOT ENOUGH OF A SEASON PLAYED TO SEED A BRACKET
      </p>
    );

  const [al, nl] = field;
  /* The two the simulation likes most — the one line on the bracket that has
     nothing to seed it from, since no club has played its way there yet. */
  const favourite = (seeds: Seed[]) =>
    [...seeds].sort((a, b) => (ws.get(b.team.id) ?? 0) - (ws.get(a.team.id) ?? 0))[0]
      ?.team;

  return (
    <div className="space-y-2">
      {/* Scrolled rather than shrunk on a narrow screen: a bracket squeezed
          to phone width is a diagram of nothing. */}
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[62rem]"
          role="img"
          aria-label={`${seeded ? "" : "Projected "}postseason bracket`}
        >
          <Half seeds={al.seeds} league={al.league} dir={1} ws={ws} />
          <Half seeds={nl.seeds} league={nl.league} dir={-1} ws={ws} />

          {/* The two pennant winners meet in the middle. The name sits above
              the line rather than in a panel on it: a panel wide enough to
              hold "WORLD SERIES" covers both slots it is joining. */}
          <path
            d={`M${COL[3] + HALF},${MID} H${mirror(COL[3]) - HALF}`}
            fill="none"
            stroke="var(--color-grid)"
            strokeWidth={2}
          />
          <text
            x={W / 2}
            y={MID - 52}
            textAnchor="middle"
            fontSize={16}
            fontWeight="bold"
            letterSpacing={2}
            fill="var(--color-ink)"
          >
            WORLD SERIES
          </text>
          <text
            x={W / 2}
            y={MID + 50}
            textAnchor="middle"
            fontSize={10}
            letterSpacing={1.5}
            fill="var(--color-ink-3)"
          >
            BEST OF 7
          </text>
          {ws.size > 0 && (
            <text
              x={W / 2}
              y={MID + 74}
              textAnchor="middle"
              fontSize={10}
              letterSpacing={1}
              fill="var(--color-ink-3)"
            >
              {`MOST LIKELY: ${nickname(
                favourite(al.seeds)?.name ?? "",
                favourite(al.seeds)?.city ?? "",
              )} v ${nickname(
                favourite(nl.seeds)?.name ?? "",
                favourite(nl.seeds)?.city ?? "",
              )}`}
            </text>
          )}
        </svg>
      </div>
      <p className="text-[10px] leading-relaxed tracking-wider text-ink-3">
        {seeded
          ? "The postseason field."
          : "Projected seeding — the field as the standings have it today, not a result."}{" "}
        Three division winners seed 1-3 by record, the three best clubs left
        take 4-6, and the top two sit out the wild-card round. MLB does not
        reseed: the 1 seed draws the 4/5 winner and the 2 seed the 3/6 winner.
        {ws.size > 0 && " The figure under each club is its odds of winning the World Series."}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] tracking-wider text-ink-3">
        {field.map((f) => (
          <span key={f.leagueId}>
            {f.league.toUpperCase()}:{" "}
            {f.seeds
              .map((s) => `${s.seed} ${nickname(s.team.name, s.team.city)}`)
              .join(" · ")}
          </span>
        ))}
      </div>
    </div>
  );
}

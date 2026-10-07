import Link from "next/link";
import { connection } from "next/server";
import { cache, Suspense } from "react";
import PlayerSearch from "@/components/landing/PlayerSearch";
import AccessCta from "@/components/landing/AccessCta";
import { Card } from "@/components/mlb/TopPerformers";
import SprayChart from "@/components/mlb/SprayChart";
import ZonePlot, { type ZonePlotMode } from "@/components/dashboard/ZonePlot";
import Panel from "@/components/ui/Panel";
import { Skeleton, SkeletonPanel } from "@/components/ui/Skeleton";
import { searchPitchers, type Pitcher } from "@/lib/api";
import { getTopPerformers, type TopCard, type TopLeader } from "@/lib/advanced";
import { getHomePark, getSprayHits, seasonHitPitches } from "@/lib/spray";
import { getStrikeouts } from "@/lib/statcast";
import { seasonOf, todayPT } from "@/lib/mlb";

const FEATURES: {
  index: string;
  code: string;
  title: string;
  body: string;
  href?: string;
}[] = [
  {
    index: "01",
    code: "K-PROB",
    title: "STRIKEOUT PREDICTION",
    body: "Per-plate-appearance strikeout probability from pitch-level inputs: arsenal shape, whiff profiles, count leverage, and platoon splits.",
  },
  {
    index: "02",
    code: "MATCHUP",
    title: "BATTER VS PITCHER FORECAST",
    body: "Head-to-head projection built on shared pitch-type exposure — not thin historical BvP samples. Expected contact quality per pitch class.",
  },
  {
    index: "03",
    code: "QUERY",
    title: "CUSTOM STATCAST QUERIES",
    body: "Direct filtered access to the pitch warehouse: every tracked pitch with location, movement, spin, and batted-ball outcome fields. Ask for a slice in plain English.",
    href: "/ask",
  },
];

/*
 * Quick-entry chips seeded with the highest-workload pitchers. Streamed on
 * its own so the hero paints without waiting on the warehouse, and the page
 * still renders if the API is down (search reports its own error state).
 */
async function TopPitcherChips() {
  let topPitchers: Pitcher[] = [];
  try {
    topPitchers = await searchPitchers("", 5, 3600);
  } catch {
    /* API offline — hero renders without chips */
  }
  if (topPitchers.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-ink-3">HIGH-WORKLOAD:</span>
      {topPitchers.map((p) => (
        <Link
          key={p.player_id}
          href={`/pitcher/${p.player_id}`}
          className="border border-line px-2 py-1 text-ink-2 hover:border-accent hover:text-ink"
        >
          {p.full_name ?? `#${p.player_id}`}
        </Link>
      ))}
    </div>
  );
}

/* ── Side rails ─────────────────────────────────────────────────────── */

const SEASON = () => seasonOf(todayPT());

/*
 * A fresh draw of leader cards per visit. `connection()` keeps the shuffle
 * out of the prerender (the boards themselves stay fetch-cached an hour), and
 * `cache` hands both rails the same draw, so no card shows up twice.
 */
const draw = cache(async (): Promise<TopCard[]> => {
  await connection();
  let cards: TopCard[] = [];
  try {
    cards = await getTopPerformers(SEASON());
  } catch {
    /* Stats API down — the rails go empty, the page does not */
  }
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
});

function RailHeading({ label }: { label: string }) {
  return (
    <p className="text-[10px] tracking-[0.25em] text-ink-3">
      {SEASON()} {label}
    </p>
  );
}

/** The first `n` cards of this draw from the given bands. */
const take = (cards: TopCard[], groups: string[], n: number) =>
  cards.filter((c) => groups.includes(c.group)).slice(0, n);

function RailSkeleton({ cards }: { cards: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: cards }, (_, i) => (
        <SkeletonPanel key={i} delay={i * 0.1}>
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, r) => (
              <Skeleton key={r} className="h-3 w-full" delay={i * 0.1 + r * 0.05} />
            ))}
          </div>
        </SkeletonPanel>
      ))}
    </div>
  );
}

/** A leader off one of this draw's boards, and the board that put them there. */
type Pick = { card: TopCard; leader: TopLeader };

/** `n` different players off the band's boards, one random leader per board. */
function picks(cards: TopCard[], group: string, n: number): Pick[] {
  const out: Pick[] = [];
  for (const card of cards) {
    if (card.group !== group || card.leaders.length === 0) continue;
    const leader =
      card.leaders[Math.floor(Math.random() * card.leaders.length)];
    if (out.some((p) => p.leader.id === leader.id)) continue;
    out.push({ card, leader });
    if (out.length === n) break;
  }
  return out;
}

/* Hitters on the left (and one glove), arms on the right — leader cards,
   then two charts each, every chart streamed on its own: Savant's CSV is the
   slowest call on the page. */
async function LeftRail() {
  const cards = await draw();
  const shown = [
    ...take(cards, ["BATTING"], 2),
    ...take(cards, ["FIELDING", "CATCHER"], 1),
  ];
  const [a, b] = picks(cards, "BATTING", 2);
  if (shown.length === 0 && !a) return null;
  return (
    <div className="space-y-3">
      {shown.length > 0 && <RailHeading label="TOP PERFORMERS" />}
      {shown.map((c) => (
        <Card key={c.key} card={c} />
      ))}
      {a && <RailHeading label="TRENDING HITTERS" />}
      {a && (
        <Suspense fallback={<RailSkeleton cards={1} />}>
          <SprayTrend pick={a} />
        </Suspense>
      )}
      {b && (
        <Suspense fallback={<RailSkeleton cards={1} />}>
          <ZoneTrend pick={b} what="Hits" mode="heat" />
        </Suspense>
      )}
    </div>
  );
}

async function RightRail() {
  const cards = await draw();
  const shown = take(cards, ["PITCHING"], 2);
  const [a, b] = picks(cards, "PITCHING", 2);
  if (shown.length === 0 && !a) return null;
  return (
    <div className="space-y-3">
      {shown.length > 0 && <RailHeading label="TOP PERFORMERS" />}
      {shown.map((c) => (
        <Card key={c.key} card={c} />
      ))}
      {a && <RailHeading label="TRENDING PITCHERS" />}
      {a && (
        <Suspense fallback={<RailSkeleton cards={1} />}>
          <ZoneTrend pick={a} what="Strikeouts" mode="scatter" />
        </Suspense>
      )}
      {b && (
        <Suspense fallback={<RailSkeleton cards={1} />}>
          <ZoneTrend pick={b} what="Strikeouts" mode="heat" />
        </Suspense>
      )}
    </div>
  );
}

/** One trending chart: which board the player trends on, and their page. */
function Trend({ pick, children }: { pick: Pick; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] tracking-[0.25em] text-ink-3">
        #{pick.leader.rank} {pick.card.label}
      </p>
      {children}
      <Link
        href={`/player/${pick.leader.id}`}
        className="block text-right text-[10px] tracking-[0.2em] text-ink-3 hover:text-ink"
      >
        PLAYER PAGE →
      </Link>
    </div>
  );
}

/** Where a hitter's hits landed this season. */
async function SprayTrend({ pick }: { pick: Pick }) {
  const { id, name, teamId } = pick.leader;
  const [hits, park] = await Promise.all([
    getSprayHits(id, [SEASON()]),
    teamId ? getHomePark(teamId).catch(() => null) : null,
  ]);
  if (hits.length === 0) return null;
  return (
    <Trend pick={pick}>
      <SprayChart hits={hits} park={park} title={`${name} · ${SEASON()} Hits`} />
    </Trend>
  );
}

/** Where in the zone a hitter's hits, or a pitcher's strikeouts, were thrown. */
async function ZoneTrend({
  pick,
  what,
  mode,
}: {
  pick: Pick;
  what: "Hits" | "Strikeouts";
  mode: ZonePlotMode;
}) {
  const { id, name } = pick.leader;
  const pitches = await (
    what === "Hits" ? seasonHitPitches(id, SEASON()) : getStrikeouts(id, SEASON())
  ).catch(() => []);
  if (pitches.length === 0) return null;
  return (
    <Trend pick={pick}>
      <Panel title={`${name} · ${SEASON()} ${what}`}>
        <ZonePlot pitches={pitches} mode={mode} />
      </Panel>
    </Trend>
  );
}

/* ── Page ───────────────────────────────────────────────────────────── */

export default function LandingPage() {
  return (
    <div className="mx-auto grid max-w-[96rem] grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[17rem_minmax(0,1fr)_17rem] xl:grid-cols-[19rem_minmax(0,1fr)_19rem]">
      {/* ── CENTER ──────────────────────────────────────────── */}
      <section className="border border-line bg-bg lg:col-start-2 lg:row-start-1">
        <div className="border-b border-line px-6 py-10 sm:px-8">
          <p className="mb-3 text-xs tracking-[0.3em] text-ink-3">
            PITCH-LEVEL MLB ANALYTICS // STATCAST WAREHOUSE
          </p>
          <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            EVERY PITCH.
            <br />
            <span className="text-accent">MEASURED.</span> QUERYABLE.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-ink-2">
            Live game feeds, standings, playoff odds, Statcast leaderboards and
            pitch-level breakdowns. No narrative. Numbers.
          </p>
          <div className="mt-6 max-w-2xl">
            <PlayerSearch autoFocus />
            <Suspense fallback={null}>
              <TopPitcherChips />
            </Suspense>
          </div>
        </div>

        {/* ── FEATURES ──────────────────────────────────────── */}
        <h2 className="border-b border-line px-6 py-2 text-xs tracking-[0.3em] text-ink-3 sm:px-8">
          SYSTEM MODULES
        </h2>
        <ul className="divide-y divide-line border-b border-line">
          {FEATURES.map((f) => (
            <li key={f.code} className="flex gap-4 px-6 py-4 sm:px-8">
              <span className="text-xl font-bold text-ink-3">{f.index}</span>
              <div className="min-w-0 flex-1">
                <h3 className="flex flex-wrap items-baseline gap-2 text-sm font-bold tracking-wide">
                  {f.href ? (
                    <Link href={f.href} className="hover:text-accent">
                      {f.title} →
                    </Link>
                  ) : (
                    f.title
                  )}
                  <span className="border border-line px-1.5 py-0.5 text-[10px] font-normal tracking-widest text-ink-2">
                    {f.code}
                  </span>
                </h3>
                <p className="mt-1 text-xs leading-5 text-ink-2">{f.body}</p>
              </div>
            </li>
          ))}
        </ul>

        {/* ── ACCESS / AUTH CTA ─────────────────────────────── */}
        <div id="access" className="px-6 py-8 sm:px-8">
          <h2 className="text-xs tracking-[0.3em] text-ink-3">ACCESS</h2>
          <p className="mt-2 mb-5 text-xs leading-5 text-ink-2">
            Terminal access is gated. Request an operator account, or enter the
            dashboard read-only with the public dataset.
          </p>
          <AccessCta />
          <Link
            href="/dashboard"
            className="mt-4 inline-block border border-line px-4 py-2 text-xs text-ink-2 hover:border-accent hover:text-ink"
          >
            ENTER READ-ONLY →
          </Link>
        </div>
      </section>

      {/* ── RAILS ───────────────────────────────────────────── */}
      <aside className="lg:col-start-1 lg:row-start-1">
        <Suspense fallback={<RailSkeleton cards={3} />}>
          <LeftRail />
        </Suspense>
      </aside>
      <aside className="lg:col-start-3 lg:row-start-1">
        <Suspense fallback={<RailSkeleton cards={2} />}>
          <RightRail />
        </Suspense>
      </aside>
    </div>
  );
}

import Link from "next/link";
import { Suspense } from "react";
import PlayerSearch from "@/components/landing/PlayerSearch";
import AccessCta from "@/components/landing/AccessCta";
import { searchPitchers, type Pitcher } from "@/lib/api";

const FEATURES: {
  index: string;
  code: string;
  title: string;
  body: string;
  specs: string[];
  href?: string;
}[] = [
  {
    index: "01",
    code: "K-PROB",
    title: "STRIKEOUT PREDICTION",
    body: "Per-plate-appearance strikeout probability from pitch-level inputs: arsenal shape, whiff profiles, count leverage, and platoon splits.",
    specs: ["PITCH-LEVEL GRAIN", "COUNT-STATE PRIORS", "ROLLING FORM WINDOWS"],
  },
  {
    index: "02",
    code: "MATCHUP",
    title: "BATTER VS PITCHER FORECAST",
    body: "Head-to-head projection built on shared pitch-type exposure — not thin historical BvP samples. Expected contact quality per pitch class.",
    specs: ["ARSENAL × SWING MAP", "xWOBA BY PITCH CLASS", "PLATOON ADJUSTED"],
  },
  {
    index: "03",
    code: "QUERY",
    title: "CUSTOM STATCAST QUERIES",
    body: "Direct filtered access to the pitch warehouse: every tracked pitch with location, movement, spin, and batted-ball outcome fields. Ask for a slice in plain English.",
    specs: ["SQL-BACKED FACTS", "14-ZONE LOCATION GRID", "EXPORTABLE SLICES"],
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

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="border-x border-line">
        <div className="border-b border-line px-6 py-16 sm:px-10 sm:py-24">
          <p className="mb-4 text-xs tracking-[0.3em] text-ink-3">
            PITCH-LEVEL MLB ANALYTICS // STATCAST WAREHOUSE
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
            EVERY PITCH.
            <br />
            <span className="text-accent">MEASURED.</span> QUERYABLE.
          </h1>
          <p className="mt-6 max-w-xl text-sm leading-6 text-ink-2">
            Strike-zone plots, arsenal breakdowns, and matchup forecasts from a
            one-row-per-pitch Statcast fact table. No narrative. Numbers.
          </p>
          <div className="mt-10 max-w-2xl">
            <PlayerSearch autoFocus />
            <Suspense fallback={null}>
              <TopPitcherChips />
            </Suspense>
          </div>
        </div>

        {/* ── FEATURES ──────────────────────────────────────── */}
        <div className="border-b border-line">
          <h2 className="border-b border-line px-6 py-3 text-xs tracking-[0.3em] text-ink-3 sm:px-10">
            SYSTEM MODULES
          </h2>
          <div className="grid grid-cols-1 divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
            {FEATURES.map((f) => (
              <article key={f.code} className="flex flex-col gap-4 p-6 sm:p-8">
                <div className="flex items-baseline justify-between">
                  <span className="text-3xl font-bold text-ink-3">
                    {f.index}
                  </span>
                  <span className="border border-line px-2 py-0.5 text-[10px] tracking-widest text-ink-2">
                    {f.code}
                  </span>
                </div>
                <h3 className="text-sm font-bold tracking-wide">
                  {f.href ? (
                    <Link href={f.href} className="hover:text-accent">
                      {f.title} →
                    </Link>
                  ) : (
                    f.title
                  )}
                </h3>
                <p className="text-xs leading-5 text-ink-2">{f.body}</p>
                <ul className="mt-auto space-y-1 pt-2 text-[10px] tracking-wider text-ink-3">
                  {f.specs.map((s) => (
                    <li key={s}>+ {s}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>

        {/* ── ACCESS / AUTH CTA ─────────────────────────────── */}
        <div id="access" className="px-6 py-14 sm:px-10">
          <div className="max-w-2xl">
            <h2 className="text-xs tracking-[0.3em] text-ink-3">ACCESS</h2>
            <p className="mt-3 text-2xl font-bold tracking-tight">
              TERMINAL ACCESS IS GATED.
            </p>
            <p className="mt-2 mb-8 text-xs leading-5 text-ink-2">
              Request an operator account, or enter the dashboard read-only
              with the public dataset.
            </p>
            <AccessCta />
            <Link
              href="/dashboard"
              className="mt-4 inline-block border border-line px-4 py-2 text-xs text-ink-2 hover:border-accent hover:text-ink"
            >
              ENTER READ-ONLY →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

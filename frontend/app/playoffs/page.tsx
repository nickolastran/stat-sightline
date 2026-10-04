import type { Metadata } from "next";
import { Suspense } from "react";
import Panel from "@/components/ui/Panel";
import ParamTabs from "@/components/mlb/ParamTabs";
import SeasonSelect from "@/components/mlb/SeasonSelect";
import WildCard from "@/components/mlb/WildCard";
import PlayoffOddsTable, { TitleOdds } from "@/components/mlb/PlayoffOddsTable";
import PlayoffBracket from "@/components/mlb/PlayoffBracket";
import PostseasonSchedule from "@/components/mlb/PostseasonSchedule";
import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";
import { getStandings, getWildCard, seasonOf, todayPT } from "@/lib/mlb";
import { getPlayoffOdds, type PlayoffOdds } from "@/lib/api";
import { fieldSet, getPostseason, realSeeds, type PostSeries } from "@/lib/playoffs";

/*
 * October, three ways: what the simulation gives every club, the race for the
 * last berths as MLB ranks it, and the bracket those two arrive at.
 *
 * The odds are the one thing here served by our own API rather than MLB's, so
 * they are the one thing that can be missing — an unbuilt model or a stopped
 * service degrades that view to a notice, and the other two, which are MLB's
 * own standings, carry on. The bracket takes the odds as decoration when they
 * are there and seeds itself from the standings either way.
 *
 * Once MLB sets the field, October is no longer a projection: the odds of
 * making it give way to the odds of winning it all, a SCHEDULE of every
 * series joins, and the bracket fills in off MLB's own series.
 */

export const metadata: Metadata = {
  title: "Playoffs",
  description:
    "MLB playoff odds, the wild-card race, the postseason bracket and the series schedule — projected through September, live through October.",
};

/** The first season under the twelve-club bracket this page draws. */
const FIRST_SEASON = 2022;

const RACE = [
  { value: "odds", label: "PLAYOFF ODDS" },
  { value: "wildcard", label: "WILD CARD" },
  { value: "bracket", label: "BRACKET" },
];

/** Once the field is set: the same views, the odds now of the title, and the
 *  schedule of the series. */
const OCTOBER = [
  { value: "odds", label: "TITLE ODDS" },
  { value: "schedule", label: "SCHEDULE" },
  { value: "bracket", label: "BRACKET" },
  { value: "wildcard", label: "WILD CARD" },
];

type View = "odds" | "wildcard" | "bracket" | "schedule";

const pickView = (raw: string | undefined, views: { value: string }[]): View =>
  views.some((v) => v.value === raw) ? (raw as View) : "odds";

function pickSeason(raw: string | undefined, current: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= FIRST_SEASON && n <= current ? n : current;
}

/** The odds, or null — never a thrown error, so one dead service is one view. */
const oddsOrNull = (season: number): Promise<PlayoffOdds | null> =>
  getPlayoffOdds(season).catch(() => null);

const Unavailable = ({ what }: { what: string }) => (
  <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
    {what}
  </p>
);

async function Body({
  view,
  season,
  series,
}: {
  view: View;
  season: number;
  /** MLB's postseason series — empty until it has scheduled one. */
  series: PostSeries[];
}) {
  try {
    if (view === "wildcard")
      return <WildCard groups={await getWildCard(season)} />;

    if (view === "schedule") return <PostseasonSchedule series={series} />;

    if (view === "bracket") {
      const [divisions, odds] = await Promise.all([
        getStandings(season, "R"),
        oddsOrNull(season),
      ]);
      return (
        <PlayoffBracket
          divisions={divisions}
          odds={odds?.teams ?? []}
          seeded={season < seasonOf(todayPT())}
          series={series}
        />
      );
    }

    const [odds, divisions] = await Promise.all([
      oddsOrNull(season),
      fieldSet(series) ? getStandings(season, "R") : null,
    ]);
    if (!odds)
      return (
        <Unavailable what="PLAYOFF ODDS UNAVAILABLE — THE PROJECTION SERVICE IS NOT RUNNING, OR ITS MODEL HAS NOT BEEN BUILT" />
      );
    const seeds = divisions && realSeeds(series, divisions);
    if (seeds)
      return (
        <TitleOdds
          seeds={seeds}
          series={series}
          teams={odds.teams}
          simulations={odds.simulations}
          asOf={odds.as_of}
          postseason={!!odds.postseason}
        />
      );
    return (
      <PlayoffOddsTable
        teams={odds.teams}
        simulations={odds.simulations}
        asOf={odds.as_of}
      />
    );
  } catch {
    return <Unavailable what="UNAVAILABLE — MLB API UNREACHABLE" />;
  }
}

export default async function PlayoffsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; season?: string }>;
}) {
  const sp = await searchParams;
  const current = seasonOf(todayPT());
  const season = pickSeason(sp.season, current);
  /* A dead MLB API reads as no postseason: the race views still answer. */
  const series = await getPostseason(season).catch(() => [] as PostSeries[]);
  const views = fieldSet(series) ? OCTOBER : RACE;
  const view = pickView(sp.view, views);

  return (
    <div className="mx-auto max-w-[100rem] space-y-3 p-3">
      <Panel
        heading="h1"
        title="Playoffs"
        right={
          <SeasonSelect value={season} first={FIRST_SEASON} last={current} />
        }
      >
        <div className="mb-3 flex">
          <ParamTabs
            param="view"
            ariaLabel="Playoff view"
            size="lg"
            value={view}
            options={views}
          />
        </div>
        <Suspense
          key={`${view}-${season}`}
          fallback={
            view === "bracket" || view === "schedule" ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-7">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} className="h-40 w-full" delay={i * 0.05} />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <SkeletonTable key={i} rows={5} delay={i * 0.1} />
                ))}
              </div>
            )
          }
        >
          <Body view={view} season={season} series={series} />
        </Suspense>
      </Panel>
    </div>
  );
}

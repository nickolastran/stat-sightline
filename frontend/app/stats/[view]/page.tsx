import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import Panel from "@/components/ui/Panel";
import SeasonSelect from "@/components/mlb/SeasonSelect";
import AdvancedTable from "@/components/mlb/AdvancedTable";
import CustomFilterBar from "@/components/mlb/CustomFilterBar";
import TopPerformers from "@/components/mlb/TopPerformers";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { getClubs, seasonOf, todayPT, type Club } from "@/lib/mlb";
import {
  ADV_FIRST_SEASON,
  ADV_VIEWS,
  advCols,
  CUSTOM_GROUPS,
  findAdvView,
  getAdvBoard,
  getCustomBoard,
  getTopPerformers,
  hasAllYears,
  pickAdvSeason,
  pickCustomQuery,
  type AdvView,
  type CustomQuery,
} from "@/lib/advanced";

/*
 * The advanced section: four boards of everything the standard line leaves
 * out, and the leader cards over them.
 *
 * Same shape as the league sections — one route per board, the season in the
 * query string, the body streamed in behind a skeleton — but the data is
 * stitched from two sources rather than one, so a Savant board that stops
 * answering costs its own columns and nothing else. Only a dead Stats API
 * degrades the page to a notice.
 */

export function generateStaticParams() {
  return ADV_VIEWS.map((v) => ({ view: v.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ view: string }>;
}): Promise<Metadata> {
  const { view } = await params;
  const found = findAdvView(view);
  return {
    title: found ? `${found.title} — STAT//SIGHTLINE` : "STAT//SIGHTLINE",
  };
}

/** The four boards and the cards, as the row of tabs over each of them. */
function Views({ active, season }: { active: AdvView; season: number }) {
  return (
    <div className="mb-3 flex flex-wrap gap-px">
      {ADV_VIEWS.map((v) => (
        <Link
          key={v.id}
          href={`/stats/${v.id}?season=${season}`}
          aria-current={v.id === active ? "page" : undefined}
          className={`flex h-7 items-center border px-2 text-[10px] tracking-wider ${
            v.id === active
              ? "border-accent bg-accent/10 text-ink"
              : "border-line text-ink-2 hover:border-accent hover:text-ink"
          }`}
        >
          {v.label}
        </Link>
      ))}
    </div>
  );
}

/**
 * Every tracked season, as the index the hover box's ALL opens. The box
 * itself lists six; a reader after 2016 needs somewhere that lists the rest.
 */
function SeasonIndex({ view, current }: { view: AdvView; current: number }) {
  const years = Array.from(
    { length: current - ADV_FIRST_SEASON + 1 },
    (_, i) => current - i,
  );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-px sm:grid-cols-6 lg:grid-cols-8">
        {years.map((y) => (
          <Link
            key={y}
            href={`/stats/${view}?season=${y}`}
            className="flex h-9 items-center justify-center border border-line text-xs tabular-nums text-ink-2 hover:border-accent hover:text-ink"
          >
            {y}
          </Link>
        ))}
      </div>
      <p className="text-[10px] tracking-wider text-ink-3">
        Every season Statcast covers. Bat tracking begins in 2023 and outs
        above average in 2016 — an earlier board simply drops those columns.
      </p>
    </div>
  );
}

async function Body({
  view,
  season,
  sort,
  custom,
}: {
  view: AdvView;
  season: number;
  sort?: string;
  /** What the custom board was asked for — unused by every other view. */
  custom: CustomQuery;
}) {
  try {
    if (view === "top")
      return <TopPerformers cards={await getTopPerformers(season)} />;
    if (view === "custom")
      return (
        <AdvancedTable
          board={await getCustomBoard(season, custom)}
          initial={custom.sort}
        />
      );
    return <AdvancedTable board={await getAdvBoard(view, season)} initial={sort} />;
  } catch {
    return (
      <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
        UNAVAILABLE — MLB API UNREACHABLE
      </p>
    );
  }
}

export default async function AdvancedPage({
  params,
  searchParams,
}: {
  params: Promise<{ view: string }>;
  searchParams: Promise<{
    season?: string;
    sort?: string;
    group?: string;
    cols?: string;
    league?: string;
    div?: string;
    team?: string;
    pos?: string;
    min?: string;
  }>;
}) {
  const { view } = await params;
  const found = findAdvView(view);
  if (!found) notFound();

  const sp = await searchParams;
  const current = seasonOf(todayPT());
  const season = pickAdvSeason(sp.season, current);
  /* Only the player boards offer the index, so ?season=all elsewhere is just
     a season that doesn't parse — it lands on the running one. */
  const index = sp.season === "all" && hasAllYears(found.id);
  /* A card links in already sorted; anything else in ?sort= is ignored
     rather than leaving the table under a heading it isn't ordered by. */
  const custom = found.id === "custom";
  const clubs: Club[] = custom ? await getClubs().catch(() => []) : [];
  const query = pickCustomQuery(sp, new Set(clubs.map((c) => String(c.id))));
  const sort =
    found.id === "top" || custom
      ? undefined
      : advCols(found.id).find((c) => c.key === sp.sort)?.key;

  return (
    <div className="mx-auto max-w-[110rem] space-y-3 p-3">
      <Panel
        title={index ? `${found.title} — BY SEASON` : found.title}
        right={
          index ? (
            <span className="text-[10px] text-ink-3">
              {ADV_FIRST_SEASON}–{current}
            </span>
          ) : custom ? (
            /* The custom board's season lives in its own filter bar, beside
               everything else it is filtered by — and the column count on the
               bar that owns the columns. */
            <span className="text-[10px] text-ink-3">
              {CUSTOM_GROUPS.find((g) => g.value === query.group)?.label}
            </span>
          ) : (
            <SeasonSelect
              value={season}
              first={ADV_FIRST_SEASON}
              last={current}
            />
          )
        }
      >
        <Views active={found.id} season={season} />
        {custom && (
          <CustomFilterBar
            query={query}
            season={season}
            current={current}
            clubs={clubs}
          />
        )}
        {index ? (
          <SeasonIndex view={found.id} current={current} />
        ) : (
          <Suspense
            key={`${found.id}-${season}-${sort ?? ""}-${Object.values(query).join("-")}`}
            fallback={
              found.id === "top" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <SkeletonTable key={i} rows={5} delay={i * 0.08} />
                  ))}
                </div>
              ) : (
                <SkeletonTable rows={16} heading={false} />
              )
            }
          >
            <Body
              view={found.id}
              season={season}
              sort={sort}
              custom={query}
            />
          </Suspense>
        )}
      </Panel>
    </div>
  );
}

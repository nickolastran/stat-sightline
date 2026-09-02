import {
  Skeleton,
  SkeletonPanel,
  SkeletonTable,
} from "@/components/ui/Skeleton";

/*
 * The loading shape of each of a live game's three views, in one place: the
 * route's `loading.tsx` and the Suspense boundary the page streams its pane
 * behind both render this, so a placeholder can't drift from the thing that
 * lands on top of it. Same reasoning as SectionSkeleton — a placeholder is
 * only useful if it is the shape of what replaces it.
 */

/** The strip the box score and the play log carry: two names and the count. */
const Situation = () => (
  <div className="flex flex-wrap items-center justify-between gap-6 border border-line bg-surface px-3 py-2">
    {[0, 1].map((i) => (
      <div key={i} className="space-y-1">
        <Skeleton className="h-2 w-14" delay={i * 0.06} />
        <Skeleton className="h-3.5 w-32" delay={i * 0.06 + 0.04} />
        <Skeleton className="h-2 w-24" delay={i * 0.06 + 0.08} />
      </div>
    ))}
    <div className="space-y-1">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-2 w-16" delay={0.14 + i * 0.05} />
      ))}
    </div>
    <Skeleton className="h-7 w-10" delay={0.3} />
  </div>
);

/** One game of the season series: the header line and the two clubs. */
const SeriesRow = ({ delay = 0 }: { delay?: number }) => (
  <div className="space-y-1 border border-line bg-bg px-2 py-1.5">
    <Skeleton className="h-2 w-full" delay={delay} />
    {[0, 1].map((i) => (
      <div key={i} className="flex items-center gap-1.5">
        <Skeleton className="h-4 w-4 shrink-0 rounded-full" delay={delay + i * 0.05} />
        <Skeleton className="h-3 flex-1" delay={delay + i * 0.05} />
      </div>
    ))}
  </div>
);

/** One half-inning of the play log: its heading and a few plays. */
const HalfInning = ({ delay = 0 }: { delay?: number }) => (
  <div className="border border-line">
    <div className="border-b border-line px-2 py-1.5">
      <Skeleton className="h-2 w-full" delay={delay} />
    </div>
    <div className="space-y-1.5 p-2">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-3 w-full" delay={delay + i * 0.06} />
      ))}
    </div>
  </div>
);

export default function GameSkeleton({ tab }: { tab: string }) {
  if (tab === "box")
    return (
      <div className="mx-auto max-w-5xl space-y-2">
        <Situation />
        <Skeleton className="h-7 w-24" delay={0.1} />
        <SkeletonTable rows={9} delay={0.15} />
        <SkeletonTable rows={5} delay={0.3} />
        <SkeletonPanel delay={0.4}>
          <div className="space-y-1">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-6 w-full" delay={0.45 + i * 0.06} />
            ))}
          </div>
        </SkeletonPanel>
      </div>
    );

  if (tab === "plays")
    return (
      <div className="mx-auto max-w-5xl space-y-2">
        <Situation />
        <Skeleton className="h-6 w-56" delay={0.1} />
        {[0, 1, 2, 3].map((i) => (
          <HalfInning key={i} delay={0.15 + i * 0.1} />
        ))}
      </div>
    );

  /* The gamecast, in the three columns it lands in. */
  return (
    <div className="grid grid-cols-1 gap-2 min-[1440px]:grid-cols-[28rem_minmax(0,1fr)_28rem]">
      <div className="space-y-2">
        <SkeletonPanel>
          <div className="space-y-2">
            <Skeleton className="h-6 w-36" />
            <SkeletonTable rows={6} heading={false} delay={0.08} />
          </div>
        </SkeletonPanel>
        <SkeletonPanel delay={0.12}>
          <div className="space-y-2">
            <Skeleton className="h-28 w-full" delay={0.16} />
            <Skeleton className="h-[4.25rem] w-full" delay={0.22} />
          </div>
        </SkeletonPanel>
      </div>

      <div className="space-y-2">
        <SkeletonPanel delay={0.06}>
          <div className="space-y-3">
            <div className="flex flex-wrap justify-between gap-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-2 w-14" delay={0.1 + i * 0.05} />
                  <Skeleton className="h-3.5 w-32" delay={0.14 + i * 0.05} />
                  <Skeleton className="h-2 w-24" delay={0.18 + i * 0.05} />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-4 border-t border-grid pt-3">
              <div className="space-y-3">
                <Skeleton className="h-2.5 w-48" delay={0.24} />
                {/* The zone plot, at the aspect it renders at. */}
                <Skeleton className="h-[14rem] w-[15rem]" delay={0.28} />
                <Skeleton className="h-7 w-48" delay={0.34} />
              </div>
              <div className="min-w-[13rem] flex-1 space-y-1">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" delay={0.3 + i * 0.06} />
                ))}
              </div>
            </div>
          </div>
        </SkeletonPanel>
        <SkeletonPanel delay={0.4}>
          <div className="space-y-1">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-6 w-full" delay={0.44 + i * 0.06} />
            ))}
          </div>
        </SkeletonPanel>
      </div>

      <div className="space-y-2">
        <SkeletonPanel delay={0.1}>
          <div className="space-y-2">
            <Skeleton className="h-2 w-28" delay={0.14} />
            <div className="space-y-px">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <SeriesRow key={i} delay={0.18 + i * 0.06} />
              ))}
            </div>
          </div>
        </SkeletonPanel>
        <SkeletonPanel delay={0.2} right>
          <div className="space-y-2">
            <SkeletonTable rows={5} heading={false} delay={0.26} />
            <Skeleton className="h-6 w-full" delay={0.4} />
          </div>
        </SkeletonPanel>
      </div>
    </div>
  );
}

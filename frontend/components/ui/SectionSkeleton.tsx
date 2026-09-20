import {
  Skeleton,
  SkeletonGameCard,
  SkeletonTable,
} from "@/components/ui/Skeleton";

/*
 * The loading shape of each league section, in one place: the route's
 * `loading.tsx` and the Suspense fallback each section streams behind both
 * render this, so a placeholder can't drift from the thing that lands on top
 * of it. A placeholder is only useful if it is the shape of what replaces it —
 * stacked division tables, one wide team table, a grid of leader cards, or a
 * slate of matchup rows.
 */

/** The controls row (a segmented toggle) each section renders above its body. */
const Controls = ({ width = "w-40" }: { width?: string }) => (
  <div className="flex justify-end">
    <Skeleton className={`h-6 ${width}`} />
  </div>
);

/** One probable-pitchers card: two starters, each a headshot and two boxes. */
const ProbableRow = ({ delay = 0 }: { delay?: number }) => (
  <div className="border border-line bg-bg p-3">
    <Skeleton className="mx-auto mb-3 h-3 w-48" delay={delay} />
    <div className="grid gap-3 md:grid-cols-2">
      {[0, 1].map((s) => (
        <div key={s} className="space-y-2">
          <div className="flex items-center gap-3">
            <Skeleton className="h-14 w-14 shrink-0" delay={delay + s * 0.05} />
            <Skeleton className="h-4 flex-1" delay={delay + s * 0.05} />
          </div>
          <Skeleton className="h-12 w-full" delay={delay + s * 0.05} />
          <Skeleton className="h-12 w-full" delay={delay + s * 0.05} />
        </div>
      ))}
    </div>
  </div>
);

export default function SectionSkeleton({ section }: { section: string }) {
  switch (section) {
    case "standings":
      return (
        <div className="space-y-3">
          <Controls />
          {[0, 1, 2].map((i) => (
            <SkeletonTable key={i} rows={5} delay={i * 0.12} />
          ))}
        </div>
      );

    case "wildcard":
      return (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <SkeletonTable key={i} rows={12} delay={i * 0.12} />
          ))}
        </div>
      );

    case "teams":
      return (
        <div className="space-y-3">
          <Controls width="w-32" />
          <SkeletonTable rows={12} heading={false} />
        </div>
      );

    case "players":
      return (
        <div className="space-y-3">
          <Controls width="w-56" />
          <SkeletonTable rows={14} heading={false} />
        </div>
      );

    case "abs":
      return <SkeletonTable rows={16} heading={false} />;

    case "leaders":
      return (
        <div className="space-y-3">
          <Controls width="w-32" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonTable key={i} rows={5} delay={i * 0.08} avatar />
            ))}
          </div>
        </div>
      );

    case "gamefeed":
      return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonTable key={i} rows={5} delay={i * 0.08} />
          ))}
        </div>
      );

    case "scoreboard":
      return (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <SkeletonGameCard key={i} delay={i * 0.06} />
          ))}
        </div>
      );

    case "probables":
      return (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <ProbableRow key={i} delay={i * 0.06} />
          ))}
        </div>
      );

    default:
      return <Skeleton className="h-64 w-full" />;
  }
}

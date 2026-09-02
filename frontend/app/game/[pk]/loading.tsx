import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";

/*
 * Box score placeholder, shaped like what lands on top of it: the two-team
 * header, the linescore strip, the team toggle, then the batting and pitching
 * tables. Same nine-column tables in both, so the reload settles into place
 * instead of jumping.
 */

/** One side of the header — logo, abbr over record, score. */
const HeaderSide = ({ delay = 0 }: { delay?: number }) => (
  <div className="flex items-center gap-2">
    <Skeleton className="h-7 w-7 rounded-full" delay={delay} />
    <div className="space-y-1">
      <Skeleton className="h-3 w-10" delay={delay} />
      <Skeleton className="h-2 w-8" delay={delay + 0.05} />
    </div>
    <Skeleton className="ml-1 h-5 w-5" delay={delay + 0.05} />
  </div>
);

export default function GameLoading() {
  return (
    <div className="mx-auto max-w-[96rem] p-3">
      <div className="border border-line bg-surface">
        <div className="flex items-center gap-4 border-b border-line px-3 py-2">
          <HeaderSide />
          <HeaderSide delay={0.08} />
          <Skeleton className="ml-auto h-2.5 w-24" delay={0.16} />
        </div>
        <div className="space-y-2 p-3">
          {/* Linescore: label column plus nine innings and R/H/E. */}
          <div className="border border-line bg-bg">
            <div className="border-b border-line px-2 py-2">
              <Skeleton className="h-2.5 w-full" delay={0.1} />
            </div>
            {[0, 1].map((r) => (
              <div key={r} className="px-2 py-2">
                <Skeleton className="h-3 w-full" delay={0.15 + r * 0.08} />
              </div>
            ))}
          </div>
          <Skeleton className="h-7 w-40" delay={0.2} />
          <SkeletonTable rows={9} delay={0.25} />
          <SkeletonTable rows={5} delay={0.35} />
        </div>
      </div>
    </div>
  );
}

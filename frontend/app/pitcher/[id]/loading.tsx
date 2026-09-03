import { Skeleton, SkeletonPanel, SkeletonTiles, SkeletonTable } from "@/components/ui/Skeleton";

/* Instant shell for the pitch-analysis page, which blocks on the full
   pitch payload — filter rail, summary tiles, zone plot, arsenal table. */
export default function PitcherLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-3 p-3">
      <div className="flex items-center justify-between border border-line bg-surface px-3 py-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-72" delay={0.15} />
      </div>
      <SkeletonTiles />
      <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
        <SkeletonPanel>
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-6 w-full" delay={i * 0.08} />
            ))}
          </div>
        </SkeletonPanel>
        <SkeletonPanel delay={0.08} right>
          <Skeleton className="mx-auto h-[360px] w-full max-w-[420px]" delay={0.12} />
        </SkeletonPanel>
      </div>
      <SkeletonPanel delay={0.16}>
        <SkeletonTable rows={6} heading={false} delay={0.2} />
      </SkeletonPanel>
    </div>
  );
}

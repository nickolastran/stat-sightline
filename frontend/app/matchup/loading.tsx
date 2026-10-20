import { Skeleton, SkeletonPanel, SkeletonTiles, SkeletonTable } from "@/components/ui/Skeleton";

/* Instant shell while the season boards and the head-to-head load. */
export default function MatchupLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-3 p-3">
      <div className="flex items-center justify-between border border-line bg-surface px-3 py-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-72" delay={0.15} />
      </div>
      <SkeletonTiles />
      <SkeletonPanel delay={0.08}>
        <SkeletonTable />
      </SkeletonPanel>
    </div>
  );
}

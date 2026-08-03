import {
  Skeleton,
  SkeletonPanel,
  SkeletonTiles,
} from "@/components/ui/Skeleton";
import SectionSkeleton from "@/components/ui/SectionSkeleton";

/*
 * Motion skeleton for the overview during a client-side navigation, before
 * the page shell itself is flushed. Mirrors the real layout — header, metric
 * row, probables, standings, leaders — using the same section placeholders the
 * page's own Suspense boundaries stream behind.
 */
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-3 p-3">
      {/* header */}
      <div className="flex items-center justify-between border border-line bg-surface px-3 py-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-72" delay={0.15} />
      </div>

      <SkeletonTiles />

      <SkeletonPanel>
        <SectionSkeleton section="probables" />
      </SkeletonPanel>

      <SkeletonPanel delay={0.08}>
        <SectionSkeleton section="standings" />
      </SkeletonPanel>

      <SkeletonPanel delay={0.16}>
        <SectionSkeleton section="leaders" />
      </SkeletonPanel>
    </div>
  );
}

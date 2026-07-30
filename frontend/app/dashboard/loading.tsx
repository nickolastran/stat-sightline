import {
  Skeleton,
  SkeletonPanel,
  SkeletonTable,
} from "@/components/ui/Skeleton";

/*
 * Motion skeleton for the overview while the server fetches standings /
 * leaders / probables. Mirrors the real layout (header, metric row, stacked
 * standings tables, leader card grid) so the page has shape immediately and
 * reads as loading, not stuck.
 */
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-3 p-3">
      {/* header */}
      <div className="flex items-center justify-between border border-line bg-surface px-3 py-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-72" delay={0.15} />
      </div>

      {/* metric row */}
      <div className="grid grid-cols-2 gap-px sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border border-line bg-surface p-3">
            <Skeleton className="h-2.5 w-20" delay={i * 0.08} />
            <Skeleton className="mt-3 h-6 w-10" delay={i * 0.08 + 0.05} />
            <Skeleton className="mt-3 h-2 w-16" delay={i * 0.08 + 0.1} />
          </div>
        ))}
      </div>

      {/* standings — scope toggle over stacked division tables */}
      <SkeletonPanel>
        <div className="space-y-3">
          <div className="flex justify-end">
            <Skeleton className="h-6 w-40" />
          </div>
          {[0, 1, 2].map((i) => (
            <SkeletonTable key={i} rows={5} delay={i * 0.12} />
          ))}
        </div>
      </SkeletonPanel>

      {/* stat leaders — group toggle over a grid of category cards */}
      <SkeletonPanel delay={0.1}>
        <div className="space-y-3">
          <div className="flex justify-end">
            <Skeleton className="h-6 w-32" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonTable key={i} rows={5} delay={i * 0.08} />
            ))}
          </div>
        </div>
      </SkeletonPanel>
    </div>
  );
}

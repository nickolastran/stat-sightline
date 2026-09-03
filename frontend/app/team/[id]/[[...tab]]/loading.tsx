import { Skeleton, SkeletonPanel, SkeletonTable } from "@/components/ui/Skeleton";

/* Instant shell for a team page: identity strip, tab rail, section body. */
export default function TeamLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-3 p-3">
      <div className="flex items-center gap-3 border border-line bg-surface px-3 py-3">
        <Skeleton className="h-14 w-14 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-48" delay={0.08} />
          <Skeleton className="h-2.5 w-64" delay={0.12} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border border-line bg-surface px-3 py-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-5 w-20" delay={i * 0.05} />
        ))}
      </div>
      <SkeletonPanel delay={0.12} right>
        <SkeletonTable rows={8} heading={false} delay={0.16} />
      </SkeletonPanel>
    </div>
  );
}

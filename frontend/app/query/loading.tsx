import { Skeleton, SkeletonPanel, SkeletonTable } from "@/components/ui/Skeleton";

/* Instant shell while Savant runs the query. */
export default function QueryLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-3 p-3">
      <div className="flex items-center justify-between border border-line bg-surface px-3 py-2">
        <Skeleton className="h-4 w-48" />
      </div>
      <SkeletonPanel delay={0.08}>
        <SkeletonTable rows={16} />
      </SkeletonPanel>
    </div>
  );
}

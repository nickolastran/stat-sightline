import { Skeleton, SkeletonPanel, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[96rem] space-y-3 p-3">
      <Skeleton className="h-5 w-48" />
      <div className="flex gap-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-[52px] w-56" delay={i * 0.1} />
        ))}
      </div>
      <SkeletonPanel right>
        <Skeleton className="h-40 w-full" />
      </SkeletonPanel>
      <SkeletonTable rows={4} avatar />
    </div>
  );
}

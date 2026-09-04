import { Skeleton, SkeletonPanel, SkeletonTiles } from "@/components/ui/Skeleton";

/* Instant shell for a player page: identity strip, tab strip, then the
   section — tiles and panels, which is what the overview opens on. */
export default function PlayerLoading() {
  return (
    <div className="mx-auto max-w-[96rem] space-y-3 p-3">
      <div className="flex items-center gap-3 border border-line bg-surface px-3 py-3">
        <Skeleton className="h-14 w-14 shrink-0" />
        <Skeleton className="h-9 w-9 shrink-0" delay={0.06} />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-56" delay={0.1} />
          <Skeleton className="h-2.5 w-72" delay={0.14} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border border-line bg-surface p-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-6 w-20" delay={i * 0.05} />
        ))}
      </div>
      <SkeletonTiles />
      {[0, 1].map((i) => (
        <SkeletonPanel key={i} delay={i * 0.1} right>
          <Skeleton className="h-40 w-full" delay={i * 0.1 + 0.05} />
        </SkeletonPanel>
      ))}
    </div>
  );
}

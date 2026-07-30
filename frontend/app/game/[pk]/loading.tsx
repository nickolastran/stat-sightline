import { Skeleton } from "@/components/ui/Skeleton";

/* Box score placeholder — header row, linescore, one stat table. */
export default function GameLoading() {
  return (
    <div className="mx-auto max-w-5xl p-3">
      <div className="border border-line bg-surface">
        <div className="flex items-center gap-4 border-b border-line px-3 py-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-7 w-28" delay={0.08} />
          <Skeleton className="ml-auto h-4 w-24" delay={0.16} />
        </div>
        <div className="space-y-2 p-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-56 w-full" delay={0.15} />
        </div>
      </div>
    </div>
  );
}

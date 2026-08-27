import { Skeleton, SkeletonTable, SkeletonTiles } from "@/components/ui/Skeleton";

/* The shape an answer lands in: question line, headline card, split tiles,
   game log. Same order AskResult renders them in. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="space-y-4 border-x border-line px-4 py-8 sm:px-8">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" delay={0.05} />
        <SkeletonTiles delay={0.1} />
        <SkeletonTable rows={6} delay={0.15} />
      </section>
    </div>
  );
}

import Panel from "@/components/ui/Panel";
import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";

/* The shape the playoffs page lands in: a row of view buttons over the odds
   tables, which is what it opens on. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[100rem] space-y-3 p-3">
      <Panel title="PLAYOFFS" right={<Skeleton className="h-4 w-24" />}>
        <div className="mb-3 flex gap-px">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-32" delay={i * 0.05} />
          ))}
        </div>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <SkeletonTable key={i} rows={5} delay={i * 0.1} />
          ))}
        </div>
      </Panel>
    </div>
  );
}

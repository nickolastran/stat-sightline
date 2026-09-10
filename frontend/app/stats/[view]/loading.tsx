import Panel from "@/components/ui/Panel";
import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";

/* The shape the advanced boards land in: a row of view tabs over one very
   wide table. The top-performers grid streams behind its own fallback inside
   the panel, so this only has to be right for the common case. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[110rem] space-y-3 p-3">
      <Panel title="ADVANCED" right={<Skeleton className="h-4 w-24" />}>
        <div className="mb-3 flex gap-px">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-28" delay={i * 0.04} />
          ))}
        </div>
        <SkeletonTable rows={16} heading={false} />
      </Panel>
    </div>
  );
}

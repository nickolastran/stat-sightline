"use client";

import { usePathname } from "next/navigation";
import {
  Skeleton,
  SkeletonPanel,
  SkeletonTable,
} from "@/components/ui/Skeleton";

/*
 * Loading state for the league sections. `loading.tsx` isn't handed the route
 * params, so the section is read off the pathname — worth it, because a
 * placeholder is only useful if it is the shape of what lands on top of it:
 * stacked division tables, one wide team table, or a grid of leader cards.
 */

/** The controls row each section renders above its body. */
const Controls = () => (
  <div className="flex justify-end">
    <Skeleton className="h-6 w-40" />
  </div>
);

function SectionBody({ section }: { section: string }) {
  switch (section) {
    case "standings":
      return (
        <div className="space-y-3">
          <Controls />
          {[0, 1, 2].map((i) => (
            <SkeletonTable key={i} rows={5} delay={i * 0.12} />
          ))}
        </div>
      );

    case "teams":
      return (
        <div className="space-y-3">
          <Controls />
          <SkeletonTable rows={12} heading={false} />
        </div>
      );

    case "leaders":
      return (
        <div className="space-y-3">
          <Controls />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonTable key={i} rows={5} delay={i * 0.08} />
            ))}
          </div>
        </div>
      );

    case "probables":
      return (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" delay={i * 0.06} />
          ))}
        </div>
      );

    default:
      return <Skeleton className="h-64 w-full" />;
  }
}

export default function LeagueSectionLoading() {
  const section = usePathname()?.split("/")[2] ?? "";
  return (
    <div className="mx-auto max-w-7xl space-y-3 p-3">
      <SkeletonPanel right>
        <SectionBody section={section} />
      </SkeletonPanel>
    </div>
  );
}

"use client";

import { usePathname } from "next/navigation";
import { SkeletonPanel } from "@/components/ui/Skeleton";
import SectionSkeleton from "@/components/ui/SectionSkeleton";
import { sectionWidth } from "@/lib/leagueSections";

/*
 * Loading state for the league sections. `loading.tsx` isn't handed the route
 * params, so the section is read off the pathname — worth it, because the
 * placeholder is section-shaped (see SectionSkeleton, which the page's own
 * Suspense boundary renders too).
 */
export default function LeagueSectionLoading() {
  const section = usePathname()?.split("/")[2] ?? "";
  return (
    <div className={`mx-auto ${sectionWidth(section)} space-y-3 p-3`}>
      <SkeletonPanel right>
        <SectionSkeleton section={section} />
      </SkeletonPanel>
    </div>
  );
}

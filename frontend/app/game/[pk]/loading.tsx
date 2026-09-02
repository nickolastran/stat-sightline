"use client";

import { useSearchParams } from "next/navigation";
import GameSkeleton from "@/components/mlb/GameSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";

/*
 * Box score placeholder, shaped like what lands on top of it: the two-team
 * header, the linescore strip, the tab strip, and then whichever of the three
 * views the tabs are on — the same GameSkeleton the page's own Suspense
 * boundary renders, so the two can't drift apart.
 *
 * `loading.tsx` isn't handed the route's params, so the tab is read off the
 * query the way the league section reads its id off the pathname.
 */

/** One side of the header — logo, abbr over record, score. */
const HeaderSide = ({ delay = 0 }: { delay?: number }) => (
  <div className="flex items-center gap-2">
    <Skeleton className="h-7 w-7 rounded-full" delay={delay} />
    <div className="space-y-1">
      <Skeleton className="h-3 w-10" delay={delay} />
      <Skeleton className="h-2 w-8" delay={delay + 0.05} />
    </div>
    <Skeleton className="ml-1 h-5 w-5" delay={delay + 0.05} />
  </div>
);

export default function GameLoading() {
  const tab = useSearchParams()?.get("tab") ?? "gamecast";

  return (
    <div className="mx-auto max-w-[96rem] space-y-2 p-3">
      <div className="mx-auto max-w-5xl">
        <div className="border border-line bg-surface">
          <div className="flex items-center gap-4 border-b border-line px-3 py-2">
            <HeaderSide />
            <HeaderSide delay={0.08} />
            <Skeleton className="ml-auto h-2.5 w-24" delay={0.16} />
          </div>
          <div className="p-3">
            {/* Linescore: label column plus nine innings and R/H/E. */}
            <div className="border border-line bg-bg">
              <div className="border-b border-line px-2 py-2">
                <Skeleton className="h-2.5 w-full" delay={0.1} />
              </div>
              {[0, 1].map((r) => (
                <div key={r} className="px-2 py-2">
                  <Skeleton className="h-3 w-full" delay={0.15 + r * 0.08} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* The tab strip, insetting its buttons the way the real one does. */}
      <div className="border-b border-line pl-[max(0px,calc((100%-64rem)/2))]">
        <div className="flex gap-4 pb-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-4 w-24" delay={0.2 + i * 0.06} />
          ))}
        </div>
      </div>

      <GameSkeleton tab={tab} />
    </div>
  );
}

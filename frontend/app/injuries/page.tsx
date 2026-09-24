import type { Metadata } from "next";
import { Suspense } from "react";
import Panel from "@/components/ui/Panel";
import InjuryBoard from "@/components/mlb/InjuryBoard";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { getInjuries } from "@/lib/injuries";

/*
 * The league's injury report — every club's injured players in one board,
 * off the 40-man rosters and the clubs' own transaction logs. Sixty feeds
 * behind one page, so it is streamed in behind a skeleton like every other
 * board on the site.
 */

export const metadata: Metadata = { title: "Injury Report" };

async function Body() {
  try {
    const injuries = await getInjuries();
    if (injuries.length === 0)
      return (
        <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
          NOBODY ON THE INJURED LIST
        </p>
      );
    return <InjuryBoard injuries={injuries} />;
  } catch {
    return (
      <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
        UNAVAILABLE — MLB API UNREACHABLE
      </p>
    );
  }
}

export default function InjuriesPage() {
  return (
    <div className="mx-auto max-w-[88rem] space-y-3 p-3">
      <Panel title="Injury Report">
        <Suspense fallback={<SkeletonTable rows={12} heading={false} />}>
          <Body />
        </Suspense>
      </Panel>
    </div>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import Panel from "@/components/ui/Panel";
import FreeAgentBoard from "@/components/mlb/FreeAgentBoard";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { getFreeAgents } from "@/lib/freeAgents";
import { seasonOf, todayPT } from "@/lib/mlb";

/*
 * The free-agent tracker: this offseason's class, who is still available and
 * who has signed where. MLB files the class under the season just played.
 */

export const metadata: Metadata = {
  title: "Free Agents",
  description:
    "This offseason's MLB free agents — who is still available, who has signed, and where.",
};

async function Body({ season }: { season: number }) {
  try {
    const agents = await getFreeAgents(season);
    if (agents.length === 0)
      return (
        <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
          NO FREE AGENTS LISTED YET
        </p>
      );
    return <FreeAgentBoard agents={agents} season={season} />;
  } catch {
    return (
      <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
        UNAVAILABLE — MLB API UNREACHABLE
      </p>
    );
  }
}

export default function FreeAgentsPage() {
  const season = seasonOf(todayPT());
  return (
    <div className="mx-auto max-w-[88rem] space-y-3 p-3">
      <Panel title={`${season + 1} Free Agents`} heading="h1">
        <Suspense fallback={<SkeletonTable rows={12} heading={false} />}>
          <Body season={season} />
        </Suspense>
      </Panel>
    </div>
  );
}

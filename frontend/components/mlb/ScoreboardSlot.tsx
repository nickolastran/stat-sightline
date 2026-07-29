"use client";

import { usePathname } from "next/navigation";
import ScoreboardBar from "@/components/mlb/ScoreboardBar";

/*
 * The scoreboard strip on every page except the league sections — those are a
 * focused single-topic view where the strip is just noise. Returning null
 * unmounts it, so it also stops fetching the day's schedule there.
 *
 * The route check lives here rather than inside ScoreboardBar so that
 * component stays route-agnostic and reusable.
 */
export default function ScoreboardSlot() {
  const pathname = usePathname();
  if (pathname?.startsWith("/league")) return null;
  return <ScoreboardBar />;
}

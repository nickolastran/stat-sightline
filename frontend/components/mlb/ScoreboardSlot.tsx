"use client";

import { usePathname } from "next/navigation";
import ScoreboardBar from "@/components/mlb/ScoreboardBar";

/*
 * The scoreboard strip, on the front page only. Every other route is a
 * focused single-topic view — the overview, a section, a player, a club, one
 * box score — where the day's rail is just noise above the thing you came
 * for. Returning null unmounts it, so it also stops fetching the schedule
 * everywhere else.
 *
 * The route check lives here rather than inside ScoreboardBar so that
 * component stays route-agnostic and reusable.
 */
export default function ScoreboardSlot() {
  const pathname = usePathname();
  if (pathname !== "/") return null;
  return <ScoreboardBar />;
}

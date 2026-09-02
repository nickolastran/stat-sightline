"use client";

import { firstPitch } from "@/lib/mlb";
import { useTimeZone } from "@/lib/useTimeZone";

/*
 * First pitch, day and clock, in the viewer's own zone — the one line of the
 * pre-game panels that can't be rendered on a server whose zone is UTC.
 */
export default function FirstPitch({ startTime }: { startTime: string }) {
  return <>{firstPitch(startTime, useTimeZone())}</>;
}

"use client";

import Link from "next/link";
import { teamHref } from "@/lib/mlb";
import { useFavoriteTeam } from "@/lib/useFavoriteTeam";

/* The league bar's shortcut to the reader's favourite club. Nothing is drawn
   until one is starred. */
export default function MyTeamLink({ className }: { className: string }) {
  const team = useFavoriteTeam();
  if (!team) return null;
  return (
    <Link href={teamHref(team.id, team.name)} className={className}>
      MY TEAM
    </Link>
  );
}

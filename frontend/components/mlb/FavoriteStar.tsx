"use client";

import { setFavoriteTeam, useFavoriteTeam } from "@/lib/useFavoriteTeam";

/* The team page's toggle for making this club the reader's favourite. One
   favourite at a time, so starring a club replaces whichever was starred. */
export default function FavoriteStar({ id, name }: { id: number; name: string }) {
  const on = useFavoriteTeam()?.id === id;
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Remove favorite team" : "Set as favorite team"}
      title={on ? "Your team" : "Make this your team"}
      onClick={() => setFavoriteTeam(on ? null : { id, name })}
      className={`shrink-0 text-lg leading-none hover:text-accent ${on ? "text-accent" : "text-ink-3"}`}
    >
      {on ? "★" : "☆"}
    </button>
  );
}

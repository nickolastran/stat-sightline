"use client";

import { useTimeZone } from "@/lib/useTimeZone";
import { gameStatus, type Game } from "@/lib/mlb";

/*
 * A game's status line — the one piece of a card that depends on who is
 * reading it, since a first-pitch time has to land in their own zone. Split
 * out so the cards around it stay server-rendered and only this hydrates.
 */
export default function GameStatus({
  game,
  className = "",
}: {
  game: Game;
  className?: string;
}) {
  const st = gameStatus(game, useTimeZone());
  const tone =
    st.tone === "live"
      ? "text-good"
      : st.tone === "final"
        ? "text-ink-3"
        : "text-accent";

  return (
    <span className={`text-[10px] tracking-widest ${tone} ${className}`}>
      {st.tone === "live" && (
        <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-good align-middle" />
      )}
      {st.text}
    </span>
  );
}

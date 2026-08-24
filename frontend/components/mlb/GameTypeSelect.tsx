"use client";

import { useTransition } from "react";
import { useSetParam } from "@/lib/useSetParam";
import { GAME_TYPES, type GameType } from "@/lib/mlb";

/*
 * Regular season or spring training, for the standings and team tables. Like
 * the season picker the choice lives in the URL — both views are fetched on
 * the server, so switching is a navigation and the result is linkable.
 */
export default function GameTypeSelect({ value }: { value: GameType }) {
  const setParam = useSetParam();
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-1.5 text-[10px] tracking-[0.2em] text-ink-3">
      TYPE
      <select
        value={value}
        disabled={pending}
        onChange={(e) =>
          startTransition(() => setParam("type", e.target.value))
        }
        className={`border border-line bg-bg px-1.5 py-0.5 text-[10px] tracking-normal text-ink hover:border-accent ${
          pending ? "opacity-50" : ""
        }`}
      >
        {GAME_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
    </label>
  );
}

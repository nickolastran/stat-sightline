"use client";

import { useTransition } from "react";
import { useSetParam } from "@/lib/useSetParam";
/*
 * One labelled dropdown that writes one query parameter — the game type a
 * table reads, which half of a schedule it shows. Like the season picker the
 * choice lives in the URL, because every one of these views is fetched on the
 * server: switching is a navigation, and the result is linkable.
 *
 * `onChange` takes that over where a bar stages its controls and submits them
 * together — the custom board, whose eight controls would otherwise be eight
 * refetches on the way to one board anybody wanted.
 */
export default function ParamSelect({
  param,
  label,
  value,
  options,
  onChange,
}: {
  /** The query parameter this control owns. */
  param: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  /** Given, this is called instead of the parameter being written. */
  onChange?: (value: string) => void;
}) {
  const setParam = useSetParam();
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-1.5 text-[10px] tracking-[0.2em] text-ink-3">
      {label}
      <select
        value={value}
        disabled={pending}
        onChange={(e) =>
          onChange
            ? onChange(e.target.value)
            : startTransition(() => setParam(param, e.target.value))
        }
        className={`border border-line bg-bg px-1.5 py-0.5 text-[10px] tracking-normal text-ink hover:border-accent ${
          pending ? "opacity-50" : ""
        }`}
      >
        {options.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
    </label>
  );
}

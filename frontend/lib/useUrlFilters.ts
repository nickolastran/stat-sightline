"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

/*
 * A board's in-browser filters, mirrored into the query string so a refresh,
 * the back button or a pasted link lands on the same slice. Only a filter
 * that differs from its default is written, and an emptied one is written
 * bare (`?status=`) so "all" survives a reload where the default isn't empty.
 *
 * `history.replaceState` rather than useSetParam's router.replace: these
 * boards filter rows already in hand, and a router replace would re-render
 * the server page — refetching every row — on every keystroke.
 */
export function useUrlFilters<F extends Record<string, string>>(blank: F) {
  const params = useSearchParams();
  const [f, setF] = useState<F>(() => {
    const out: Record<string, string> = { ...blank };
    for (const k of Object.keys(blank)) {
      const v = params.get(k);
      if (v !== null) out[k] = v;
    }
    return out as F;
  });

  const update = (next: F) => {
    setF(next);
    const url = new URLSearchParams(window.location.search);
    for (const k of Object.keys(blank)) {
      if (next[k] === blank[k]) url.delete(k);
      else url.set(k, next[k]);
    }
    const qs = url.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  };

  return [f, update] as const;
}

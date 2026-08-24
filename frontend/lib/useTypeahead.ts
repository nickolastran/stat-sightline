"use client";

import { useEffect, useRef, useState } from "react";

/*
 * The interaction half of a typeahead — debounce, open/closed, the active row,
 * arrow-key and escape handling, and closing on an outside click. Shared by the
 * header search and the landing pitcher search, which look nothing alike and
 * fetch from different places but behave identically under the keyboard.
 *
 * A response is dropped unless it belongs to the most recent keystroke: without
 * that, a slow request for "jud" can land after a fast one for "judge" and
 * repopulate the list with results for a query nobody is looking at any more.
 */
export function useTypeahead<T>(
  query: string,
  fetcher: (q: string) => Promise<T[]>,
  onPick: (item: T) => void,
  { delay = 150 }: { delay?: number } = {}
) {
  const [results, setResults] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  /* Callers pass these inline, so they are new on every render — held in refs
     so the effect below depends on the query alone and doesn't refetch on
     every keystroke's re-render. */
  const fetcherRef = useRef(fetcher);
  const pickRef = useRef(onPick);
  fetcherRef.current = fetcher;
  pickRef.current = onPick;

  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setOpen(false);
      setError(null);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const rows = await fetcherRef.current(q);
        if (mine !== seq.current) return;
        setResults(rows);
        setActive(0);
        setOpen(true);
        setError(null);
      } catch {
        if (mine !== seq.current) return;
        setError("SEARCH UNAVAILABLE");
        setOpen(false);
      }
    }, delay);
    return () => clearTimeout(t);
  }, [query, delay]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (item: T) => {
    setOpen(false);
    pickRef.current(item);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return setOpen(false);
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(results[active]);
    }
  };

  return {
    results,
    open,
    setOpen,
    active,
    setActive,
    error,
    rootRef,
    onKeyDown,
    pick,
  };
}

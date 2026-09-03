"use client";

import { useRouter, useSearchParams } from "next/navigation";

/*
 * Set one query parameter without disturbing the others. The league sections
 * now carry several at once — season, game type, stat group — and each control
 * owns exactly one of them, so a control that rebuilt the whole query string
 * would silently drop whatever the others had set.
 *
 * `replace`, because trying years or toggling a table isn't navigation anyone
 * wants to walk back one step at a time.
 *
 * A control that owns two parameters at once — picking a new sort column also
 * drops the direction the old one was flipped to — passes them together, since
 * two calls would both build off the same untouched snapshot and the second
 * would undo the first. A null value drops the parameter.
 */
export function useSetParam() {
  const router = useRouter();
  const params = useSearchParams();
  return (
    key: string | Record<string, string | null>,
    value?: string
  ) => {
    const next = new URLSearchParams(params);
    const patch = typeof key === "string" ? { [key]: value! } : key;
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    router.replace(`?${next}`, { scroll: false });
  };
}

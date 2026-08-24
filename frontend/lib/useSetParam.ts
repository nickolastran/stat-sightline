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
 */
export function useSetParam() {
  const router = useRouter();
  const params = useSearchParams();
  return (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    router.replace(`?${next}`, { scroll: false });
  };
}

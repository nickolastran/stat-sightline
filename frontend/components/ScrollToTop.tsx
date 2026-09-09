"use client";

import { useEffect } from "react";

/*
 * Lands a page at its top. Next's router skips its own scroll reset when the
 * outgoing page was long enough that unmounting it clamps the scroll back
 * inside the new, shorter document — the new page's top edge is then already
 * in view, so it "exits early" and leaves the reader partway down. Mounting
 * this at the top of such a page settles it.
 *
 * ponytail: no popstate check, so a back button onto this page starts at the
 * top rather than where it was left; add one if that restore starts to matter.
 */
export default function ScrollToTop() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return null;
}

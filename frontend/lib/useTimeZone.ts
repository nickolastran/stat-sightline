"use client";

import { useEffect, useState } from "react";
import { FALLBACK_TZ } from "@/lib/mlb";

/*
 * The viewer's own IANA time zone, for first-pitch times.
 *
 * It starts at Eastern rather than at the resolved zone, because the first
 * render happens on the server — where the only zone available is the host's
 * UTC — and has to produce the same markup the browser produces on hydration.
 * The real zone is adopted immediately after mount, and Eastern remains the
 * answer for a browser whose Intl declines to name one.
 */
export function useTimeZone(): string {
  const [tz, setTz] = useState(FALLBACK_TZ);

  useEffect(() => {
    try {
      const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (local) setTz(local);
    } catch {
      /* no resolvable zone — Eastern stands */
    }
  }, []);

  return tz;
}

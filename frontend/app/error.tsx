"use client";

import { useEffect } from "react";
import Link from "next/link";

/*
 * Any page that throws while rendering — almost always an upstream (the MLB
 * Stats API, Savant) failing somewhere a panel didn't catch it. It sits
 * inside the root layout, so the header and league bar stay up and only the
 * page body is replaced.
 *
 * Retrying is usually the fix: the upstreams fail transiently. The digest is
 * shown so a report can be matched to the server log; in production the
 * message itself is withheld by Next.
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="border-x border-line px-4 py-8 sm:px-8">
        <p className="mb-4 text-xs tracking-[0.3em] text-ink-3">ERROR // PAGE FAILED</p>
        <div className="border border-line bg-surface p-6">
          <h1 className="text-sm font-bold tracking-widest text-crit">
            THIS PAGE DIDN&apos;T LOAD
          </h1>
          <p className="mt-4 text-xs leading-5 tracking-wider text-ink-3">
            A DATA SOURCE — USUALLY THE MLB STATS API — DIDN&apos;T ANSWER IN
            TIME. IT IS MOST OFTEN MOMENTARY; TRY AGAIN.
          </p>
          {error.digest && (
            <p className="mt-2 text-[10px] tracking-wider text-ink-3">
              REF {error.digest}
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => unstable_retry()}
              className="border border-accent bg-accent px-3 py-1.5 text-xs font-bold tracking-widest text-white hover:opacity-90"
            >
              TRY AGAIN
            </button>
            <Link
              href="/"
              className="border border-line px-3 py-1.5 text-xs text-ink-2 hover:border-accent hover:text-ink"
            >
              ← FRONT PAGE
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

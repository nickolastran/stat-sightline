import type { Metadata } from "next";
import Link from "next/link";

/*
 * Every notFound() on the site — an unknown player, club, award or section —
 * and any URL that matches no route at all. Rendered inside the root layout,
 * so the header's search and the league bar are still there to go on from.
 */

export const metadata: Metadata = {
  title: "Not Found",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="border-x border-line px-4 py-8 sm:px-8">
        <p className="mb-4 text-xs tracking-[0.3em] text-ink-3">404 // NOT FOUND</p>
        <div className="border border-line bg-surface p-6">
          <h1 className="text-sm font-bold tracking-widest text-ink">
            NOTHING AT THIS ADDRESS
          </h1>
          <p className="mt-4 text-xs leading-5 tracking-wider text-ink-3">
            THE PLAYER, CLUB OR PAGE MAY HAVE MOVED, OR THE LINK HAS A TYPO.
            SEARCH FROM THE HEADER, OR START FROM THE FRONT PAGE.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block border border-line px-3 py-1.5 text-xs text-ink-2 hover:border-accent hover:text-ink"
          >
            ← FRONT PAGE
          </Link>
        </div>
      </section>
    </div>
  );
}

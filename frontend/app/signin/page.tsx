import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "SIGN IN — STAT//SIGHTLINE",
  description: "Operator sign-in — not yet available.",
};

/* Placeholder until auth exists. The landing page's access form is the only
   live path in, so point there rather than dead-ending. */
export default function SignInPage() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="border-x border-line px-4 py-8 sm:px-8">
        <p className="mb-4 text-xs tracking-[0.3em] text-ink-3">
          SIGN IN // OPERATOR ACCESS
        </p>
        <div className="border border-line bg-surface p-6">
          <h1 className="text-sm font-bold tracking-widest text-warn">
            [WIP] WORK IN PROGRESS
          </h1>
          <p className="mt-4 text-xs leading-5 tracking-wider text-ink-3">
            SIGN-IN ISN&apos;T WIRED UP YET.
          </p>
          <Link
            href="/#access"
            className="mt-6 inline-block border border-line px-3 py-1.5 text-xs text-ink-2 hover:border-accent hover:text-ink"
          >
            REQUEST ACCESS →
          </Link>
        </div>
      </section>
    </div>
  );
}

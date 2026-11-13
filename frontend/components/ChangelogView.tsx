"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { FILTER_CONTROL } from "@/components/ui/FilterSelect";
import { useUrlFilters } from "@/lib/useUrlFilters";

export type ChangeKind = "added" | "improved" | "fixed";

export interface Release {
  version: string;
  /** ISO day, e.g. "2026-11-12". */
  date: string;
  title: string;
  summary: string;
  changes: { kind: ChangeKind; text: string; href?: string }[];
}

const KINDS: { value: ChangeKind; label: string }[] = [
  { value: "added", label: "ADDED" },
  { value: "improved", label: "IMPROVED" },
  { value: "fixed", label: "FIXED" },
];

/* UTC and a fixed locale, so the server render and the browser agree. */
const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`)
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .toUpperCase();

export default function ChangelogView({ releases }: { releases: Release[] }) {
  const [f, setF] = useUrlFilters({ q: "", kind: "" });
  const q = f.q.trim().toLowerCase();
  const latest = releases[0]?.version;

  /* A query that names the release (its version, headline or summary) keeps
     all of its changes; otherwise only the changes that mention it stay. */
  const shown = releases
    .map((r) => {
      const whole = !q || [r.version, r.title, r.summary].some((s) => s.toLowerCase().includes(q));
      const changes = r.changes.filter(
        (c) => (!f.kind || c.kind === f.kind) && (whole || c.text.toLowerCase().includes(q)),
      );
      return { ...r, changes };
    })
    .filter((r) => r.changes.length > 0);

  /* The release nearest the top of the viewport lights up in the side nav. */
  const [active, setActive] = useState(latest);
  const ids = shown.map((r) => r.version).join(",");
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-15% 0px -75% 0px" },
    );
    for (const id of ids.split(",")) {
      const el = id && document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [ids]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-t border-line pt-6">
        <label className="flex w-full max-w-md flex-col gap-1.5 text-[11px] tracking-[0.2em] text-ink-3">
          SEARCH UPDATES
          <input
            type="search"
            placeholder="FEATURES, PAGES OR VERSIONS…"
            value={f.q}
            onChange={(e) => setF({ ...f, q: e.target.value })}
            className={`${FILTER_CONTROL} w-full ${f.q ? "border-accent" : ""}`}
          />
        </label>
        <SegmentedControl
          ariaLabel="Change type"
          size="lg"
          options={[{ value: "", label: "ALL CHANGES" }, ...KINDS]}
          value={f.kind}
          onChange={(v) => setF({ ...f, kind: v })}
        />
      </div>
      <p className="text-[11px] tracking-wider text-ink-3">
        {shown.length} {shown.length === 1 ? "UPDATE" : "UPDATES"} · NEWEST FIRST
      </p>

      <div className="grid gap-8 lg:grid-cols-[11rem_1fr]">
        <nav aria-label="Releases" className="hidden lg:block">
          <div className="sticky top-16">
            <p className="mb-3 text-[11px] font-bold tracking-[0.2em] text-ink-3">ON THIS PAGE</p>
            <ul className="border-l border-line">
              {shown.map((r) => (
                <li key={r.version}>
                  <a
                    href={`#${r.version}`}
                    className={`-ml-px block border-l-2 py-1.5 pl-4 text-sm ${
                      active === r.version
                        ? "border-ink font-bold text-ink"
                        : "border-transparent text-ink-3 hover:text-ink"
                    }`}
                  >
                    {r.version}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="min-w-0">
          {shown.length === 0 && (
            <p className="border border-line bg-surface p-6 text-xs tracking-wider text-ink-3">
              NO UPDATES MATCH. TRY ANOTHER WORD, OR ALL CHANGES.
            </p>
          )}
          {shown.map((r) => (
            <article
              key={r.version}
              id={r.version}
              className="scroll-mt-16 border-b border-line pb-10 not-first:pt-10 last:border-b-0"
            >
              <p className="flex items-center gap-3 text-[11px] tracking-wider text-ink-3">
                <span className="font-mono text-ink">{r.version}</span>
                {r.version === latest && (
                  <span className="bg-ink px-1.5 py-0.5 font-bold tracking-widest text-bg">LATEST</span>
                )}
                <time dateTime={r.date}>{day(r.date)}</time>
              </p>
              <h2 className="mt-3 text-2xl font-bold leading-tight text-ink sm:text-3xl">{r.title}</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-3">{r.summary}</p>
              {KINDS.map((k) => {
                const list = r.changes.filter((c) => c.kind === k.value);
                if (list.length === 0) return null;
                return (
                  <section key={k.value} className="mt-6">
                    <h3 className="text-[11px] font-bold tracking-[0.2em] text-ink-3">{k.label}</h3>
                    <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-ink-2 marker:text-ink-3">
                      {list.map((c) => (
                        <li key={c.text}>
                          {c.text}
                          {c.href && (
                            <>
                              {" "}
                              <Link
                                href={c.href}
                                className="whitespace-nowrap text-ink underline decoration-dotted underline-offset-2 hover:text-accent hover:decoration-accent"
                              >
                                Take a look →
                              </Link>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

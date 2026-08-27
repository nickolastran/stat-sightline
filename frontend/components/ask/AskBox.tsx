"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/*
 * The question line. Submitting navigates rather than fetching, so every
 * answer has a shareable URL and the browser's back button walks the
 * session's questions — the header typeahead is for jumping to a page,
 * this is for asking something.
 */
export default function AskBox({
  initial = "",
  autoFocus = false,
}: {
  initial?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initial);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = q.trim();
        if (v.length >= 2) router.push(`/ask?q=${encodeURIComponent(v)}`);
      }}
      className="flex w-full"
    >
      <span
        className="flex h-12 items-center border border-r-0 border-line bg-surface px-3 text-ink-3"
        aria-hidden
      >
        ?_
      </span>
      <input
        type="search"
        /* No name, and autoComplete off: both suppress the browser's saved
           form-history dropdown, which would cover our own results. The value
           travels via router.push, so the field never needs a name. */
        autoComplete="off"
        aria-label="Ask a question about the pitch warehouse"
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="HOW MANY HOME RUNS DID JUDGE HIT AT FENWAY PARK"
        className="h-12 w-full border border-line bg-surface px-3 text-sm tracking-wide text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
      />
      <button
        type="submit"
        className="h-12 shrink-0 border border-l-0 border-accent bg-accent px-4 text-xs font-bold tracking-widest text-white hover:opacity-90"
      >
        ASK
      </button>
    </form>
  );
}

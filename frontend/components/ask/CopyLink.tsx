"use client";

import { useEffect, useState } from "react";

/*
 * Copies the page's own URL — the question is already in it (/ask?q=…), so
 * the link is the answer. The clipboard needs a secure context; where it
 * isn't there (plain http off localhost) the button says so rather than
 * failing silently.
 */
export default function CopyLink() {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(t);
  }, [state]);

  const copy = () =>
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => setState("copied"))
      .catch(() => setState("failed"));

  return (
    <button
      type="button"
      onClick={copy}
      className="border border-line px-2 py-1 text-[10px] tracking-widest text-ink-2 hover:border-accent hover:text-ink"
    >
      {/* Announced, so a screen reader hears the copy land. */}
      <span aria-live="polite">
        {state === "copied" ? "LINK COPIED" : state === "failed" ? "COPY FAILED" : "COPY LINK"}
      </span>
    </button>
  );
}

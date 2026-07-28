"use client";

import { useState } from "react";

/*
 * Auth call-to-action. Backend auth isn't wired yet — this validates the
 * address and confirms locally, so the section is functional UI with a
 * stubbed submit. Swap the handler for the real signup endpoint when it
 * exists.
 */
export default function AccessCta() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "invalid" | "done">("idle");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setState("invalid");
      return;
    }
    setState("done");
  };

  if (state === "done") {
    return (
      <p className="border border-good px-4 py-3 text-sm text-good">
        [OK] ACCESS REQUEST LOGGED — {email}
      </p>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-px sm:flex-row">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setState("idle");
        }}
        placeholder="OPERATOR@TEAM.ORG"
        aria-label="Email address"
        aria-invalid={state === "invalid"}
        className={`h-12 w-full border bg-surface px-3 text-sm tracking-wide text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none ${
          state === "invalid" ? "border-crit" : "border-line"
        }`}
      />
      <button
        type="submit"
        className="h-12 shrink-0 border border-accent bg-accent px-6 text-sm font-bold text-white hover:opacity-90"
      >
        REQUEST ACCESS →
      </button>
      {state === "invalid" && (
        <p className="text-xs text-crit sm:absolute sm:mt-13">
          [ERR] INVALID ADDRESS
        </p>
      )}
    </form>
  );
}

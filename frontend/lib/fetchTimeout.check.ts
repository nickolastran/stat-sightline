/*
 * Self-check for the ceiling on an upstream request.
 *
 * The failure this exists to catch is silent: drop the `signal` from either
 * client and everything still works against a healthy backend, but a socket
 * that never answers once again hangs a prerender until the build kills it.
 * So the assertion is on the wiring — every request carries a signal, and
 * that signal really does abort the call well inside the 60s budget a
 * prerendered page gets.
 *
 * Run with:  npx tsx lib/fetchTimeout.check.ts
 */
import assert from "node:assert/strict";

/* Both clients read their base URL at module load, so this has to be set
   before either import below. Port 9 (discard) is never reached — the stub
   fetch answers first — it only has to be a URL. */
process.env.NEXT_PUBLIC_API_URL = "http://127.0.0.1:9";

let sawSignal = 0;

/* A server that never answers: the request settles only when its caller
   gives up on it. Without a signal this promise hangs forever, which is
   exactly what the build used to do. */
globalThis.fetch = ((_input: unknown, init?: RequestInit) =>
  new Promise((_resolve, reject) => {
    const signal = init?.signal;
    if (!signal) {
      reject(new Error("request sent with no AbortSignal — it has no ceiling"));
      return;
    }
    sawSignal += 1;
    signal.addEventListener("abort", () => reject(signal.reason));
  })) as typeof fetch;

/* Wrapped rather than top level: these checks transpile to CommonJS, which
   has no top-level await. */
async function main() {
const { mlb } = await import("./mlb");
const { searchPitchers } = await import("./api");

/* `AbortSignal.timeout` timers are unref'd, so with a stub fetch holding no
   socket open there is nothing left to keep the loop alive and the process
   would exit before the ceiling ever fires. A real build has the socket. */
const keepAlive = setInterval(() => {}, 1000);

const started = Date.now();

/* Both clients, in parallel — the wait is the ceiling itself, not twice it. */
const results = await Promise.allSettled([
  mlb("/schedule?sportId=1", 60),
  searchPitchers("", 5, 3600),
]);

const elapsed = Date.now() - started;
clearInterval(keepAlive);

assert.equal(sawSignal, 2, "both clients must pass an AbortSignal");

for (const [i, r] of results.entries()) {
  const who = ["mlb()", "searchPitchers()"][i];
  assert.equal(r.status, "rejected", `${who} hung instead of timing out`);
  assert.equal(
    (r.reason as Error).name,
    "TimeoutError",
    `${who} rejected with ${(r.reason as Error).name}, not a timeout`,
  );
}

/* The point of the whole change: a dead upstream costs seconds, not the
   60s that fails the deploy. */
assert.ok(
  elapsed < 30_000,
  `gave up after ${elapsed}ms — too close to the 60s prerender budget`,
);

console.log(`ok — both clients aborted a hung upstream in ${elapsed}ms`);
}

main();

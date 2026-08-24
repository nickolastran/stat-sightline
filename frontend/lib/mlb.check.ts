/*
 * Self-check for the one piece of standings logic that isn't a straight field
 * read: the clinch symbol. MLB reports what a club clinched as a letter and
 * its elimination as two separate magic numbers, and every way of combining
 * them wrongly produced a real, wrong mark against a real season — a division
 * elimination read as a playoff elimination, a wild card overridden by it, a
 * tiebreaker loser left unmarked, a cancelled post-season invented.
 *
 * Run with:  npx tsx lib/mlb.check.ts
 */
import assert from "node:assert/strict";
import { clinchMark, clinchPhase, type StandingRow } from "./mlb";

const row = (p: Partial<StandingRow>) =>
  ({ clinch: "", elim: "", wcElim: "", ...p }) as StandingRow;

/* Phase — what the payload as a whole can be trusted to say. */
const played = [row({ clinch: "z" }), row({})];
const blank = [row({}), row({})];
assert.equal(clinchPhase(played, false), "live", "2026, still being played");
assert.equal(clinchPhase(played, true), "settled", "2025, in the books");
assert.equal(clinchPhase(blank, true), "none", "1994, post-season cancelled");
assert.equal(clinchPhase(blank, false), "live", "spring training, in progress");

/* Letters, which mean the same thing in every phase. */
assert.equal(clinchMark(row({ clinch: "z" }), "live"), "*", "Blue Jays — best AL record");
assert.equal(clinchMark(row({ clinch: "y" }), "live"), "X", "Guardians — division");
assert.equal(clinchMark(row({ clinch: "w", elim: "E" }), "live"), "Y", "Tigers — wild card, division race lost");
assert.equal(clinchMark(row({ clinch: "x" }), "settled"), "Y", "2020's expanded field marks a berth 'x'");

/* Elimination, which does not. */
assert.equal(clinchMark(row({ elim: "E", wcElim: "E" }), "live"), "E", "Royals — out of both races");
assert.equal(clinchMark(row({ elim: "E", wcElim: "1" }), "live"), "", "Astros in September — division gone, wild card alive");
assert.equal(clinchMark(row({ elim: "E", wcElim: "1" }), "settled"), "E", "Astros in the books — the tiebreaker settled it, the magic number never moved");
assert.equal(clinchMark(row({}), "live"), "", "nothing decided yet");

/* A season with no post-season claims nothing about anyone. */
assert.equal(clinchMark(row({ elim: "E", wcElim: "E" }), "none"), "", "1994 — no October to be eliminated from");

console.log("clinchMark ok");

/*
 * Self-check for the one piece of standings logic that isn't a straight field
 * read: the clinch symbol. MLB reports what a club has clinched as a letter
 * and its elimination as two separate magic numbers, and the two easy ways to
 * get this wrong — treating a division elimination as a playoff elimination,
 * or letting it override a wild card the club already clinched — both produced
 * real, wrong marks against the 2025 final standings.
 *
 * Run with:  npx tsx lib/mlb.check.ts
 */
import assert from "node:assert/strict";
import { clinchMark, type StandingRow } from "./mlb";

const row = (p: Partial<StandingRow>) =>
  ({ clinch: "", elim: "", wcElim: "", ...p }) as StandingRow;

// 2025 finals, the cases that pin each branch down.
assert.equal(clinchMark(row({ clinch: "z" })), "*", "Blue Jays — best AL record");
assert.equal(clinchMark(row({ clinch: "y" })), "X", "Guardians — division");
assert.equal(clinchMark(row({ clinch: "w", elim: "E" })), "Y", "Tigers — wild card, out of the division race");
assert.equal(clinchMark(row({ elim: "E", wcElim: "E" })), "E", "Royals — out of both");
assert.equal(clinchMark(row({ elim: "E", wcElim: "1" })), "", "Astros — division gone, wild card alive");
assert.equal(clinchMark(row({})), "", "spring training reports neither");

console.log("clinchMark ok");

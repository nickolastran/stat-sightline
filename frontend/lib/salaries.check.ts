/*
 * Self-check for the salary loader — all of its logic is about reading a file
 * somebody else exported: a header that names its columns differently, a
 * salary written with a dollar sign, a name with a comma in it, and ranking
 * a season where two men are paid the same.
 *
 * Run with:  npx tsx lib/salaries.check.ts
 */
import assert from "node:assert/strict";
import { parseCsv, rankBySalary, salaryRows } from "./salaries";

/* Quoted commas and doubled quotes survive; a trailing newline is not a row. */
assert.deepEqual(
  parseCsv('a,b\n"Ohtani, Shohei",2\n"He said ""hi""",3\n'),
  [
    ["a", "b"],
    ["Ohtani, Shohei", "2"],
    ['He said "hi"', "3"],
  ],
);

/* The format as documented. */
const plain = salaryRows(
  "year,name,team,position,salary,mlb_id\n" +
    "2026,Aaron Judge,NYY,RF,40000000,592450\n",
);
assert.deepEqual(plain, [
  { year: 2026, name: "Aaron Judge", team: "NYY", position: "RF", salary: 40000000, id: 592450 },
]);

/* The same file as somebody else's export: other column names, another order,
   dollars written out, no id, and a name that needs its quotes. */
const export2 = salaryRows(
  'Season,Player,Pos,Tm,Opening Day Salary\n' +
    '2003,"Guerrero, Vladimir",RF,MON,"$11,500,000"\n',
);
assert.deepEqual(export2, [
  { year: 2003, name: "Guerrero, Vladimir", team: "MON", position: "RF", salary: 11500000, id: null },
]);

/* A file with no salary column is no board at all, not a board of blanks. */
assert.deepEqual(salaryRows("year,name,team\n2026,Aaron Judge,NYY\n"), []);
assert.deepEqual(salaryRows(""), []);
/* The header alone — the file as it ships, before anyone fills it. */
assert.deepEqual(salaryRows("year,name,team,position,salary,mlb_id\n"), []);

/* Blank and unreadable salaries survive as rows without a number, and a row
   with no year or no name is dropped rather than printed as NaN. */
const partial = salaryRows(
  "year,name,salary\n2026,No Salary,\n2026,Junk Salary,TBD\n,Nobody,1\n2026,,1\n",
);
assert.deepEqual(
  partial.map((r) => [r.name, r.salary]),
  [
    ["No Salary", null],
    ["Junk Salary", null],
  ],
);

/* Ranking: best paid first, ties share a rank, the next rank skips past them,
   and an unsalaried row sits at the end unranked. */
const ranked = rankBySalary([
  { year: 2026, name: "Third", team: "", position: "", salary: 10_000_000, id: null },
  { year: 2026, name: "Tied B", team: "", position: "", salary: 40_000_000, id: null },
  { year: 2026, name: "Unknown", team: "", position: "", salary: null, id: null },
  { year: 2026, name: "Tied A", team: "", position: "", salary: 40_000_000, id: null },
]);
assert.deepEqual(
  ranked.map((r) => [r.rank, r.name]),
  [
    [1, "Tied A"],
    [1, "Tied B"],
    [3, "Third"],
    [0, "Unknown"],
  ],
);

console.log("salaries: ok");

/*
 * Self-check for the injury report — the two things it actually decides: what
 * counts as hurt on a roster line, and which transaction line the reason
 * comes off. Both are string work over payloads that word themselves
 * differently for every kind of move.
 *
 * Run with:  npx tsx lib/injuries.check.ts
 */
import assert from "node:assert/strict";
import { clubInjuries, injuryNote, isInjured, noteMap } from "./injuries";

/* Every list MLB spells out, and the statuses that aren't one. */
assert.equal(isInjured("Injured 60-Day"), true);
assert.equal(isInjured("Injured 15-Day"), true);
assert.equal(isInjured("Injured - Full Season"), true);
assert.equal(isInjured("Active"), false);
assert.equal(isInjured("Reassigned to Minors"), false);
assert.equal(isInjured("Development List"), false);

/* The reason is the sentence after the move — a date inside the first one
   ("retroactive to September 5, 2026.") must not be read as the start of it. */
assert.equal(
  injuryNote(
    "Washington Nationals placed RHP Matt Waldron on the 15-day injured list retroactive to September 5, 2026. Chest inflammation.",
  ),
  "Chest inflammation",
);
/* An activation says nothing about why anyone was hurt. */
assert.equal(
  injuryNote("Washington Nationals activated LHP DJ Herz from the 60-day injured list."),
  "",
);

const tx = (date: string, id: number, description: string) => ({
  date,
  person: { id },
  description,
});

const notes = noteMap([
  tx("2026-09-08", 1, "Washington Nationals placed RHP Matt Waldron on the 15-day injured list retroactive to September 5, 2026. Chest inflammation."),
  tx("2026-09-12", 1, "Washington Nationals transferred RHP Matt Waldron from the 15-day injured list to the 60-day injured list. Chest soreness."),
  /* An activation after the placement leaves the placement's note standing —
     a player the roster still lists as hurt was placed again since. */
  tx("2026-09-17", 2, "Washington Nationals activated RHP Josiah Gray from the 60-day injured list."),
  tx("2026-06-01", 2, "Washington Nationals placed RHP Josiah Gray on the 60-day injured list. Right elbow surgery."),
  /* Not an injury move at all. */
  tx("2026-07-01", 3, "Washington Nationals optioned RHP Somebody to Rochester."),
]);

/* The latest placement wins; the older one is not left on top of it. */
assert.equal(notes.get(1)?.note, "Chest soreness");
assert.equal(notes.get(1)?.since, "2026-09-12");
assert.equal(notes.get(2)?.note, "Right elbow surgery");
assert.equal(notes.get(3), undefined);

const club = { id: 120, name: "Nationals", abbr: "WSH" };
const rows = clubInjuries(
  club,
  [
    { person: { id: 1, fullName: "Matt Waldron" }, position: { abbreviation: "P" }, status: { description: "Injured 60-Day" } },
    { person: { id: 9, fullName: "Abel Active" }, position: { abbreviation: "1B" }, status: { description: "Active" } },
    /* Hurt, but never placed in this log — the row stands without a reason
       rather than being dropped for the want of one. */
    { person: { id: 4, fullName: "Unlisted Reason" }, position: { abbreviation: "OF" }, status: { description: "Injured - Full Season" } },
  ],
  [
    tx("2026-09-08", 1, "Washington Nationals placed RHP Matt Waldron on the 15-day injured list. Chest inflammation."),
  ],
);

assert.deepEqual(
  rows.map((r) => [r.name, r.status, r.note, r.abbr]),
  [
    ["Matt Waldron", "Injured 60-Day", "Chest inflammation", "WSH"],
    ["Unlisted Reason", "Injured - Full Season", "", "WSH"],
  ],
);

/* A club whose feed didn't answer contributes nothing, and doesn't throw. */
assert.deepEqual(clubInjuries(club, [], []), []);

console.log("injuries: ok");

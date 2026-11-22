// Unit tests for the occupancy history recorder's logic (scheduler/history.js).
//   npm run test:history
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DAYS, SLOTS, LIVE_KEEP, percentFull, localSlot, addDays, dowOf, addToCell, addSample,
  rollingWeek, staleDates, keysToTrim, pickTimezone, parseUnitList, unitsOption,
} from "../scheduler/history.js";
import { lotCounts } from "../src/unitStatus.js";

const NY = "America/New_York";
const curb = (online, occupied) => ({ online, occupied });

// ---------- percent full ----------
test("offline curbs are excluded from the percent", () => {
  // 2 of 3 online curbs occupied; the offline ones (occupied or not) don't count.
  assert.equal(percentFull({ a: curb(true, true), b: curb(true, true), c: curb(true, false), d: curb(false, true), e: curb(false, false) }), 67);
});

test("a curb counts as online only when online is true", () => {
  assert.equal(percentFull({ a: curb(true, true), b: { occupied: true }, c: { online: "yes", occupied: true }, d: null }), 100);
  assert.equal(percentFull({ a: curb(true, false), b: { occupied: true } }), 0);
});

test("rounds to a whole percent, halves up", () => {
  assert.equal(percentFull({ a: curb(true, true), b: curb(true, false), c: curb(true, false) }), 33); // 33.3
  assert.equal(percentFull(Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`c${i}`, curb(true, i === 0)]))), 13); // 12.5
  const p = percentFull({ a: curb(true, true), b: curb(true, false), c: curb(true, true) });
  assert.ok(Number.isInteger(p) && p === 67);
});

test("no curbs, or none online, gives null (the tick is skipped, never recorded as 0)", () => {
  assert.equal(percentFull({}), null);
  assert.equal(percentFull(null), null);
  assert.equal(percentFull({ a: curb(false, true), b: curb(false, false) }), null);
});

test("agrees with the dashboard's lotCounts on every combination of up to 4 curbs", () => {
  const states = [curb(true, true), curb(true, false), curb(false, true), curb(false, false), {}];
  const walk = (n, acc) => {
    if (n === 0) {
      const units = Object.fromEntries(acc.map((u, i) => [`C-${i}`, u]));
      assert.equal(percentFull(units), lotCounts(acc).pctFull);
      return;
    }
    for (const s of states) walk(n - 1, [...acc, s]);
  };
  for (let n = 0; n <= 4; n++) walk(n, []);
});

// ---------- history/live trim ----------
test(`trim keeps the newest ${LIVE_KEEP} push IDs`, () => {
  const keys = Array.from({ length: 450 }, (_, i) => `-N${String(i).padStart(5, "0")}`);
  const shuffled = [...keys].sort(() => 0.5 - Math.random());
  const trimmed = keysToTrim(shuffled);
  assert.equal(trimmed.length, 250);
  assert.deepEqual(trimmed, keys.slice(0, 250));
  assert.equal(keysToTrim(keys.slice(0, 200)).length, 0);
  assert.deepEqual(keysToTrim(keys.slice(0, 201)), [keys[0]]);
  assert.deepEqual(keysToTrim([]), []);
});

// ---------- local time ----------
test("hour slots are 7 AM..8 PM local time", () => {
  assert.deepEqual(localSlot(Date.parse("2026-11-20T12:00:00Z"), NY), { date: "2026-11-20", dow: "Fri", hour: 7, slot: 0 }); // 7:00 EST
  assert.equal(localSlot(Date.parse("2026-11-21T01:59:59Z"), NY).slot, 13); // 8:59:59 PM
  assert.equal(localSlot(Date.parse("2026-11-21T02:00:00Z"), NY).slot, -1); // 9:00 PM
  assert.equal(localSlot(Date.parse("2026-11-20T11:59:59Z"), NY).slot, -1); // 6:59:59 AM
});

test("the local date, not the UTC date, decides the day", () => {
  // 02:30 UTC on Saturday is still 9:30 PM Friday in New York.
  const s = localSlot(Date.parse("2026-11-21T02:30:00Z"), NY);
  assert.equal(s.date, "2026-11-20");
  assert.equal(s.dow, "Fri");
});

test("daylight saving starts: 7 AM local is 11:00 UTC after the change, 12:00 UTC before", () => {
  // US clocks spring forward on Sunday 8 March 2026.
  assert.deepEqual(localSlot(Date.parse("2026-03-08T11:00:00Z"), NY), { date: "2026-03-08", dow: "Sun", hour: 7, slot: 0 });
  assert.equal(localSlot(Date.parse("2026-03-07T11:00:00Z"), NY).slot, -1); // Saturday, still EST: 6 AM
  assert.equal(localSlot(Date.parse("2026-03-07T12:00:00Z"), NY).slot, 0);
  // The skipped 2 AM hour is outside the slots: nothing to miss.
  assert.equal(localSlot(Date.parse("2026-03-08T07:30:00Z"), NY).hour, 3);
});

test("daylight saving ends: the repeated 1 AM hour is outside the slots, 7 AM maps once", () => {
  // US clocks fall back on Sunday 1 November 2026.
  assert.equal(localSlot(Date.parse("2026-11-01T05:30:00Z"), NY).hour, 1); // first 1:30 AM (EDT)
  assert.equal(localSlot(Date.parse("2026-11-01T06:30:00Z"), NY).hour, 1); // second 1:30 AM (EST)
  assert.deepEqual(localSlot(Date.parse("2026-11-01T12:30:00Z"), NY), { date: "2026-11-01", dow: "Sun", hour: 7, slot: 0 });
  assert.equal(localSlot(Date.parse("2026-10-31T12:30:00Z"), NY).slot, 1); // Saturday 8:30 AM EDT
});

test("other time zones, including one with a different DST date", () => {
  assert.equal(localSlot(Date.parse("2026-11-20T15:00:00Z"), "America/Los_Angeles").slot, 0); // 7 AM PST
  assert.equal(localSlot(Date.parse("2026-03-29T06:00:00Z"), "Europe/London").slot, 0); // 7 AM BST, first day
  assert.equal(localSlot(Date.parse("2026-03-28T07:00:00Z"), "Europe/London").slot, 0); // 7 AM GMT, day before
});

test("calendar arithmetic crosses months, years and DST without drifting", () => {
  assert.equal(addDays("2026-03-08", -1), "2026-03-07");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2026-11-01", 7), "2026-11-08");
  assert.equal(dowOf("2026-11-20"), "Fri");
  assert.equal(dowOf("2026-11-22"), "Sun");
  assert.equal(dowOf("2026-11-23"), "Mon");
});

// ---------- rolling week ----------
// Fill every slot of the 7 local dates ending on `last` (and optionally the day before them).
function fullDays(last, value = (date, slot) => 50, extraDays = 0) {
  let days = {};
  for (let back = 0; back < 7 + extraDays; back++) {
    const date = addDays(last, -back);
    for (let slot = 0; slot < SLOTS; slot++) days = addSample(days, date, slot, value(date, slot));
  }
  return days;
}
// 9:30 PM on Friday 20 November 2026, New York: every slot of today has happened.
const FRI_NIGHT = Date.parse("2026-11-21T02:30:00Z");

test("no samples: no week, all 98 slots missing", () => {
  const r = rollingWeek({}, FRI_NIGHT, NY);
  assert.equal(r.week, null);
  assert.equal(r.filled, 0);
  assert.equal(r.missing.length, 98);
});

test("all 98 slots filled: a week of 7 days x 14 whole numbers, in Analytics' shape", () => {
  const r = rollingWeek(fullDays("2026-11-20", (d, s) => s * 5 + 3), FRI_NIGHT, NY);
  assert.equal(r.filled, 98);
  assert.deepEqual(Object.keys(r.week), DAYS);
  for (const d of DAYS) {
    assert.ok(Array.isArray(r.week[d]) && r.week[d].length === 14, d);
    assert.ok(r.week[d].every((v) => Number.isInteger(v) && v >= 0 && v <= 100), d);
  }
  assert.deepEqual(r.week.Mon, Array.from({ length: 14 }, (_, s) => s * 5 + 3));
});

test("one missing slot keeps the whole week back (never filled with 0)", () => {
  const days = fullDays("2026-11-20");
  delete days["2026-11-18"][9]; // Wednesday 4 PM
  const r = rollingWeek(days, FRI_NIGHT, NY);
  assert.equal(r.week, null);
  assert.equal(r.filled, 97);
  assert.deepEqual(r.missing, ["Wed 16:00"]);
});

test("a slot with zero readings is missing, not 0%", () => {
  const days = fullDays("2026-11-20");
  days["2026-11-16"][0] = { sum: 0, n: 0 };
  assert.equal(rollingWeek(days, FRI_NIGHT, NY).week, null);
});

test("each slot is the average of its readings, rounded to a whole percent", () => {
  const days = fullDays("2026-11-20");
  days["2026-11-20"][0] = addToCell(addToCell(undefined, 60), 65); // two readings: 62.5
  assert.deepEqual(days["2026-11-20"][0], { sum: 125, n: 2 });
  assert.equal(rollingWeek(days, FRI_NIGHT, NY).week.Fri[0], 63);
});

test("the window is the last 7 days: mid-morning, today's later hours come from a week ago", () => {
  // Friday 20 November, 10:15 AM (slot 3). Friday's slots 0..3 must be today's, 4..13 last Friday's.
  const now = Date.parse("2026-11-20T15:15:00Z");
  const days = fullDays("2026-11-20", (date, slot) => (date === "2026-11-20" ? 90 : date === "2026-11-13" ? 10 : 50), 1);
  const r = rollingWeek(days, now, NY);
  assert.equal(r.filled, 98);
  assert.deepEqual(r.week.Fri, [90, 90, 90, 90, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
  assert.ok(r.week.Thu.every((v) => v === 50));
});

test("data older than the window doesn't count", () => {
  // Only last week's Friday is filled for the hours still ahead today; this Friday's past hours are empty.
  const now = Date.parse("2026-11-20T15:15:00Z"); // Fri 10:15 AM
  let days = fullDays("2026-11-19"); // Sat 14th .. Thu 19th, plus Fri 13th
  // Friday 13th (8 days before Saturday's... the Friday a week ago) covers slots 4..13 only via the window.
  const r = rollingWeek(days, now, NY);
  assert.equal(r.week, null, "today's slots 0..3 haven't been recorded, and last Friday's 0..3 are outside the window");
  assert.deepEqual(r.missing, ["Fri 7:00", "Fri 8:00", "Fri 9:00", "Fri 10:00"]);
  days = addSample(days, "2026-11-20", 3, 40);
  assert.equal(rollingWeek(days, now, NY).filled, 95);
});

test("before 7 AM, all of today's slots come from a week ago", () => {
  const now = Date.parse("2026-11-20T10:00:00Z"); // Fri 5 AM
  const days = fullDays("2026-11-19", (date) => (date === "2026-11-13" ? 20 : 50));
  const r = rollingWeek(days, now, NY);
  assert.equal(r.filled, 98);
  assert.ok(r.week.Fri.every((v) => v === 20));
});

test("the week across the spring DST change keeps 14 slots for the short Sunday", () => {
  // Saturday 14 March 2026, 9:30 PM EDT: the window includes Sunday 8 March (23 hours long).
  const now = Date.parse("2026-03-15T01:30:00Z");
  const r = rollingWeek(fullDays("2026-03-14"), now, NY);
  assert.equal(r.filled, 98);
  assert.equal(r.week.Sun.length, 14);
});

test("old sample days are pruned after 8 days", () => {
  assert.deepEqual(staleDates(["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-20"], "2026-11-20"), ["2026-11-11"]);
});

// ---------- time zone ----------
test("time zone: env, then the site's schedule settings, then America/New_York", () => {
  const schedules = { s1: { settings: { timezone: "America/Chicago" } }, s2: { settings: { timezone: "America/Chicago" } } };
  assert.equal(pickTimezone({ envTimezone: "Europe/London", schedules }).tz, "Europe/London");
  assert.throws(() => pickTimezone({ envTimezone: "Mars/Olympus" }));
  assert.equal(pickTimezone({ siteId: "s1", schedules }).tz, "America/Chicago");
  assert.equal(pickTimezone({ siteId: "nope", schedules }).tz, NY);
  assert.equal(pickTimezone({ schedules }).tz, "America/Chicago"); // every site agrees
  const split = pickTimezone({ schedules: { ...schedules, s3: { settings: { timezone: "America/Denver" } } } });
  assert.equal(split.tz, NY);
  assert.match(split.source, /disagree/);
  assert.equal(pickTimezone({}).tz, NY);
  assert.equal(pickTimezone({ schedules: { s1: { settings: { timezone: "nonsense" } } } }).tz, NY);
});

// ---------- which curbs count (the allowlist) ----------
test("parseUnitList trims, drops blanks and duplicates, and keeps order", () => {
  assert.deepEqual(parseUnitList("C-095,C-201"), ["C-095", "C-201"]);
  assert.deepEqual(parseUnitList(" C-095 , ,C-201,C-095 "), ["C-095", "C-201"]);
  assert.deepEqual(parseUnitList("C-201"), ["C-201"]);
});

test("parseUnitList: nothing given means no allowlist (every curb counts)", () => {
  for (const blank of [undefined, null, "", "   ", ",", " , "]) assert.equal(parseUnitList(blank), null, JSON.stringify(blank));
});

test("parseUnitList rejects IDs the database can't have", () => {
  for (const bad of ["C.095", "C-095,lots/x", "C#1", "C$", "C[1]"]) assert.throws(() => parseUnitList(bad), /Not a curb ID/, bad);
});

test("unitsOption: --units wins over RECORD_UNITS, in both flag forms", () => {
  const env = { RECORD_UNITS: "C-001" };
  assert.deepEqual(unitsOption(["--units", "C-095,C-201"], env), { units: ["C-095", "C-201"], source: "--units" });
  assert.deepEqual(unitsOption(["--interval", "60", "--units=C-095"], env), { units: ["C-095"], source: "--units" });
  assert.deepEqual(unitsOption([], env), { units: ["C-001"], source: "RECORD_UNITS" });
});

test("unitsOption: neither given keeps the current behaviour", () => {
  assert.deepEqual(unitsOption([], {}), { units: null, source: null });
  assert.deepEqual(unitsOption(["--interval", "60"], { RECORD_UNITS: "  " }), { units: null, source: null });
});

test("unitsOption: --units without a list is an error, not 'count everything'", () => {
  assert.throws(() => unitsOption(["--units"], {}), /--units needs/);
  assert.throws(() => unitsOption(["--units", "--interval", "5"], {}), /--units needs/);
  assert.throws(() => unitsOption(["--units="], {}), /--units needs/);
  assert.throws(() => unitsOption(["--units", " , "], {}), /--units needs/);
});

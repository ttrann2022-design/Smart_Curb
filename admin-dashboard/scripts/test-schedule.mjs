// Timed states: the evaluator (shared/schedule.js) and the runner (scheduler/runOnce.js).
// Plain Node, no network.
//   npm run test:schedule
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DEFAULT_RULE_ID, LED_COLORS, LOOK_LIMITS, effectiveLook, isTimezone, lookAtWall, lookErrors, lookKey, lotSummary, parseTime, ruleErrors, settingsErrors, wallClock,
} from "../shared/schedule.js";
import { runOnce } from "../scheduler/runOnce.js";
import { LED_COLORS as THEME_COLORS } from "../src/theme.js";

const NY = "America/New_York";
const DAY_LOOK = { ledColor: "blue", panelText: "OPEN", ledBrightness: 100 };
const DIM = { ledColor: "blue", panelText: "OPEN", ledBrightness: 10 };
const RESERVED = { ledColor: "gold", panelText: "RESERVED", ledBrightness: 80 };
const EVENT = { ledColor: "red", panelText: "EVENT", ledBrightness: 100 };
const SETTINGS = { enabled: true, timezone: NY, default: DAY_LOOK };
const EVERY = [0, 1, 2, 3, 4, 5, 6];
const rule = (over = {}) => ({ name: "Rule", enabled: true, days: EVERY, start: "22:00", end: "06:00", target: { type: "site" }, look: DIM, priority: 5, updatedAt: 1, updatedBy: "u", ...over });
// New York wall time as an instant. Standard time: UTC-5, daylight time: UTC-4.
const est = (y, m, d, h, min = 0) => Date.UTC(y, m - 1, d, h + 5, min);
const edt = (y, m, d, h, min = 0) => Date.UTC(y, m - 1, d, h + 4, min);
const at = (rules, now, settings = SETTINGS, unit = "C-001", lot = "lot1") => effectiveLook(unit, lot, rules, settings, now);

// 2026-11-06 is a Friday, 2026-11-07 a Saturday (standard time).
const FRI = (h, min) => est(2026, 11, 6, h, min);
const SAT = (h, min) => est(2026, 11, 7, h, min);

test("the wall clock follows the site's timezone", () => {
  assert.deepEqual({ ...wallClock(FRI(9, 30), NY), offset: undefined }, { day: 5, minutes: 570, offset: undefined });
  assert.equal(wallClock(FRI(9, 30), "Asia/Tokyo").day, 5);
  assert.equal(wallClock(FRI(9, 30), "Asia/Tokyo").minutes, 23 * 60 + 30);
  assert.equal(wallClock(FRI(23, 30), "Asia/Tokyo").day, 6);
  // Midnight reads as 00:00, never 24:00.
  assert.equal(wallClock(SAT(0), NY).minutes, 0);
});

test("a window's start is inclusive and its end exclusive", () => {
  const rules = { r: rule({ start: "09:00", end: "17:00", days: [5] }) };
  assert.equal(at(rules, FRI(8, 59)).ruleId, DEFAULT_RULE_ID);
  assert.equal(at(rules, FRI(9, 0)).ruleId, "r");
  assert.equal(at(rules, FRI(16, 59)).ruleId, "r");
  assert.equal(at(rules, FRI(17, 0)).ruleId, DEFAULT_RULE_ID);
});

test("a window that crosses midnight belongs to the day it starts", () => {
  const rules = { r: rule({ days: [5] }) };
  assert.equal(at(rules, FRI(21, 59)).ruleId, DEFAULT_RULE_ID);
  assert.equal(at(rules, FRI(22, 0)).ruleId, "r");
  assert.equal(at(rules, FRI(23, 59)).ruleId, "r");
  assert.equal(at(rules, SAT(0, 0)).ruleId, "r");
  assert.equal(at(rules, SAT(3)).ruleId, "r");
  assert.equal(at(rules, SAT(5, 59)).ruleId, "r");
  assert.equal(at(rules, SAT(6, 0)).ruleId, DEFAULT_RULE_ID);
  // Saturday's own evening isn't in it, and neither is Friday morning (that's Thursday's).
  assert.equal(at(rules, SAT(22)).ruleId, DEFAULT_RULE_ID);
  assert.equal(at(rules, FRI(3)).ruleId, DEFAULT_RULE_ID);
});

test("day boundaries: Saturday's overnight runs into Sunday, across the week's wrap", () => {
  const rules = { r: rule({ days: [6] }) };
  assert.equal(at(rules, est(2026, 11, 8, 3)).ruleId, "r"); // Sunday 03:00
  const sunday = { r: rule({ days: [0], start: "00:00", end: "01:00" }) };
  assert.equal(at(sunday, est(2026, 11, 8, 0, 30)).ruleId, "r");
  assert.equal(at(sunday, SAT(23, 59)).ruleId, DEFAULT_RULE_ID);
});

test("several matches: priority, then the more specific target, then the later start", () => {
  const low = rule({ priority: 2, look: DIM, start: "00:00", end: "23:00" });
  const high = rule({ priority: 8, look: RESERVED, start: "00:00", end: "23:00" });
  assert.equal(at({ low, high }, FRI(9)).ruleId, "high");
  // Equal priority: curbs beat lots beat the whole site, whatever the start time.
  const base = { start: "08:00", end: "23:00" };
  const site = rule({ ...base, start: "09:00", target: { type: "site" } });
  const lots = rule({ ...base, target: { type: "lots", ids: ["lot1"] } });
  const units = rule({ ...base, start: "07:00", target: { type: "units", ids: ["C-001"] } });
  assert.equal(at({ site, lots, units }, FRI(10)).ruleId, "units");
  assert.equal(at({ site, lots }, FRI(10)).ruleId, "lots");
  assert.equal(at({ site, lots, units }, FRI(10), SETTINGS, "C-002").ruleId, "lots");
  assert.equal(at({ site, lots, units }, FRI(10), SETTINGS, "C-002", "lot2").ruleId, "site");
  // Equal priority and target: the later start wins.
  const early = rule({ start: "08:00", end: "12:00" });
  const late = rule({ start: "09:00", end: "12:00", look: RESERVED });
  assert.equal(at({ early, late }, FRI(10)).ruleId, "late");
  // "Later" means when the window actually began: Friday 22:00 is before Saturday 01:00,
  // even though 22:00 is the larger clock time.
  const overnight = rule({ days: [5] });
  const saturday = rule({ days: [6], start: "01:00", end: "04:00", look: RESERVED });
  assert.equal(at({ overnight, saturday }, SAT(3)).ruleId, "saturday");
  // A complete tie is settled the same way every time, by rule ID.
  const a = rule({ start: "08:00", end: "12:00" });
  assert.equal(at({ b: a, a }, FRI(10)).ruleId, "a");
});

test("disabled rules and invalid rules are ignored; a disabled site gets nothing at all", () => {
  assert.equal(at({ r: rule({ enabled: false }) }, FRI(23)).ruleId, DEFAULT_RULE_ID);
  assert.equal(at({ r: rule({ start: "10:00", end: "10:00" }) }, FRI(10)).ruleId, DEFAULT_RULE_ID);
  assert.equal(at({ r: rule({ look: { ...DIM, ledColor: "purple" } }) }, FRI(23)).ruleId, DEFAULT_RULE_ID);
  assert.equal(at({ r: rule() }, FRI(23), { ...SETTINGS, enabled: false }), null);
  assert.equal(at({ r: rule() }, FRI(23), null), null);
});

test("no active rule falls back to the default look", () => {
  const r = at({ r: rule({ days: [1] }) }, FRI(12));
  assert.equal(r.ruleId, DEFAULT_RULE_ID);
  assert.deepEqual(r.look, DAY_LOOK);
  assert.equal(r.key, lookKey(DAY_LOOK));
  // Without a default there's nothing to show (the rules refuse enabling such a site).
  const none = at({}, FRI(12), { enabled: true, timezone: NY });
  assert.equal(none.look, null);
  assert.equal(none.key, null);
});

test("targets: lots and curbs, including a lot with no curbs", () => {
  const onLot = { r: rule({ target: { type: "lots", ids: ["lot1"] } }) };
  assert.equal(at(onLot, FRI(23), SETTINGS, null, "lot1").ruleId, "r");
  assert.equal(at(onLot, FRI(23), SETTINGS, "C-009", "lot2").ruleId, DEFAULT_RULE_ID);
  const onCurb = { r: rule({ target: { type: "units", ids: ["C-001"] } }) };
  assert.equal(at(onCurb, FRI(23), SETTINGS, { id: "C-001" }).ruleId, "r");
  assert.equal(at(onCurb, FRI(23), SETTINGS, null, "lot1").ruleId, DEFAULT_RULE_ID);
  // Firebase may return a list with gaps as an object.
  assert.equal(at({ r: rule({ days: { 0: 5 }, target: { type: "units", ids: { 3: "C-001" } } }) }, FRI(23)).ruleId, "r");
});

test("nextChangeAt: the next instant the rule or look differs", () => {
  const rules = { r: rule() };
  assert.equal(at(rules, FRI(12)).nextChangeAt, FRI(22));
  assert.equal(at(rules, FRI(22)).nextChangeAt, SAT(6));
  assert.equal(at(rules, FRI(23, 30)).nextChangeAt, SAT(6));
  // Seconds don't move it.
  assert.equal(at(rules, FRI(12) + 42000).nextChangeAt, FRI(22));
  // Nothing scheduled: nothing changes.
  assert.equal(at({}, FRI(12)).nextChangeAt, null);
  assert.equal(at({ r: rule({ enabled: false }) }, FRI(12)).nextChangeAt, null);
  // Back-to-back rules: the hand-over is the change, even with the same look.
  const one = rule({ start: "08:00", end: "12:00", look: DAY_LOOK });
  const two = rule({ start: "12:00", end: "16:00", look: DAY_LOOK });
  assert.equal(at({ one, two }, FRI(9)).nextChangeAt, FRI(12));
  // A rule on one weekday: found days ahead, skipping the edges that change nothing.
  assert.equal(at({ r: rule({ days: [1], start: "09:00", end: "10:00" }) }, FRI(12)).nextChangeAt, est(2026, 11, 9, 9));
  // A lower-priority rule's edge under a higher one isn't a change.
  const high = rule({ start: "08:00", end: "20:00", priority: 9, look: RESERVED });
  const low = rule({ start: "10:00", end: "12:00", priority: 1, look: DIM });
  assert.equal(at({ high, low }, FRI(9)).nextChangeAt, FRI(20));
});

test("DST: 2026-03-08, the clock jumps from 02:00 to 03:00", () => {
  const sun = (h, min = 0) => (h < 2 ? est(2026, 3, 8, h, min) : edt(2026, 3, 8, h, min));
  const jump = est(2026, 3, 8, 2);
  assert.equal(wallClock(jump, NY).minutes, 180);
  assert.equal(wallClock(jump - 60000, NY).minutes, 119);
  // A window keeps its wall-clock times on both sides of the change.
  const night = { r: rule() };
  assert.equal(at(night, sun(1, 30)).ruleId, "r");
  assert.equal(at(night, sun(3, 30)).ruleId, "r");
  assert.equal(at(night, sun(5, 59)).ruleId, "r");
  assert.equal(at(night, sun(6)).ruleId, DEFAULT_RULE_ID);
  assert.equal(at(night, sun(1)).nextChangeAt, sun(6));
  // The overnight window is an hour shorter in real time, ending at 06:00 as written.
  assert.equal(at(night, est(2026, 3, 7, 23)).nextChangeAt - est(2026, 3, 7, 22), 7 * 3600000);
  // A window starting in the skipped hour begins when the clock lands past its start.
  const skipped = { r: rule({ start: "02:30", end: "04:00" }) };
  assert.equal(at(skipped, sun(1, 59)).ruleId, DEFAULT_RULE_ID);
  assert.equal(at(skipped, sun(1, 59)).nextChangeAt, jump);
  assert.equal(at(skipped, sun(3)).ruleId, "r");
  // A window entirely inside the skipped hour doesn't run that night, and comes back Monday.
  const gone = { r: rule({ start: "02:10", end: "02:40" }) };
  assert.equal(at(gone, sun(3)).ruleId, DEFAULT_RULE_ID);
  assert.equal(at(gone, sun(1)).nextChangeAt, edt(2026, 3, 9, 2, 10));
  // A window ending in the skipped hour ends at the jump.
  const endsInGap = { r: rule({ start: "01:00", end: "02:30" }) };
  assert.equal(at(endsInGap, sun(1, 30)).nextChangeAt, jump);
});

test("DST: 2026-11-01, the clock repeats 01:00 to 02:00", () => {
  const firstOne = edt(2026, 11, 1, 1);
  const secondOne = est(2026, 11, 1, 1);
  assert.equal(secondOne - firstOne, 3600000);
  assert.equal(wallClock(firstOne, NY).minutes, 60);
  assert.equal(wallClock(secondOne, NY).minutes, 60);
  // The overnight window ends at 06:00 as written: an hour longer in real time.
  const night = { r: rule() };
  assert.equal(at(night, edt(2026, 10, 31, 23)).nextChangeAt, est(2026, 11, 1, 6));
  assert.equal(est(2026, 11, 1, 6) - edt(2026, 10, 31, 22), 9 * 3600000);
  assert.equal(at(night, firstOne).ruleId, "r");
  assert.equal(at(night, secondOne).ruleId, "r");
  // A window inside the repeated hour follows the clock, so it runs twice that night.
  const repeated = { r: rule({ start: "01:15", end: "01:45" }) };
  assert.equal(at(repeated, edt(2026, 11, 1, 1, 30)).ruleId, "r");
  assert.equal(at(repeated, edt(2026, 11, 1, 1, 30)).nextChangeAt, edt(2026, 11, 1, 1, 45));
  assert.equal(at(repeated, edt(2026, 11, 1, 1, 50)).ruleId, DEFAULT_RULE_ID);
  assert.equal(at(repeated, edt(2026, 11, 1, 1, 50)).nextChangeAt, est(2026, 11, 1, 1, 15));
  assert.equal(at(repeated, est(2026, 11, 1, 1, 30)).ruleId, "r");
  // Sunday is still Sunday after the repeat: the weekday doesn't slip.
  assert.equal(wallClock(secondOne, NY).day, 0);
});

test("lookAtWall previews any weekday and time, with the site switched off too", () => {
  const rules = { r: rule({ days: [5] }) };
  const off = { ...SETTINGS, enabled: false };
  assert.equal(lookAtWall("C-001", "lot1", rules, off, 5, 22 * 60).ruleId, "r");
  assert.equal(lookAtWall("C-001", "lot1", rules, off, 6, 3 * 60).ruleId, "r");
  assert.equal(lookAtWall("C-001", "lot1", rules, off, 6, 7 * 60).ruleId, DEFAULT_RULE_ID);
});

test("lotSummary: the look most curbs show, and how many differ", () => {
  const rules = { r: rule({ target: { type: "units", ids: ["C-002"] } }) };
  const evaluate = (id, lot, rs, s) => effectiveLook(id, lot, rs, s, FRI(23));
  const s = lotSummary("lot1", ["C-001", "C-002", "C-003"], rules, SETTINGS, evaluate);
  assert.equal(s.ruleId, DEFAULT_RULE_ID);
  assert.equal(s.differing, 1);
  const empty = lotSummary("lot1", [], rules, SETTINGS, evaluate);
  assert.equal(empty.ruleId, DEFAULT_RULE_ID);
  assert.equal(empty.differing, 0);
});

test("validation matches the manual LED control and the database rules", async () => {
  assert.deepEqual(LED_COLORS, THEME_COLORS);
  assert.equal(LOOK_LIMITS.panelText, 16);
  const rulesFile = await readFile(new URL("../database.rules.json", import.meta.url), "utf8");
  assert.ok(rulesFile.includes(`/^(${LED_COLORS.join("|")})$/`), "colour list in the rules");
  assert.deepEqual(lookErrors(DIM), {});
  assert.ok(lookErrors({ ...DIM, ledColor: "amber" }).ledColor);
  assert.ok(lookErrors({ ...DIM, panelText: "X".repeat(17) }).panelText);
  assert.deepEqual(lookErrors({ ...DIM, panelText: "" }), {});
  for (const b of [-1, 101, 255, 1.5, "10", undefined]) assert.ok(lookErrors({ ...DIM, ledBrightness: b }).ledBrightness, String(b));
  for (const b of [0, 100]) assert.deepEqual(lookErrors({ ...DIM, ledBrightness: b }), {});

  assert.deepEqual(ruleErrors(rule()), {});
  assert.ok(ruleErrors(rule({ name: "  " })).name);
  assert.ok(ruleErrors(rule({ days: [] })).days);
  assert.ok(ruleErrors(rule({ days: [7] })).days);
  assert.ok(ruleErrors(rule({ start: "24:00" })).start);
  assert.ok(ruleErrors(rule({ end: "9:00" })).end);
  assert.ok(ruleErrors(rule({ start: "10:00", end: "10:00" })).end);
  assert.ok(ruleErrors(rule({ target: { type: "lots" } })).target);
  assert.ok(ruleErrors(rule({ target: { type: "zone" } })).target);
  assert.ok(ruleErrors(rule({ priority: 10 })).priority);
  assert.ok(ruleErrors(rule({ look: { ...DIM, ledBrightness: 200 } })).look.ledBrightness);
  assert.equal(parseTime("00:00"), 0);
  assert.equal(parseTime("23:59"), 1439);

  assert.deepEqual(settingsErrors(SETTINGS), {});
  assert.ok(settingsErrors({ enabled: true, timezone: NY }).default, "enabling needs a default");
  assert.deepEqual(settingsErrors({ enabled: false, timezone: NY }), {});
  assert.ok(settingsErrors({ enabled: false, timezone: "Mars/Olympus" }).timezone);
  assert.equal(isTimezone(NY), true);
  assert.equal(isTimezone("Not/AZone"), false);
});

// ---------- The runner ----------

// An in-memory database: read(path) and multi-path write(updates), like the real one.
function fakeDb(data, { refuse = () => false } = {}) {
  const root = structuredClone(data);
  const writes = [];
  const walk = (path) => path.split("/").reduce((node, key) => (node ? node[key] : undefined), root);
  return {
    root, writes,
    read: async (path) => structuredClone(walk(path) ?? null),
    write: async (updates) => {
      if (Object.keys(updates).some(refuse)) throw Object.assign(new Error("PERMISSION_DENIED"), { code: "PERMISSION_DENIED" });
      writes.push(updates);
      for (const [path, value] of Object.entries(updates)) {
        const keys = path.split("/");
        const last = keys.pop();
        let node = root;
        for (const k of keys) node = (node[k] ||= {});
        node[last] = value;
      }
    },
  };
}
const world = (over = {}) => ({
  lots: { a1: { name: "A1", siteId: "siteA" }, b1: { name: "B1", siteId: "siteB" }, loose: { name: "Loose" } },
  units: {
    "C-001": { lot: "a1", online: true, occupied: true, ledColor: "white", panelText: "HELLO", ledBrightness: 50, battery: 90 },
    "C-002": { lot: "a1", online: false },
    "C-003": { lot: "b1", online: true },
    "C-004": { lot: "loose", online: true },
    "C-005": { online: true },
  },
  schedules: { siteA: { settings: SETTINGS, rules: { night: rule() } } },
  ...over,
});

test("the runner writes the manual control's exact fields, and only to a site's curbs", async () => {
  const db = fakeDb(world());
  const { sites } = await runOnce({ read: db.read, write: db.write, now: FRI(12) });
  assert.equal(sites[0].siteId, "siteA");
  assert.equal(sites[0].changed, 2);
  assert.deepEqual(Object.keys(db.writes[0]).sort(), [
    "schedules/siteA/applied/C-001", "schedules/siteA/applied/C-002",
    "units/C-001/ledBrightness", "units/C-001/ledColor", "units/C-001/panelText",
    "units/C-002/ledBrightness", "units/C-002/ledColor", "units/C-002/panelText",
  ]);
  assert.equal(db.writes.length, 1, "one multi-path write");
  // Everything else on the curb stays, and other customers' curbs aren't touched.
  assert.deepEqual(db.root.units["C-001"], { lot: "a1", online: true, occupied: true, ledColor: "blue", panelText: "OPEN", ledBrightness: 100, battery: 90 });
  assert.deepEqual(db.root.units["C-003"], { lot: "b1", online: true });
  assert.deepEqual(db.root.units["C-004"], { lot: "loose", online: true });
  assert.deepEqual(db.root.schedules.siteA.applied["C-001"], { key: lookKey(DAY_LOOK), at: FRI(12) });
});

test("the runner writes only when the look changes, so a manual edit stays until the next change", async () => {
  const db = fakeDb(world());
  await runOnce({ read: db.read, write: db.write, now: FRI(12) });
  // Someone changes the LED by hand; the next minutes leave it alone.
  db.root.units["C-001"].ledColor = "red";
  db.root.units["C-001"].panelText = "MANUAL";
  const quiet = await runOnce({ read: db.read, write: db.write, now: FRI(12, 1) });
  assert.equal(quiet.sites[0].changed, 0);
  assert.equal(quiet.sites[0].unchanged, 2);
  assert.equal(db.writes.length, 1);
  assert.equal(db.root.units["C-001"].panelText, "MANUAL");
  // The scheduled change then replaces it.
  await runOnce({ read: db.read, write: db.write, now: FRI(22) });
  assert.equal(db.root.units["C-001"].ledBrightness, 10);
  assert.equal(db.root.units["C-001"].panelText, "OPEN");
  assert.equal(db.root.units["C-001"].ledColor, "blue");
  // A hand-over between two rules with the same look changes nothing either.
  const same = fakeDb(world({ schedules: { siteA: { settings: SETTINGS, rules: {
    one: rule({ start: "08:00", end: "12:00", look: RESERVED }), two: rule({ start: "12:00", end: "16:00", look: RESERVED }),
  } } } }));
  await runOnce({ read: same.read, write: same.write, now: FRI(9) });
  same.root.units["C-001"].panelText = "MANUAL";
  await runOnce({ read: same.read, write: same.write, now: FRI(13) });
  assert.equal(same.root.units["C-001"].panelText, "MANUAL");
});

test("the runner leaves disabled sites completely alone, and skips curbs that are gone", async () => {
  const off = fakeDb(world({ schedules: { siteA: { settings: { ...SETTINGS, enabled: false }, rules: { night: rule() } } } }));
  const r = await runOnce({ read: off.read, write: off.write, now: FRI(23) });
  assert.equal(off.writes.length, 0);
  assert.deepEqual(r.sites, []);
  assert.equal(off.root.schedules.siteA.applied, undefined);
  // An applied entry for a curb that no longer exists never creates that curb again.
  const gone = fakeDb(world({ schedules: { siteA: { settings: SETTINGS, applied: { "C-999": { key: "old", at: 1 } } } } }));
  await runOnce({ read: gone.read, write: gone.write, now: FRI(12) });
  assert.equal(gone.root.units["C-999"], undefined);
  // A site that has no default (hand-edited data) is reported, not written.
  const noDefault = fakeDb(world({ schedules: { siteA: { settings: { enabled: true, timezone: NY } } } }));
  const nd = await runOnce({ read: noDefault.read, write: noDefault.write, now: FRI(12) });
  assert.equal(noDefault.writes.length, 0);
  assert.match(nd.sites[0].error, /default/);
});

test("the runner doesn't read the curbs when no site is switched on", async () => {
  const db = fakeDb(world({ schedules: { siteA: { settings: { ...SETTINGS, enabled: false } } } }));
  const paths = [];
  await runOnce({ read: (p) => { paths.push(p); return db.read(p); }, write: db.write, now: FRI(12) });
  assert.deepEqual(paths, ["schedules"]);
});

test("one bad site doesn't stop the others; a refused batch retries curb by curb", async () => {
  const twoSites = world({ schedules: {
    siteA: { settings: { ...SETTINGS, timezone: "Not/AZone" } },
    siteB: { settings: SETTINGS },
  } });
  const db = fakeDb(twoSites);
  const r = await runOnce({ read: db.read, write: db.write, now: FRI(12) });
  assert.match(r.sites.find((s) => s.siteId === "siteA").error, /timezone/i);
  assert.equal(r.sites.find((s) => s.siteId === "siteB").changed, 1);
  assert.equal(db.root.units["C-003"].panelText, "OPEN");

  const refused = fakeDb(world(), { refuse: (path) => path.startsWith("units/C-002") });
  const out = await runOnce({ read: refused.read, write: refused.write, now: FRI(12) });
  assert.equal(out.sites[0].changed, 1);
  assert.equal(out.sites[0].failed, 1);
  assert.equal(refused.root.units["C-001"].panelText, "OPEN");
  // Nothing recorded for the refused curb, so the next run tries it again.
  assert.equal(refused.root.schedules.siteA.applied["C-002"], undefined);
});

test("many curbs go in batches, and siteIds limits a run to one customer", async () => {
  const units = Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`C-${i}`, { lot: "a1" }]));
  const db = fakeDb(world({ units }));
  const r = await runOnce({ read: db.read, write: db.write, now: FRI(12), batchSize: 100 });
  assert.equal(r.sites[0].changed, 250);
  assert.equal(db.writes.length, 3);
  assert.equal(Object.keys(db.writes[0]).length, 400);

  const both = fakeDb(world({ schedules: { siteA: { settings: SETTINGS }, siteB: { settings: SETTINGS } } }));
  const paths = [];
  const one = await runOnce({ read: (p) => { paths.push(p); return both.read(p); }, write: both.write, now: FRI(12), siteIds: ["siteB"] });
  assert.deepEqual(one.sites.map((s) => s.siteId), ["siteB"]);
  // A manager can read only their own site's schedule, so it never reads schedules/.
  assert.ok(paths.includes("schedules/siteB") && !paths.includes("schedules"));
  assert.equal(both.root.units["C-001"].panelText, "HELLO");
  assert.equal(both.root.units["C-003"].panelText, "OPEN");
});

test("the shared code stays free of Firebase and the network", async () => {
  for (const file of ["../shared/schedule.js", "../scheduler/runOnce.js"]) {
    const code = (await readFile(new URL(file, import.meta.url), "utf8")).replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, /from ["'](firebase|firebase-admin)|fetch\(|XMLHttpRequest|require\(/, file);
  }
  const shared = (await readFile(new URL("../shared/schedule.js", import.meta.url), "utf8")).replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(shared, /^import /m);
});

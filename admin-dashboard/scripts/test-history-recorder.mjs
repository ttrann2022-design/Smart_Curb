// The history recorder against the local Realtime Database emulator, with fake curbs.
// It never talks to the real database: the host must be local, and it uses its own
// throwaway namespace.
//
//   1. Start the emulator:   npm run emulators   (or the database emulator jar on its own)
//   2. In another terminal:  npm run test:history-recorder
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9000";
if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(HOST)) {
  throw new Error(`Refusing to run against ${HOST}: only a local emulator is allowed.`);
}
process.env.FIREBASE_DATABASE_EMULATOR_HOST = HOST; // the Admin SDK reads this
const NS = "sws-history-test";
const DATABASE_URL = `https://${NS}.firebaseio.com`;

const { initializeApp, deleteApp } = await import("firebase-admin/app");
const { getDatabase } = await import("firebase-admin/database");
const { createRecorder, shallowKeys, checkKeyPath } = await import("../scheduler/recordHistory.js");
const { localSlot, addDays, SLOTS } = await import("../scheduler/history.js");

const OWNER = { Authorization: "Bearer owner" };
const rest = async (method, path, body) => {
  const res = await fetch(`http://${HOST}/${path}.json?ns=${NS}`, { method, headers: OWNER, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Same check Analytics and the Assistant make before showing a week.
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const analyticsAcceptsWeek = (week) => !!week && DAYS.every((d) => Array.isArray(week[d]) && week[d].length === 14);

let app, db, recorder;
const listKeys = shallowKeys({ databaseURL: DATABASE_URL, emulatorHost: HOST });
// A big string standing in for a camera snapshot, to show the recorder never loads it.
const SNAPSHOT = "x".repeat(200000);

const FAKE_CURBS = {
  "C-001": { lot: "lot1", online: true, occupied: true, lastSnapshot: SNAPSHOT },
  "C-002": { lot: "lot1", online: true, occupied: true },
  "C-003": { lot: "lot1", online: true, occupied: false },
  "C-004": { lot: "lot1", online: false, occupied: true }, // offline: not counted
};

before(async () => {
  try { await fetch(`http://${HOST}/.json?ns=${NS}`); } catch {
    throw new Error(`No emulator at ${HOST}. Start it first (npm run emulators).`);
  }
  app = initializeApp({ databaseURL: DATABASE_URL, projectId: "sws-history-test" }, "history-test");
  db = getDatabase(app);
});

after(async () => {
  recorder?.stop();
  await deleteApp(app);
});

beforeEach(async () => {
  recorder?.stop();
  await rest("PUT", "", { units: FAKE_CURBS, schedules: { site1: { settings: { timezone: "America/New_York" } } } });
  recorder = createRecorder({ db, listKeys, env: {} });
  await recorder.refresh();
  assert.ok(await recorder.ready(), "listeners delivered every curb's online and occupied");
});

const liveEntries = async () => Object.entries((await rest("GET", "history/live")) || {});

test("a tick writes { t: server time, pct } with a push ID, from online curbs only", async () => {
  const before = Date.now();
  const r = await recorder.tick();
  assert.equal(r.pct, 67); // 2 of the 3 online curbs occupied; C-004 is offline
  const entries = await liveEntries();
  assert.equal(entries.length, 1);
  const [key, value] = entries[0];
  assert.match(key, /^-[\w-]{19}$/, "a push ID");
  assert.deepEqual(Object.keys(value).sort(), ["pct", "t"]);
  assert.ok(Number.isInteger(value.pct) && value.pct === 67);
  assert.ok(typeof value.t === "number" && Math.abs(value.t - before) < 60000, "server timestamp");
});

test("the recorder holds only online and occupied per curb, never the whole record", async () => {
  for (const u of Object.values(recorder.units)) assert.deepEqual(Object.keys(u).sort(), ["occupied", "online"]);
  assert.ok(!JSON.stringify(recorder.units).includes("xxxx"), "no lastSnapshot");
});

test("follows curb changes through its listeners", async () => {
  await rest("PATCH", "units/C-003", { occupied: true });
  await sleep(300);
  assert.equal((await recorder.tick()).pct, 100);
  await rest("PATCH", "units/C-001", { online: false });
  await sleep(300);
  assert.equal((await recorder.tick()).pct, 100); // 2 online, both occupied
});

test("with no online curbs the tick is skipped: nothing written, never 0", async () => {
  await rest("PATCH", "units", { "C-001/online": false, "C-002/online": false, "C-003/online": false });
  await sleep(300);
  assert.deepEqual(await recorder.tick(), { skipped: true });
  assert.equal((await liveEntries()).length, 0);
  assert.equal(await rest("GET", "historySamples"), null);
});

test("new and removed curbs are picked up on refresh", async () => {
  await rest("PUT", "units/C-005", { lot: "lot1", online: true, occupied: false });
  await rest("DELETE", "units/C-001");
  const { curbs } = await recorder.refresh();
  assert.equal(curbs, 4);
  await recorder.ready();
  assert.ok("C-005" in recorder.units && !("C-001" in recorder.units));
  assert.equal((await recorder.tick()).pct, 33); // C-002 occupied, C-003 and C-005 free
});

test("history/live is trimmed to the newest 200 after each write", async () => {
  // 250 older readings with keys that sort before any new push ID.
  const old = Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`-A${String(i).padStart(18, "0")}`, { t: i, pct: 1 }]));
  await rest("PUT", "history/live", old);
  const r = await recorder.tick();
  assert.equal(r.trimmed, 51);
  const entries = await liveEntries();
  assert.equal(entries.length, 200);
  const keys = entries.map(([k]) => k).sort();
  assert.equal(keys[0], "-A000000000000000051", "the oldest were removed");
  assert.ok(entries.some(([k, v]) => !k.startsWith("-A") && v.pct === 67), "the new reading was kept");
});

test("each tick adds to its local date and hour in historySamples/, in the site's time zone", async () => {
  const at = Date.parse("2026-11-20T15:20:00Z"); // 10:20 AM in New York: slot 3
  await recorder.tick(at);
  await recorder.tick(at + 1000);
  assert.deepEqual(await rest("GET", "historySamples/days/2026-11-20/3"), { sum: 134, n: 2 });

  // Another time zone from the site's schedule settings.
  await rest("PUT", "schedules/site1/settings/timezone", "America/Los_Angeles");
  await recorder.refresh();
  await recorder.tick(at); // 7:20 AM in Los Angeles: slot 0
  assert.deepEqual(await rest("GET", "historySamples/days/2026-11-20/0"), { sum: 67, n: 1 });
});

test("outside 7 AM..8 PM, live gets the reading but no hour slot does", async () => {
  await recorder.tick(Date.parse("2026-11-21T03:00:00Z")); // 10 PM
  assert.equal((await liveEntries()).length, 1);
  assert.equal(await rest("GET", "historySamples"), null);
});

// Samples for every slot of the 7 dates ending on `last`, except any listed in `skip`.
function samplesFor(last, skip = []) {
  const days = {};
  for (let back = 0; back < 7; back++) {
    const date = addDays(last, -back);
    days[date] = {};
    for (let slot = 0; slot < SLOTS; slot++) if (!skip.includes(`${date}/${slot}`)) days[date][slot] = { sum: 50, n: 1 };
  }
  return days;
}
const FRI_NIGHT = Date.parse("2026-11-21T02:30:00Z"); // 9:30 PM Friday in New York

test("history/week stays absent until all 98 slots have readings", async () => {
  await rest("PUT", "historySamples/days", samplesFor("2026-11-20", ["2026-11-17/5"]));
  const r = await recorder.tick(FRI_NIGHT);
  assert.equal(r.filled, 97);
  assert.equal(await rest("GET", "history/week"), null);
  assert.equal((await liveEntries()).length, 1, "live is still recorded");
});

test("once all 98 are filled, history/week is written in exactly the shape Analytics accepts", async () => {
  await rest("PUT", "historySamples/days", samplesFor("2026-11-20"));
  const r = await recorder.tick(FRI_NIGHT);
  assert.equal(r.filled, 98);
  assert.ok(r.wroteWeek);
  const week = await rest("GET", "history/week");
  assert.ok(analyticsAcceptsWeek(week), JSON.stringify(week));
  assert.deepEqual(Object.keys(week).sort(), [...DAYS].sort());
  for (const d of DAYS) assert.ok(week[d].every((v) => Number.isInteger(v) && v >= 0 && v <= 100));
});

test("sample days older than 8 days are pruned", async () => {
  await rest("PUT", "historySamples/days", { "2026-11-01": { 0: { sum: 10, n: 1 } }, "2026-11-19": { 0: { sum: 10, n: 1 } } });
  await recorder.tick(FRI_NIGHT);
  const left = Object.keys((await rest("GET", "historySamples/days")) || {});
  assert.deepEqual(left, ["2026-11-19"]);
});

test("the key must exist and live outside the repo", () => {
  assert.match(checkKeyPath(undefined), /GOOGLE_APPLICATION_CREDENTIALS/);
  assert.match(checkKeyPath("scheduler/key.json"), /inside the repo/);
  assert.match(checkKeyPath("C:/definitely/not/here-key.json"), /No file/);
});

test("local slots used by the recorder match the unit-tested helper", () => {
  assert.equal(localSlot(Date.parse("2026-11-20T15:20:00Z"), "America/New_York").slot, 3);
});

// npm run history:record: records occupancy history from the live curbs, for Analytics.
// Runs on a computer (the project is on the Spark plan, so no Cloud Functions) and only
// records while it's running. Stop it with Ctrl+C.
//
// Every tick (30 s by default):
//   1. percent full across all online curbs, by the dashboard's rule (scheduler/history.js)
//   2. push { t: server time, pct } to history/live, then trim history/live to the newest 200
//   3. add pct to the current local hour in historySamples/ (private to the recorder)
//   4. write history/week, but only once all 98 day-and-hour slots of the rolling last
//      7 days have real readings; until then history/week stays absent
// Ticks with no online curbs are skipped, so nothing is ever recorded as 0 by default.
//
// Downloads stay small: curb IDs come from a shallow query (refreshed every few minutes)
// and the recorder listens only to units/<id>/online and units/<id>/occupied, never to the
// whole curb record (which can carry lastSnapshot image data).
//
// Credentials: GOOGLE_APPLICATION_CREDENTIALS must point at a service account key kept
// OUTSIDE this repo. With FIREBASE_DATABASE_EMULATOR_HOST set it talks to the local
// emulator instead and needs no key.
//
// Options (environment variables, or flags):
//   HISTORY_INTERVAL_SECONDS / --interval <s>   seconds between ticks (default 30, minimum 5)
//   HISTORY_TIMEZONE                           time zone for the week (default: see pickTimezone)
//   HISTORY_SITE_ID                            take the time zone from schedules/<id>/settings
//   HISTORY_DATABASE_URL                       database URL (default: this project's)
//   RECORD_UNITS / --units C-095,C-201         count only these curbs (the flag wins); without
//                                              either, every curb in units/ counts
import { existsSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { initializeApp, applicationDefault, deleteApp } from "firebase-admin/app";
import { getDatabase, ServerValue } from "firebase-admin/database";
import {
  DEFAULT_INTERVAL_MS, LIVE_KEEP, addDays, addToCell, keysToTrim, localSlot, percentFull,
  pickTimezone, rollingWeek, staleDates, unitsOption,
} from "./history.js";

export const DEFAULT_DATABASE_URL = "https://smartcurb-d174e-default-rtdb.firebaseio.com";
const REFRESH_MS = 5 * 60 * 1000; // curb IDs and time zone
const PRUNE_MS = 60 * 60 * 1000; // old sample days
const REPO_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

// Keys under a path without downloading what's below them (REST ?shallow=true).
// The Admin SDK has no shallow read, so this uses REST with the same credentials.
export function shallowKeys({ databaseURL, emulatorHost, credential }) {
  return async (path) => {
    let url;
    const headers = {};
    if (emulatorHost) {
      const ns = new URL(databaseURL).hostname.split(".")[0];
      url = `http://${emulatorHost}/${path}.json?ns=${ns}&shallow=true`;
      headers.Authorization = "Bearer owner";
    } else {
      const { access_token: token } = await credential.getAccessToken();
      url = `${databaseURL.replace(/\/$/, "")}/${path}.json?shallow=true`;
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Shallow read of ${path} failed: ${res.status} ${await res.text()}`);
    const body = await res.json();
    return body && typeof body === "object" ? Object.keys(body) : [];
  };
}

// The recorder, given a database and a way to list keys. Timers are left to main(), so
// tests can call refresh() and tick() directly.
// onlyUnits: curb IDs to count (the allowlist), or null to count every curb.
export function createRecorder({ db, listKeys, env = {}, onlyUnits = null, log = () => {} }) {
  const units = {}; // unitId -> { online, occupied }, from two small listeners each
  const listeners = new Map(); // unitId -> unsubscribe
  let tz = null;
  let tzSource = "";
  let lastWeekJson = null;
  let lastMissing = "";
  let lastPrune = 0;
  let offset = 0;
  const offsetRef = db.ref(".info/serverTimeOffset");
  const onOffset = (s) => { offset = Number(s.val()) || 0; };
  offsetRef.on("value", onOffset);

  function watch(id) {
    units[id] = {};
    const refs = ["online", "occupied"].map((field) => {
      const r = db.ref(`units/${id}/${field}`);
      const cb = (s) => { units[id][field] = s.val(); };
      r.on("value", cb);
      return () => r.off("value", cb);
    });
    listeners.set(id, () => refs.forEach((off) => off()));
  }

  // Curb IDs (shallow) and the time zone. New curbs get listeners; removed ones lose them.
  // With an allowlist, only the listed curbs that exist are watched; the rest never are.
  async function refresh() {
    const all = await listKeys("units");
    const ids = new Set(onlyUnits ? onlyUnits.filter((id) => all.includes(id)) : all);
    const missing = onlyUnits ? onlyUnits.filter((id) => !all.includes(id)) : [];
    if (missing.join(",") !== lastMissing) {
      if (missing.length) log(`Not in units/, so not counted: ${missing.join(", ")}.`);
      lastMissing = missing.join(",");
    }
    for (const id of ids) if (!listeners.has(id)) watch(id);
    for (const [id, off] of listeners) {
      if (!ids.has(id)) { off(); listeners.delete(id); delete units[id]; }
    }
    let schedules = {};
    if (!env.HISTORY_TIMEZONE) {
      const siteIds = env.HISTORY_SITE_ID ? [env.HISTORY_SITE_ID] : await listKeys("schedules");
      const zones = await Promise.all(siteIds.map(async (id) => [id, (await db.ref(`schedules/${id}/settings/timezone`).get()).val()]));
      schedules = Object.fromEntries(zones.map(([id, timezone]) => [id, { settings: { timezone } }]));
    }
    const picked = pickTimezone({ envTimezone: env.HISTORY_TIMEZONE, siteId: env.HISTORY_SITE_ID, schedules });
    if (picked.tz !== tz) log(`Time zone ${picked.tz} (${picked.source}).`);
    tz = picked.tz;
    tzSource = picked.source;
    return { curbs: ids.size, missing, tz, tzSource };
  }

  // Wait until every watched curb has delivered its first online and occupied values.
  async function ready(timeoutMs = 10000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (Object.values(units).every((u) => "online" in u && "occupied" in u)) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  }

  async function trimLive() {
    const extra = keysToTrim(await listKeys("history/live"), LIVE_KEEP);
    if (extra.length) await db.ref("history/live").update(Object.fromEntries(extra.map((k) => [k, null])));
    return extra.length;
  }

  // One tick. `at` is the time used for the local hour slot (defaults to server-corrected now).
  async function tick(at = Date.now() + offset) {
    if (!tz) await refresh();
    const pct = percentFull(units);
    if (pct === null) {
      log("No online curbs, so nothing recorded this tick.");
      return { skipped: true };
    }
    await db.ref("history/live").push({ t: ServerValue.TIMESTAMP, pct });
    const trimmed = await trimLive();

    const here = localSlot(at, tz);
    if (here.slot !== -1) {
      await db.ref(`historySamples/days/${here.date}/${here.slot}`).transaction((cell) => addToCell(cell, pct));
    }

    // The rolling week needs the last 8 local dates of samples (today's later hours use last week's).
    const since = addDays(here.date, -7);
    const days = (await db.ref("historySamples/days").orderByKey().startAt(since).get()).val() || {};
    const { week, filled } = rollingWeek(days, at, tz);
    let wroteWeek = false;
    if (week) {
      const json = JSON.stringify(week);
      if (json !== lastWeekJson) {
        await db.ref("history/week").set(week);
        lastWeekJson = json;
        wroteWeek = true;
      }
    }

    if (Date.now() - lastPrune > PRUNE_MS) {
      lastPrune = Date.now();
      const old = staleDates(await listKeys("historySamples/days"), here.date);
      if (old.length) await db.ref("historySamples/days").update(Object.fromEntries(old.map((d) => [d, null])));
    }
    return { pct, slot: here, trimmed, filled, wroteWeek };
  }

  function stop() {
    offsetRef.off("value", onOffset);
    for (const off of listeners.values()) off();
    listeners.clear();
  }

  return { refresh, ready, tick, stop, units };
}

// ---------- npm run history:record ----------

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

// The key must exist and live outside the repo, so it can't be committed by accident.
export function checkKeyPath(keyPath, repoRoot = REPO_ROOT) {
  if (!keyPath) {
    return "Set GOOGLE_APPLICATION_CREDENTIALS to the path of your service account key (see the README, \"Recording occupancy history\").";
  }
  const abs = resolve(keyPath);
  const rel = relative(repoRoot, abs);
  if (!rel.startsWith("..") && !isAbsolute(rel)) {
    return `The key at ${abs} is inside the repo. Move it outside ${repoRoot} so it can never be committed.`;
  }
  if (!existsSync(abs)) return `No file at ${abs} (GOOGLE_APPLICATION_CREDENTIALS).`;
  return null;
}

async function main() {
  const env = process.env;
  const emulatorHost = env.FIREBASE_DATABASE_EMULATOR_HOST;
  const databaseURL = env.HISTORY_DATABASE_URL || DEFAULT_DATABASE_URL;
  const seconds = Number(arg("--interval") ?? env.HISTORY_INTERVAL_SECONDS ?? DEFAULT_INTERVAL_MS / 1000);
  if (!Number.isFinite(seconds) || seconds < 5) { console.error("The interval must be at least 5 seconds."); process.exit(1); }

  let only;
  try { only = unitsOption(process.argv.slice(2), env); } catch (err) { console.error(err.message); process.exit(1); }

  let app;
  if (emulatorHost) {
    if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(emulatorHost)) { console.error(`Refusing emulator host ${emulatorHost}: only a local emulator is allowed.`); process.exit(1); }
    app = initializeApp({ databaseURL, projectId: "smartcurb-d174e" });
    console.log(`Recording to the LOCAL emulator at ${emulatorHost}.`);
  } else {
    const problem = checkKeyPath(env.GOOGLE_APPLICATION_CREDENTIALS);
    if (problem) { console.error(problem); process.exit(1); }
    app = initializeApp({ credential: applicationDefault(), databaseURL });
    console.log(`Recording to ${databaseURL}.`);
  }

  const db = getDatabase(app);
  const listKeys = shallowKeys({ databaseURL, emulatorHost, credential: app.options.credential });
  const recorder = createRecorder({ db, listKeys, env, onlyUnits: only.units, log: (m) => console.log(`${new Date().toLocaleTimeString()}  ${m}`) });

  console.log(only.units
    ? `Counting only these curbs (from ${only.source}): ${only.units.join(", ")}.`
    : "Counting every curb in units/ (no --units or RECORD_UNITS given).");
  const { curbs } = await recorder.refresh();
  console.log(`Watching ${curbs} curbs. A reading every ${seconds} s. Ctrl+C to stop.`);
  await recorder.ready();

  let running = false;
  const doTick = async () => {
    if (running) return; // a slow tick never overlaps the next one
    running = true;
    try {
      const r = await recorder.tick();
      if (!r.skipped) {
        console.log(`${new Date().toLocaleTimeString()}  ${r.pct}% full${r.trimmed ? `, trimmed ${r.trimmed} old readings` : ""}. Week: ${r.filled} of 98 hours${r.wroteWeek ? ", history/week updated" : r.filled === 98 ? "" : " (history/week waits for all 98)"}.`);
      }
    } catch (err) {
      console.error(`${new Date().toLocaleTimeString()}  Tick failed: ${err.message}`);
    } finally {
      running = false;
    }
  };
  const refreshTimer = setInterval(() => recorder.refresh().catch((err) => console.error(`Refresh failed: ${err.message}`)), REFRESH_MS);
  const tickTimer = setInterval(doTick, seconds * 1000);
  await doTick();

  const shutdown = async () => {
    clearInterval(tickTimer);
    clearInterval(refreshTimer);
    recorder.stop();
    await deleteApp(app);
    console.log("Stopped. Nothing is recorded until you start it again.");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}

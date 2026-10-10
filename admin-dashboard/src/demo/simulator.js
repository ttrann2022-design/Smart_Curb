import {
  ref, get, update, onValue, push, remove, runTransaction, onDisconnect,
  query, orderByKey, limitToLast, endBefore,
} from "firebase/database";
import { auth, database } from "../firebase";
import { SIM_ROOT } from "../dataMode";

// Everything in this file reads and writes ONLY under SIM_ROOT ("demo/").
// It deliberately never uses dataPath(), so switching the dashboard to Live
// can't redirect a running simulation onto real curbs like units/C-095.
if (SIM_ROOT !== "demo/") throw new Error("Simulation root must be demo/.");
const simPath = (path) => SIM_ROOT + path;

function writeSim(updates) {
  Object.keys(updates).forEach((key) => {
    if (!key.startsWith(SIM_ROOT)) throw new Error(`Refusing to write outside the simulation: ${key}`);
  });
  return update(ref(database), updates);
}

export const DEMO_LOTS = {
  lot06: { name: "Lot 6", count: 20, target: 0.55, led: "green", text: "LOT 6" },
  lot07: { name: "Lot 7", count: 24, target: 0.75, led: "blue", text: "LOT 7" },
  lot12: { name: "Lot 12", count: 28, target: 0.85, led: "red", text: "LOT 12" },
  lot14: { name: "Lot 14", count: 22, target: 0.95, led: "gold", text: "LOT 14" },
};
export const DEMO_CURB_COUNT = Object.values(DEMO_LOTS).reduce((s, l) => s + l.count, 0);
export const DEMO_LOT_COUNT = Object.keys(DEMO_LOTS).length;

const TICK_MS = 2000;
const LIVE_KEEP = 200;
const LOCK_PATH = simPath("simLock");
const LOCK_STALE_MS = 15000;
const SESSION = Math.random().toString(36).slice(2) + Date.now().toString(36);

function lotStats(units) {
  const stats = {};
  Object.keys(DEMO_LOTS).forEach((lotId) => { stats[lotId] = { openSpots: 0, totalSpots: 0 }; });
  Object.values(units).forEach((u) => {
    const s = stats[u.lot];
    if (!s) return;
    s.totalSpots += 1;
    if (u.online && !u.occupied) s.openSpots += 1;
  });
  return stats;
}

function buildDemoData() {
  const lots = {};
  const units = {};
  const now = Date.now();
  let n = 1;
  Object.entries(DEMO_LOTS).forEach(([lotId, lot]) => {
    lots[lotId] = { name: lot.name, units: {} };
    for (let i = 0; i < lot.count; i++) {
      const id = "C-" + String(n).padStart(3, "0");
      n += 1;
      units[id] = {
        lot: lotId,
        occupied: Math.random() < lot.target,
        battery: 45 + Math.floor(Math.random() * 56),
        online: true,
        ledColor: lot.led,
        panelText: lot.text,
        lastUpdated: now - Math.floor(Math.random() * 45 * 60000),
      };
      lots[lotId].units[id] = true;
    }
  });
  units["C-009"].online = false;
  units["C-041"].battery = 11;
  units["C-070"].battery = 16;

  const stats = lotStats(units);
  Object.keys(lots).forEach((lotId) => Object.assign(lots[lotId], stats[lotId]));
  return { lots, units };
}

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_CURVE = [30, 55, 82, 92, 94, 90, 86, 88, 80, 66, 50, 36, 26, 18];
const DAY_SCALE = [1, 1, 1, 1, 0.88, 0.55, 0.45];

function buildWeek() {
  const week = {};
  WEEK_DAYS.forEach((day, i) => {
    week[day] = DAY_CURVE.map((v) => {
      const noisy = v * DAY_SCALE[i] + (Math.random() * 10 - 5);
      return Math.max(4, Math.min(99, Math.round(noisy)));
    });
  });
  return week;
}

export async function resetDemoData() {
  await stopSimulation();
  const { lots, units } = buildDemoData();
  await writeSim({
    [simPath("lots")]: lots,
    [simPath("units")]: units,
    [simPath("history")]: { week: buildWeek() },
  });
  return `Loaded ${Object.keys(units).length} simulated curbs across ${Object.keys(lots).length} lots, plus a week of history.`;
}

function applyChanges(units, changes) {
  const next = {};
  Object.entries(units).forEach(([id, u]) => { next[id] = { ...u }; });
  Object.entries(changes).forEach(([id, fields]) => { next[id] = { ...(next[id] || {}), ...fields }; });
  return next;
}

function commit(currentUnits, changes) {
  if (Object.keys(changes).length === 0) return Promise.resolve();
  const next = applyChanges(currentUnits, changes);
  const updates = {};
  Object.entries(changes).forEach(([id, fields]) => {
    Object.entries(fields).forEach(([key, value]) => {
      updates[simPath(`units/${id}/${key}`)] = value;
    });
  });
  Object.entries(lotStats(next)).forEach(([lotId, s]) => {
    updates[simPath(`lots/${lotId}/openSpots`)] = s.openSpots;
    updates[simPath(`lots/${lotId}/totalSpots`)] = s.totalSpots;
  });
  return writeSim(updates);
}

// ---------- Running state, shared across tabs and computers ----------
// demo/simLock records which browser is running the simulation, so two
// people pressing Start don't double every write. The lock is released on
// Stop, removed automatically if the tab closes (onDisconnect), and treated
// as abandoned if its heartbeat is older than LOCK_STALE_MS.

let timer = null;
let tickCount = 0;
let latestUnits = {};
let stopUnits = null;
let lock = null;
let lockWatch = null;
const watchers = new Set();

function lockIsFresh(l) {
  return !!l && Date.now() - (l.heartbeat || 0) < LOCK_STALE_MS;
}

function state() {
  const elsewhere = lock && lock.owner !== SESSION && lockIsFresh(lock) ? (lock.email || "another browser") : null;
  return { running: timer !== null, elsewhere };
}

function notify() {
  const s = state();
  watchers.forEach((fn) => fn(s));
}

function ensureLockWatch() {
  if (lockWatch) return;
  lockWatch = onValue(ref(database, LOCK_PATH), (snap) => {
    lock = snap.val();
    // Someone else took over (our heartbeat lapsed): stop quietly here.
    if (timer && lock && lock.owner !== SESSION) stopLocal();
    notify();
  }, () => {});
}

export function watchSimulation(fn) {
  ensureLockWatch();
  watchers.add(fn);
  fn(state());
  return () => { watchers.delete(fn); };
}

async function recordSnapshot() {
  const online = Object.values(latestUnits).filter((u) => u.online);
  if (online.length === 0) return;
  const pct = Math.round((online.filter((u) => u.occupied).length / online.length) * 100);
  await push(ref(database, simPath("history/live")), { t: Date.now(), pct });
  if (tickCount % 75 === 0) await pruneLive();
}

// Keep history/live from growing forever (the driver app downloads all of demo/).
async function pruneLive() {
  const liveRef = ref(database, simPath("history/live"));
  const kept = await get(query(liveRef, orderByKey(), limitToLast(LIVE_KEEP)));
  const firstKept = Object.keys(kept.val() || {}).sort()[0];
  if (!firstKept) return;
  const old = await get(query(liveRef, orderByKey(), endBefore(firstKept)));
  const updates = {};
  Object.keys(old.val() || {}).forEach((k) => { updates[simPath(`history/live/${k}`)] = null; });
  if (Object.keys(updates).length) await writeSim(updates);
}

function tick() {
  const ids = Object.keys(latestUnits);
  if (ids.length === 0) return;
  const pick = () => ids[Math.floor(Math.random() * ids.length)];
  const changes = {};
  const change = (id, fields) => { changes[id] = { ...(changes[id] || {}), ...fields }; };
  const now = Date.now();

  const moves = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < moves; i++) {
    const id = pick();
    const u = latestUnits[id];
    if (!u || !u.online) continue;
    const target = DEMO_LOTS[u.lot]?.target ?? 0.7;
    const occupied = Math.random() < target;
    if (occupied !== u.occupied) change(id, { occupied, lastUpdated: now });
  }

  const b = pick();
  const bu = latestUnits[b];
  if (bu && bu.battery > 20) {
    change(b, { battery: Math.min(100, Math.max(21, bu.battery + (Math.random() < 0.5 ? -1 : 1))) });
  }

  writeSim({ [simPath("simLock/heartbeat")]: now }).catch(() => {});
  commit(latestUnits, changes).catch(() => {});

  tickCount += 1;
  if (tickCount % 3 === 0) recordSnapshot().catch(() => {});
}

function stopLocal() {
  if (timer) clearInterval(timer);
  timer = null;
  if (stopUnits) stopUnits();
  stopUnits = null;
  notify();
}

export async function startSimulation() {
  if (timer) return "Simulation is already running in this tab.";
  ensureLockWatch();
  const email = auth.currentUser?.email || "";
  const result = await runTransaction(ref(database, LOCK_PATH), (cur) => {
    if (cur && cur.owner !== SESSION && lockIsFresh(cur)) return undefined;
    return { owner: SESSION, email, heartbeat: Date.now() };
  });
  if (!result.committed) {
    const who = result.snapshot.val()?.email || "another browser";
    throw new Error(`The simulation is already running in ${who}'s browser. Stop it there first.`);
  }
  await onDisconnect(ref(database, LOCK_PATH)).remove();

  stopUnits = onValue(ref(database, simPath("units")), (snap) => {
    latestUnits = snap.val() || {};
  });
  timer = setInterval(tick, TICK_MS);
  notify();
  return "Simulation running. Cars arrive and leave every 2 seconds.";
}

export async function stopSimulation() {
  const wasRunning = timer !== null;
  stopLocal();
  if (wasRunning) {
    await onDisconnect(ref(database, LOCK_PATH)).cancel().catch(() => {});
    const snap = await get(ref(database, LOCK_PATH)).catch(() => null);
    if (snap?.val()?.owner === SESSION) await remove(ref(database, LOCK_PATH));
  }
  return "Simulation stopped.";
}

async function readUnits() {
  const snap = await get(ref(database, simPath("units")));
  return snap.val() || {};
}

export async function rushHour(lotId) {
  const all = await readUnits();
  const changes = {};
  const now = Date.now();
  Object.entries(all).forEach(([id, u]) => {
    if (u.lot === lotId && u.online && !u.occupied && Math.random() < 0.9) changes[id] = { occupied: true, lastUpdated: now };
  });
  await commit(all, changes);
  return `Rush hour: ${Object.keys(changes).length} cars just pulled into ${DEMO_LOTS[lotId].name}.`;
}

export async function knockCurbOffline() {
  const all = await readUnits();
  const online = Object.keys(all).filter((id) => all[id].online);
  if (online.length === 0) return "Every curb is already offline.";
  const id = online[Math.floor(Math.random() * online.length)];
  await commit(all, { [id]: { online: false } });
  return `Curb ${id} stopped reporting. Check the alerts on the Overview.`;
}

export async function restoreAllCurbs() {
  const all = await readUnits();
  const changes = {};
  Object.entries(all).forEach(([id, u]) => {
    if (!u.online) changes[id] = { online: true };
  });
  if (Object.keys(changes).length === 0) return "All curbs are already online.";
  await commit(all, changes);
  return `Brought ${Object.keys(changes).length} curb(s) back online.`;
}

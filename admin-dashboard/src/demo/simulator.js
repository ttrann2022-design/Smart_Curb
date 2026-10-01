import { ref, get, update, onValue, push } from "firebase/database";
import { database, dataPath, DATA_ROOT } from "../firebase";

export const DEMO_LOTS = {
  lot06: { name: "Lot 6", count: 20, target: 0.55, led: "green", text: "LOT 6" },
  lot07: { name: "Lot 7", count: 24, target: 0.75, led: "blue", text: "LOT 7" },
  lot12: { name: "Lot 12", count: 28, target: 0.85, led: "red", text: "LOT 12" },
  lot14: { name: "Lot 14", count: 22, target: 0.95, led: "gold", text: "LOT 14" },
};

function guard() {
  if (!DATA_ROOT) {
    throw new Error("Demo tools only run on the demo branch, where DATA_ROOT points at the demo section.");
  }
}

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
  guard();
  stopSimulation();
  const { lots, units } = buildDemoData();
  await update(ref(database), {
    [dataPath("lots")]: lots,
    [dataPath("units")]: units,
    [dataPath("history")]: { week: buildWeek() },
  });
  return `Loaded ${Object.keys(units).length} demo curbs across ${Object.keys(lots).length} lots, plus a week of history.`;
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
      updates[dataPath(`units/${id}/${key}`)] = value;
    });
  });
  Object.entries(lotStats(next)).forEach(([lotId, s]) => {
    updates[dataPath(`lots/${lotId}/openSpots`)] = s.openSpots;
    updates[dataPath(`lots/${lotId}/totalSpots`)] = s.totalSpots;
  });
  return update(ref(database), updates);
}

let timer = null;
let tickCount = 0;
let latestUnits = {};
let stopListening = null;
const watchers = new Set();

function notify() {
  watchers.forEach((fn) => fn(timer !== null));
}

export function watchSimulation(fn) {
  watchers.add(fn);
  fn(timer !== null);
  return () => { watchers.delete(fn); };
}

function recordSnapshot() {
  const online = Object.values(latestUnits).filter((u) => u.online);
  if (online.length === 0) return;
  const pct = Math.round((online.filter((u) => u.occupied).length / online.length) * 100);
  push(ref(database, dataPath("history/live")), { t: Date.now(), pct });
}

function tick() {
  const ids = Object.keys(latestUnits);
  if (ids.length === 0) return;
  const pick = () => ids[Math.floor(Math.random() * ids.length)];
  const changes = {};
  const change = (id, fields) => { changes[id] = { ...(changes[id] || {}), ...fields }; };

  const moves = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < moves; i++) {
    const id = pick();
    const u = latestUnits[id];
    if (!u || !u.online) continue;
    const target = DEMO_LOTS[u.lot]?.target ?? 0.7;
    change(id, { occupied: Math.random() < target });
  }

  const b = pick();
  const bu = latestUnits[b];
  if (bu && bu.battery > 20) {
    change(b, { battery: Math.min(100, Math.max(21, bu.battery + (Math.random() < 0.5 ? -1 : 1))) });
  }

  commit(latestUnits, changes);

  tickCount += 1;
  if (tickCount % 3 === 0) recordSnapshot();
}

export function startSimulation() {
  guard();
  if (timer) return;
  stopListening = onValue(ref(database, dataPath("units")), (snap) => {
    latestUnits = snap.val() || {};
  });
  timer = setInterval(tick, 2000);
  notify();
}

export function stopSimulation() {
  if (timer) clearInterval(timer);
  timer = null;
  if (stopListening) stopListening();
  stopListening = null;
  notify();
}

async function readUnits() {
  const snap = await get(ref(database, dataPath("units")));
  return snap.val() || {};
}

export async function rushHour(lotId) {
  guard();
  const all = await readUnits();
  const changes = {};
  Object.entries(all).forEach(([id, u]) => {
    if (u.lot === lotId && u.online && Math.random() < 0.9) changes[id] = { occupied: true };
  });
  await commit(all, changes);
  return `Rush hour: ${Object.keys(changes).length} cars just pulled into ${DEMO_LOTS[lotId].name}.`;
}

export async function knockCurbOffline() {
  guard();
  const all = await readUnits();
  const online = Object.keys(all).filter((id) => all[id].online);
  if (online.length === 0) return "Every curb is already offline.";
  const id = online[Math.floor(Math.random() * online.length)];
  await commit(all, { [id]: { online: false } });
  return `Curb ${id} stopped reporting. Check the alerts on the Overview.`;
}

export async function restoreAllCurbs() {
  guard();
  const all = await readUnits();
  const changes = {};
  Object.entries(all).forEach(([id, u]) => {
    if (!u.online) changes[id] = { online: true };
  });
  if (Object.keys(changes).length === 0) return "All curbs are already online.";
  await commit(all, changes);
  return `Brought ${Object.keys(changes).length} curb(s) back online.`;
}
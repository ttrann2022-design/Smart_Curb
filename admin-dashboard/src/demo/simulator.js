import { ref, get, update, onValue } from "firebase/database";
import { database, dataPath, DATA_ROOT } from "../firebase";

export const DEMO_LOTS = {
  garage2: { name: "Garage 2 — 4 levels", count: 32, target: 0.72, led: "white", text: "GARAGE 2" },
  lot12: { name: "Lot 12 — Red Permit", count: 20, target: 0.85, led: "red", text: "RED PERMIT" },
  lot14: { name: "Lot 14 — Blue Permit", count: 24, target: 0.95, led: "blue", text: "BLUE PERMIT" },
  lot20: { name: "Lot 20 — Visitor", count: 18, target: 0.55, led: "green", text: "VISITOR" },
};

function guard() {
  if (!DATA_ROOT) {
    throw new Error("Demo tools only run on the demo branch, where DATA_ROOT points at the demo section.");
  }
}

function buildDemoData() {
  const lots = {};
  const units = {};
  let n = 1;
  Object.entries(DEMO_LOTS).forEach(([lotId, lot]) => {
    lots[lotId] = { name: lot.name };
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
    }
  });
  units["C-009"].online = false;
  units["C-041"].battery = 11;
  units["C-070"].battery = 16;
  return { lots, units };
}

export async function resetDemoData() {
  guard();
  stopSimulation();
  const { lots, units } = buildDemoData();
  await update(ref(database), {
    [dataPath("lots")]: lots,
    [dataPath("units")]: units,
  });
  return `Loaded ${Object.keys(units).length} demo curbs across ${Object.keys(lots).length} lots.`;
}

let timer = null;
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

function tick() {
  const ids = Object.keys(latestUnits);
  if (ids.length === 0) return;
  const pick = () => ids[Math.floor(Math.random() * ids.length)];
  const changes = {};

  const moves = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < moves; i++) {
    const id = pick();
    const u = latestUnits[id];
    if (!u || !u.online) continue;
    const target = DEMO_LOTS[u.lot]?.target ?? 0.7;
    changes[`${id}/occupied`] = Math.random() < target;
  }

  const b = pick();
  const bu = latestUnits[b];
  if (bu && bu.battery > 20) {
    changes[`${b}/battery`] = Math.min(100, Math.max(21, bu.battery + (Math.random() < 0.5 ? -1 : 1)));
  }

  if (Object.keys(changes).length > 0) {
    update(ref(database, dataPath("units")), changes);
  }
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
    if (u.lot === lotId && u.online && Math.random() < 0.9) changes[`${id}/occupied`] = true;
  });
  await update(ref(database, dataPath("units")), changes);
  return `Rush hour: ${Object.keys(changes).length} cars just pulled into ${DEMO_LOTS[lotId].name}.`;
}

export async function knockCurbOffline() {
  guard();
  const all = await readUnits();
  const online = Object.keys(all).filter((id) => all[id].online);
  if (online.length === 0) return "Every curb is already offline.";
  const id = online[Math.floor(Math.random() * online.length)];
  await update(ref(database, dataPath(`units/${id}`)), { online: false });
  return `Curb ${id} stopped reporting. Check the alerts on the Overview.`;
}

export async function restoreAllCurbs() {
  guard();
  const all = await readUnits();
  const changes = {};
  Object.entries(all).forEach(([id, u]) => {
    if (!u.online) changes[`${id}/online`] = true;
  });
  if (Object.keys(changes).length === 0) return "All curbs are already online.";
  await update(ref(database, dataPath("units")), changes);
  return `Brought ${Object.keys(changes).length} curb(s) back online.`;
}
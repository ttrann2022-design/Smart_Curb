import { useSyncExternalStore } from "react";

// Where the dashboard reads curb data from:
//   "live": the real database (units/, lots/, history/). Ryan's Receiver writes C-095 here.
//   "sim":  the simulation area (demo/). The simulator only ever writes here.
// The demo build is locked to "sim". On the real site each browser picks its own
// mode in the sidebar or Settings, and it's remembered in localStorage.
export const DEMO_BUILD = import.meta.env.VITE_DEMO_MODE === "true" || !!import.meta.env.VITE_DATA_ROOT;
export const SIM_ROOT = "demo/";

const KEY = "sws-data-mode";
const subs = new Set();

function readStored() {
  if (DEMO_BUILD) return "sim";
  try {
    return localStorage.getItem(KEY) === "sim" ? "sim" : "live";
  } catch {
    return "live";
  }
}

let mode = readStored();
const emit = () => subs.forEach((fn) => fn());

export const getDataMode = () => mode;

export function setDataMode(next) {
  if (DEMO_BUILD || (next !== "live" && next !== "sim") || next === mode) return;
  mode = next;
  try { localStorage.setItem(KEY, next); } catch { /* private window: mode just isn't remembered */ }
  emit();
}

export function useDataMode() {
  return useSyncExternalStore((fn) => { subs.add(fn); return () => subs.delete(fn); }, getDataMode);
}

// Keep other tabs of this browser in step.
window.addEventListener("storage", (e) => {
  if (e.key !== KEY) return;
  const next = readStored();
  if (next !== mode) { mode = next; emit(); }
});

// Path for curb data in the current mode. Read it when subscribing; Layout
// remounts every page when the mode changes, so subscriptions follow along.
export const dataPath = (path) => (mode === "sim" ? SIM_ROOT : "") + path;

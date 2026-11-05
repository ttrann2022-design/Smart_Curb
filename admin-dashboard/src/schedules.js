// Timed states for the dashboard page: reads and writes schedules/<siteId>, and runs the
// shared runner for Apply now. Live only. In Simulation the schedule lives in this hook's
// state, for this tab, and nothing here reaches the database.
import { useEffect, useMemo, useState } from "react";
import { ref, get, onValue, push, remove, set, update, serverTimestamp } from "firebase/database";
import { auth, database } from "./firebase";
import { getDataMode } from "./dataMode";
import { runOnce } from "../scheduler/runOnce.js";
import { DEFAULT_TIMEZONE } from "../shared/schedule.js";

const stamp = () => ({ updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.uid });

function liveStore(siteId) {
  const base = `schedules/${siteId}`;
  return {
    saveRule: (id, rule) => set(ref(database, `${base}/rules/${id || push(ref(database, `${base}/rules`)).key}`), { ...rule, ...stamp() }),
    setRuleEnabled: (id, enabled) => update(ref(database, `${base}/rules/${id}`), { enabled, ...stamp() }),
    removeRule: (id) => remove(ref(database, `${base}/rules/${id}`)),
    saveSettings: (settings) => set(ref(database, `${base}/settings`), settings),
  };
}

// The same operations on an object in memory.
function draftStore(setDraft) {
  const patch = (fn) => { setDraft(fn); return Promise.resolve(); };
  return {
    saveRule: (id, rule) => {
      const key = id || `draft${Math.random().toString(36).slice(2)}`;
      return patch((d) => ({ ...d, rules: { ...d.rules, [key]: rule } }));
    },
    setRuleEnabled: (id, enabled) => patch((d) => ({ ...d, rules: { ...d.rules, [id]: { ...d.rules[id], enabled } } })),
    removeRule: (id) => patch((d) => {
      const rest = { ...d.rules };
      delete rest[id];
      return { ...d, rules: rest };
    }),
    saveSettings: (settings) => patch((d) => ({ ...d, settings })),
  };
}

// { loaded, error, settings, rules, applied, store }. siteId is null in Simulation.
export function useSchedule(siteId) {
  const [live, setLive] = useState({ loaded: false, error: null, value: {} });
  const [draft, setDraft] = useState({ settings: null, rules: {} });

  useEffect(() => {
    if (!siteId) return undefined;
    return onValue(
      ref(database, `schedules/${siteId}`),
      (s) => setLive({ loaded: true, error: null, value: s.val() || {} }),
      (error) => setLive({ loaded: true, error, value: {} }),
    );
  }, [siteId]);

  const store = useMemo(() => (siteId ? liveStore(siteId) : draftStore(setDraft)), [siteId]);
  if (!siteId) return { loaded: true, error: null, settings: draft.settings, rules: draft.rules, applied: {}, store };
  return { loaded: live.loaded, error: live.error, settings: live.value.settings || null, rules: live.value.rules || {}, applied: live.value.applied || {}, store };
}

// What a site with no saved settings starts from.
export const blankSettings = () => ({ enabled: false, timezone: DEFAULT_TIMEZONE });

// The browser's Apply now: the runner itself, for this one site, as the signed-in manager.
export function applyNow(siteId) {
  if (getDataMode() === "sim") return Promise.reject(new Error("Simulation never writes."));
  return runOnce({
    siteIds: [siteId],
    read: async (path) => (await get(ref(database, path))).val(),
    write: (updates) => update(ref(database), updates),
  });
}

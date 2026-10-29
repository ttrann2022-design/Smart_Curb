// Pure helpers for curb status, battery and time text. No React or Firebase, so the
// assistant (src/assistant/) and its Node tests can use them. units.js re-exports them.

// Shared alert thresholds, stored at settings/alerts (managers edit them in Settings).
// staleEnabled stays off until the Receiver sends a heartbeat: today lastUpdated
// only changes when occupancy changes, so a quiet curb isn't necessarily a dead one.
export const DEFAULT_ALERTS = { lowBattery: 20, staleEnabled: false, staleMinutes: 30 };

export const hasBattery = (u) => typeof u?.battery === "number";

export function batteryText(u) {
  return hasBattery(u) ? `${u.battery}%` : "Not measured";
}

export function isLowBattery(u, alerts) {
  return hasBattery(u) && u.battery < alerts.lowBattery;
}

export function isStale(u, alerts, now) {
  if (!alerts.staleEnabled || !u?.online || typeof u.lastUpdated !== "number") return false;
  return now - u.lastUpdated > alerts.staleMinutes * 60000;
}

// Everything wrong with a unit, most serious first.
export function unitIssues(u, alerts, now) {
  const issues = [];
  if (!u.online) issues.push("offline");
  else if (isStale(u, alerts, now)) issues.push("stale");
  if (isLowBattery(u, alerts)) issues.push("lowBattery");
  return issues;
}

export function statusKey(u) {
  if (!u.online) return "offline";
  return u.occupied ? "occupied" : "open";
}

export const STATUS_LABEL = { open: "Open", occupied: "Occupied", offline: "Offline" };

// Overview lot plans say "free" for an open spot.
export const STALL_WORD = { open: "Free", occupied: "Occupied", offline: "Offline" };

// Lots this small get large stalls with their ID printed underneath.
export const ROOMY_MAX = 6;
const MAX_PER_ROW = 16;

// Rows for a lot plan: two facing rows for most lots, more once a lot passes 2 × MAX_PER_ROW.
export function planLayout(n) {
  const rows = Math.max(n > ROOMY_MAX ? 2 : 1, Math.ceil(n / MAX_PER_ROW));
  return { rows, perRow: Math.ceil(n / rows) };
}

// Older records store values like "\"red\"" (quotes included); strip them for display.
export function cleanText(v) {
  return typeof v === "string" ? v.replace(/^"+|"+$/g, "").trim() : v;
}

export function formatAgo(ts, now) {
  if (typeof ts !== "number") return null;
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function formatExact(ts) {
  if (typeof ts !== "number") return "";
  return new Date(ts).toLocaleString([], { dateStyle: "medium", timeStyle: "medium" });
}

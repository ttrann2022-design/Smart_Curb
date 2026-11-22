// Pure logic for the occupancy history recorder (scheduler/recordHistory.js). No
// database or clock access, so Node's test runner can check every rule
// (npm run test:history).
//
// What Analytics and the Assistant read (src/pages/Analytics.jsx, src/assistant/history.js):
//   history/live/<pushId> = { t: <epoch ms>, pct: <whole number 0..100> }   last 60 shown
//   history/week = { Mon: [14 whole numbers], ..., Sun: [14] }   7 AM..8 PM local, all or nothing
//
// The recorder's own working data, which no client can read or write (default-deny rules):
//   historySamples/days/<YYYY-MM-DD>/<slot> = { sum, n }   one per local date and hour slot
import { lotCounts } from "../src/unitStatus.js";
import { DEFAULT_TIMEZONE, isTimezone } from "../shared/schedule.js";

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const FIRST_HOUR = 7; // slot 0 is 7:00-7:59 AM local
export const SLOTS = 14; // ... slot 13 is 8:00-8:59 PM local
export const LIVE_KEEP = 200;
export const DEFAULT_INTERVAL_MS = 30000;

// Percent full across every curb, by the dashboard's own rule (lotCounts in
// src/unitStatus.js, imported, not copied): a curb counts only when `online` is true;
// of those, occupied / (occupied + free) as a whole percent. Null with no online curbs,
// which means "skip this tick". Stale curbs are not excluded: the dashboard doesn't
// exclude them either (staleness only raises an alert).
export function percentFull(units) {
  return lotCounts(Object.values(units && typeof units === "object" ? units : {})).pctFull;
}

// ---------- Local time ----------

const formatters = new Map();
function formatter(tz) {
  if (!formatters.has(tz)) {
    formatters.set(tz, new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
    }));
  }
  return formatters.get(tz);
}

// Where an instant falls on the site's clock: its local calendar date, weekday and hour,
// and the history slot (0..13 for 7 AM..8 PM, or -1 outside those hours).
export function localSlot(instant, tz) {
  const p = Object.fromEntries(formatter(tz).formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
  const hour = Number(p.hour) % 24;
  const slot = hour - FIRST_HOUR;
  return { date: `${p.year}-${p.month}-${p.day}`, dow: p.weekday, hour, slot: slot >= 0 && slot < SLOTS ? slot : -1 };
}

// Calendar arithmetic on YYYY-MM-DD dates. Done in UTC, so daylight saving can't shift a day.
export function addDays(date, k) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + k)).toISOString().slice(0, 10);
}
export function dowOf(date) {
  const [y, m, d] = date.split("-").map(Number);
  return DAYS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7];
}

// ---------- Rolling week ----------

// One hour slot's running total after one more reading.
export const addToCell = (cell, pct) => ({ sum: (cell?.sum || 0) + pct, n: (cell?.n || 0) + 1 });

// Add one tick's percent to its local date and hour slot (returns a new object).
export function addSample(days, date, slot, pct) {
  return { ...(days || {}), [date]: { ...(days?.[date] || {}), [slot]: addToCell(days?.[date]?.[slot], pct) } };
}

// The rolling week: for every weekday and hour slot, the most recent occurrence of that
// slot that isn't in the future (so the window is the last 7 x 24 hours, and the hour
// now in progress counts with whatever it has so far). Each value is that occurrence's
// average, rounded to a whole percent.
//
// Returns { week, filled, missing }. week is null unless all 98 slots have real data:
// a gap is never filled with 0 or anything else.
export function rollingWeek(days, now, tz) {
  const here = localSlot(now, tz);
  // The last of today's slots that has started: -1 before 7 AM, 13 after 8 PM.
  const lastStarted = here.slot !== -1 ? here.slot : here.hour < FIRST_HOUR ? -1 : SLOTS - 1;
  const week = Object.fromEntries(DAYS.map((d) => [d, new Array(SLOTS).fill(null)]));
  let filled = 0;
  const missing = [];
  for (let back = 0; back < 7; back++) {
    const date = addDays(here.date, -back);
    const dow = dowOf(date);
    for (let slot = 0; slot < SLOTS; slot++) {
      // Today's slots after the current hour haven't happened yet: use the same slot a week ago.
      const use = back === 0 && slot > lastStarted ? addDays(date, -7) : date;
      const cell = days?.[use]?.[slot];
      if (cell && cell.n > 0 && Number.isFinite(cell.sum)) {
        week[dow][slot] = Math.round(cell.sum / cell.n);
        filled += 1;
      } else {
        missing.push(`${dow} ${slot + FIRST_HOUR}:00`);
      }
    }
  }
  return { week: filled === DAYS.length * SLOTS ? week : null, filled, missing };
}

// Sample dates the recorder no longer needs (anything before 8 days ago).
export function staleDates(dates, today) {
  const keepFrom = addDays(today, -8);
  return dates.filter((d) => d < keepFrom);
}

// ---------- history/live trim ----------

// Push IDs sort in creation order, so the newest LIVE_KEEP keys are the last ones.
export function keysToTrim(keys, keep = LIVE_KEEP) {
  const sorted = [...keys].sort();
  return sorted.length > keep ? sorted.slice(0, sorted.length - keep) : [];
}

// ---------- Time zone ----------

// Which time zone the week uses:
//   1. HISTORY_TIMEZONE, when set (a config constant you can override)
//   2. schedules/<siteId>/settings/timezone for HISTORY_SITE_ID, when set
//   3. the one time zone every site's schedule settings agree on, if there is exactly one
//   4. America/New_York
export function pickTimezone({ envTimezone, siteId, schedules } = {}) {
  if (envTimezone) {
    if (!isTimezone(envTimezone)) throw new Error(`HISTORY_TIMEZONE "${envTimezone}" isn't a time zone.`);
    return { tz: envTimezone, source: "HISTORY_TIMEZONE" };
  }
  const tzOf = (id) => schedules?.[id]?.settings?.timezone;
  if (siteId) {
    if (isTimezone(tzOf(siteId))) return { tz: tzOf(siteId), source: `schedules/${siteId}/settings` };
    return { tz: DEFAULT_TIMEZONE, source: `default (schedules/${siteId} has no time zone)` };
  }
  const zones = [...new Set(Object.keys(schedules || {}).map(tzOf).filter(isTimezone))];
  if (zones.length === 1) return { tz: zones[0], source: "schedules settings" };
  if (zones.length > 1) return { tz: DEFAULT_TIMEZONE, source: `default (sites disagree: ${zones.join(", ")}; set HISTORY_SITE_ID or HISTORY_TIMEZONE)` };
  return { tz: DEFAULT_TIMEZONE, source: "default" };
}

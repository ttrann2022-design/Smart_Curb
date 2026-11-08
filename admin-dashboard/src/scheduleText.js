// Small words and times for the Schedules page.
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEKDAYS = [1, 2, 3, 4, 5];
export const WEEKENDS = [0, 6];
export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

// Firebase hands back arrays, or objects when an array has gaps.
export const listOf = (x) => (Array.isArray(x) ? x : x && typeof x === "object" ? Object.values(x) : []).filter((v) => v !== null && v !== undefined);

// 1350 -> "10:30 PM"
export function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  return `${h % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const same = (a, b) => a.length === b.length && b.every((d) => a.includes(d));

// [1,2,3,4,5] -> "Weekdays"
export function daysText(days) {
  const list = listOf(days);
  if (same(list, EVERY_DAY)) return "Every day";
  if (same(list, WEEKDAYS)) return "Weekdays";
  if (same(list, WEEKENDS)) return "Weekends";
  return [...list].sort((a, b) => a - b).map((d) => DAY_NAMES[d]?.slice(0, 3)).join(", ");
}

// An instant on the site's clock; the weekday too when it isn't within the next day.
export function formatInstant(ms, timezone, now) {
  const opts = { timeZone: timezone, hour: "numeric", minute: "2-digit" };
  if (ms - now >= 20 * 3600000) opts.weekday = "short";
  return new Intl.DateTimeFormat("en-US", opts).format(new Date(ms));
}

// Every timezone the browser knows, with the current one always in the list.
export function timezoneOptions(current) {
  const known = () => {
    try { return Intl.supportedValuesOf("timeZone"); } catch { return ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "UTC"]; }
  };
  const zones = known();
  return current && !zones.includes(current) ? [current, ...zones] : zones;
}

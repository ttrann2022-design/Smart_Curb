// Recorded history, from the same nodes Analytics reads:
//   history/week  { Mon: [14 hourly percents, 7 AM..8 PM], ... Sun: [...] }
//   history/live  { <id>: { t, pct } }   recent readings while something records them
// Pure JS.

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_NAMES = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
export const HOURS_LONG = ["7 AM", "8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM", "6 PM", "7 PM", "8 PM"];
const FIRST_HOUR = 7;

const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

// The week, or null if it isn't complete (Analytics shows nothing in that case too).
export function weekOf(ctx) {
  const week = ctx.history?.week;
  return week && DAYS.every((d) => Array.isArray(week[d]) && week[d].length === HOURS_LONG.length) ? week : null;
}

export const dayKey = (now, back = 0) => DAYS[(new Date(now).getDay() + 6 - back + 7 * 2) % 7];

// Hour slot for a time, or -1 outside 7 AM..8 PM.
export function hourSlot(now) {
  const h = new Date(now).getHours() - FIRST_HOUR;
  return h >= 0 && h < HOURS_LONG.length ? h : -1;
}

export function weekStats(week) {
  const hourAvg = HOURS_LONG.map((_, h) => avg(DAYS.map((d) => week[d][h])));
  const dayAvg = DAYS.map((d) => avg(week[d]));
  const top = (xs, dir = 1) => xs.reduce((best, v, i) => ((v - xs[best]) * dir > 0 ? i : best), 0);
  return {
    hourAvg,
    dayAvg,
    peakHour: top(hourAvg),
    quietHour: top(hourAvg, -1),
    busyDay: top(dayAvg),
    quietDay: top(dayAvg, -1),
    overall: avg(DAYS.flatMap((d) => week[d])),
    weekday: avg(DAYS.slice(0, 5).flatMap((d) => week[d])),
    weekend: avg(["Sat", "Sun"].flatMap((d) => week[d])),
  };
}

export const dayAverage = (week, key) => avg(week[key]);

// Recent readings, oldest first.
export function liveSeries(ctx) {
  return Object.values(ctx.history?.live || {})
    .filter((p) => p && typeof p.t === "number" && typeof p.pct === "number")
    .sort((a, b) => a.t - b.t);
}

export const historySource = (ctx) => (ctx.mode === "sim" ? "From recorded history of the simulation, not the real site." : "From recorded history of the live site.");

export const pct = (v) => `${Math.round(v)}%`;

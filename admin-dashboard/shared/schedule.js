// Timed states: which LED look a curb should show at a given moment. Pure: no
// Firebase, no DOM. The dashboard page, the runner (scheduler/runOnce.js) and the tests
// all use it, so they always agree. scripts/vendor-functions.mjs copies this file into
// the Cloud Function, which is why it imports nothing.
//
//   effectiveLook(unit, lotId, rules, settings, nowInstant)
//     -> { ruleId | "default", look, key, nextChangeAt }, or null for a disabled site
//
// Times are wall-clock times in the site's timezone, worked out with Intl, so they
// follow daylight saving. A window starts inclusive and ends exclusive, and one that
// crosses midnight (22:00-06:00) belongs to the day it starts on.

// The same limits as units/<id> in database.rules.json and the manual LED control.
export const LED_COLORS = ["red", "blue", "green", "gold", "white"];
export const LOOK_LIMITS = { panelText: 16, minBrightness: 0, maxBrightness: 100 };
export const RULE_LIMITS = { name: 60, minPriority: 0, maxPriority: 9 };
export const DEFAULT_TIMEZONE = "America/New_York";
export const DEFAULT_RULE_ID = "default";
export const TARGET_TYPES = ["site", "lots", "units"];

const SPECIFICITY = { site: 0, lots: 1, units: 2 };
const MINUTE = 60000;
// The week repeats, so a look that hasn't changed in 8 days never will.
const HORIZON = 8 * 24 * 60 * MINUTE;

// Firebase hands back arrays, or objects when an array has gaps.
const list = (x) => (Array.isArray(x) ? x : x && typeof x === "object" ? Object.values(x) : []).filter((v) => v !== null && v !== undefined);

// "22:30" -> 1350. Anything else -> null.
export function parseTime(text) {
  const m = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(typeof text === "string" ? text : "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function isTimezone(tz) {
  if (typeof tz !== "string" || !tz) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

// ---------- Validation (the rules' checks, in the page's words) ----------

export function lookErrors(look) {
  const errors = {};
  if (!LED_COLORS.includes(look?.ledColor)) errors.ledColor = "Choose a colour.";
  if (typeof look?.panelText !== "string" || look.panelText.length > LOOK_LIMITS.panelText) errors.panelText = `Keep the panel text to ${LOOK_LIMITS.panelText} characters.`;
  const b = look?.ledBrightness;
  if (!Number.isInteger(b) || b < LOOK_LIMITS.minBrightness || b > LOOK_LIMITS.maxBrightness) errors.ledBrightness = `Brightness is a whole percent from ${LOOK_LIMITS.minBrightness} to ${LOOK_LIMITS.maxBrightness}.`;
  return errors;
}

export function ruleErrors(rule) {
  const errors = {};
  const name = typeof rule?.name === "string" ? rule.name.trim() : "";
  if (!name) errors.name = "Give this timed state a name.";
  else if (name.length > RULE_LIMITS.name) errors.name = `Keep the name to ${RULE_LIMITS.name} characters.`;
  const days = list(rule?.days);
  if (!days.length) errors.days = "Pick at least one day.";
  else if (!days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) errors.days = "Days run from Sunday to Saturday.";
  const start = parseTime(rule?.start);
  const end = parseTime(rule?.end);
  if (start === null) errors.start = "Enter a start time.";
  if (end === null) errors.end = "Enter an end time.";
  if (start !== null && start === end) errors.end = "The end time must differ from the start time.";
  const type = rule?.target?.type;
  if (!TARGET_TYPES.includes(type)) errors.target = "Choose where this applies.";
  else if (type !== "site" && !list(rule.target.ids).length) errors.target = type === "lots" ? "Pick at least one lot." : "Pick at least one curb.";
  const p = rule?.priority;
  if (!Number.isInteger(p) || p < RULE_LIMITS.minPriority || p > RULE_LIMITS.maxPriority) errors.priority = `Priority runs from ${RULE_LIMITS.minPriority} to ${RULE_LIMITS.maxPriority}.`;
  const look = lookErrors(rule?.look);
  if (Object.keys(look).length) errors.look = look;
  return errors;
}

export function settingsErrors(settings) {
  const errors = {};
  if (!isTimezone(settings?.timezone)) errors.timezone = "Choose a timezone.";
  if (settings?.default) {
    const look = lookErrors(settings.default);
    if (Object.keys(look).length) errors.default = look;
  } else if (settings?.enabled) errors.default = "Set the look to show outside timed states first.";
  return errors;
}

// ---------- Wall clock ----------

const formatters = new Map();
function formatter(tz) {
  if (!formatters.has(tz)) {
    formatters.set(tz, new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", weekday: "short", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
    }));
  }
  return formatters.get(tz);
}
const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// An instant as the site's clock reads it. `offset` (minutes) tells DST periods apart.
export function wallClock(instant, tz) {
  const p = Object.fromEntries(formatter(tz).formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
  const hour = Number(p.hour) % 24;
  const minute = Number(p.minute);
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hour, minute);
  return { day: WEEKDAY[p.weekday], minutes: hour * 60 + minute, offset: Math.round((asUtc - Math.floor(instant / MINUTE) * MINUTE) / MINUTE) };
}

// ---------- Which rule applies ----------

function usable(rule) {
  return !!rule && rule.enabled === true && !Object.keys(ruleErrors(rule)).length;
}

function targets(rule, unitId, lotId) {
  const { type, ids } = rule.target;
  if (type === "site") return true;
  return list(ids).includes(type === "lots" ? lotId : unitId);
}

// When the window containing this wall time started, in minutes from today's midnight
// (negative: it started yesterday); null if the window isn't active.
function windowStart(rule, day, minutes) {
  const days = list(rule.days);
  const start = parseTime(rule.start);
  const end = parseTime(rule.end);
  if (start < end) return days.includes(day) && minutes >= start && minutes < end ? start : null;
  if (days.includes(day) && minutes >= start) return start;
  return days.includes((day + 6) % 7) && minutes < end ? start - 1440 : null;
}

const unitIdOf = (unit) => (unit && typeof unit === "object" ? unit.id : unit);
const rulesFor = (unitId, lotId, rules) => Object.entries(rules && typeof rules === "object" ? rules : {})
  .filter(([, r]) => usable(r) && targets(r, unitId, lotId));

function pick(candidates, day, minutes) {
  let best = null;
  for (const [id, rule] of candidates) {
    const startedAt = windowStart(rule, day, minutes);
    if (startedAt === null) continue;
    const row = { id, rule, startedAt, specificity: SPECIFICITY[rule.target.type] };
    if (!best
      || rule.priority > best.rule.priority
      || (rule.priority === best.rule.priority && (row.specificity > best.specificity
        || (row.specificity === best.specificity && (startedAt > best.startedAt
          || (startedAt === best.startedAt && id < best.id)))))) best = row;
  }
  return best;
}

// What a look is, as text: the runner writes only when this changes, so a rule ending
// and another with the same look starting leaves a manual edit alone.
export const lookKey = (look) => (look ? `${look.ledColor}|${look.panelText}|${look.ledBrightness}` : null);

const lookOf = (look) => ({ ledColor: look.ledColor, panelText: look.panelText, ledBrightness: look.ledBrightness });

function resultAt(candidates, settings, day, minutes) {
  const best = pick(candidates, day, minutes);
  if (best) return { ruleId: best.id, look: lookOf(best.rule.look), key: lookKey(best.rule.look) };
  const fallback = settings?.default && !Object.keys(lookErrors(settings.default)).length ? lookOf(settings.default) : null;
  return { ruleId: DEFAULT_RULE_ID, look: fallback, key: lookKey(fallback) };
}

// A wall time on any weekday, ignoring whether the site is switched on (the page's
// "Preview at..." uses this; it never writes).
export function lookAtWall(unit, lotId, rules, settings, day, minutes) {
  return resultAt(rulesFor(unitIdOf(unit), lotId, rules), settings, day, minutes);
}

// The first instant after `now` where the rule or the look differs, or null. Walks the
// rule edges through the wall clock; when an edge lands in a different UTC offset it
// goes to the DST change itself, since the clock jumped there.
function nextChange(candidates, settings, tz, now, current) {
  const edges = [...new Set(candidates.flatMap(([, r]) => [parseTime(r.start), parseTime(r.end)]))].sort((a, b) => a - b);
  if (!edges.length) return null;
  const limit = now + HORIZON;
  let cur = Math.floor(now / MINUTE) * MINUTE;
  while (cur < limit) {
    const wall = wallClock(cur, tz);
    const edge = edges.find((m) => m > wall.minutes) ?? edges[0] + 1440;
    let at = cur + (edge - wall.minutes) * MINUTE;
    if (wallClock(at, tz).offset !== wall.offset) {
      // Binary search for the first minute of the new offset.
      let low = cur;
      let high = at;
      while (high - low > MINUTE) {
        const mid = low + Math.floor((high - low) / (2 * MINUTE)) * MINUTE;
        if (wallClock(mid, tz).offset === wall.offset) low = mid; else high = mid;
      }
      at = high;
    }
    const w = wallClock(at, tz);
    const r = resultAt(candidates, settings, w.day, w.minutes);
    if (r.ruleId !== current.ruleId || r.key !== current.key) return at;
    cur = at;
  }
  return null;
}

// unit: the curb's ID (or { id }), null for a lot with no curbs. lotId: its lot. rules:
// { ruleId: rule }. nowInstant: ms or Date. A disabled site gets null: it's not touched.
// withNext: false skips nextChangeAt, for the runner, which doesn't need it.
export function effectiveLook(unit, lotId, rules, settings, nowInstant, { withNext = true } = {}) {
  if (!settings || settings.enabled !== true) return null;
  const now = Number(nowInstant);
  const tz = settings.timezone || DEFAULT_TIMEZONE;
  const candidates = rulesFor(unitIdOf(unit), lotId, rules);
  const wall = wallClock(now, tz);
  const result = resultAt(candidates, settings, wall.day, wall.minutes);
  return { ...result, nextChangeAt: withNext ? nextChange(candidates, settings, tz, now, result) : null };
}

// One lot: the look most of its curbs show, how many curbs differ (a rule can target
// single curbs), and when that look next changes. A lot with no curbs still has a look.
export function lotSummary(lotId, unitIds, rules, settings, evaluate) {
  const results = (unitIds.length ? unitIds : [null]).map((id) => ({ id, result: evaluate(id, lotId, rules, settings) }));
  const counts = new Map();
  for (const { result } of results) {
    const k = `${result?.ruleId}|${result?.key}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const [topKey, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const top = results.find(({ result }) => `${result?.ruleId}|${result?.key}` === topKey).result;
  return { ...top, differing: unitIds.length ? results.length - topCount : 0, units: results };
}

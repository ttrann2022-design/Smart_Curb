// Pure helpers for the Analytics latency card. No imports, so Node's test runner
// can load this file directly (npm run test:latency).

// A stage shows a number only with at least this many samples; below it the card
// says "not enough data" instead of a median that one slow packet could swing.
export const MIN_SAMPLES = 5;

// The recent window the card reads and keeps: the last hour, at most 200 samples.
export const WINDOW_MS = 60 * 60 * 1000;
export const WINDOW_MAX = 200;

// A latency value we can use: a finite, non-negative number of milliseconds.
export const isMs = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;

// Median (mean of the two middle values for an even count) and nearest-rank p95.
// Values that aren't usable milliseconds (missing, null, NaN, negative, strings)
// are dropped first and don't count as samples. Below `min` samples, median and
// p95 are null and `enough` is false, so the card can say "not enough data".
export function summarize(values, min = MIN_SAMPLES) {
  const s = (Array.isArray(values) ? values : []).filter(isMs).sort((a, b) => a - b);
  const count = s.length;
  if (count < min || count === 0) return { count, enough: false, median: null, p95: null };
  const mid = count >> 1;
  return {
    count,
    enough: true,
    median: count % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2,
    p95: s[Math.min(count - 1, Math.ceil(0.95 * count) - 1)],
  };
}

// Keep samples from the last `maxAge` ms (by their `at` time), newest `max` of them,
// oldest first. Samples without a usable `at` are dropped: we can't tell if they're recent.
export function recentWindow(samples, now, { maxAge = WINDOW_MS, max = WINDOW_MAX } = {}) {
  return (Array.isArray(samples) ? samples : [])
    .filter((x) => x && isMs(x.at) && x.at >= now - maxAge && x.at <= now + 60000)
    .sort((a, b) => a.at - b.at)
    .slice(-max);
}

// Merge two sample lists, keeping one sample per unit and write time (`unit|at`).
// The Receiver's latency history and the per-curb field can describe the same write.
export function mergeSamples(a, b) {
  const byKey = new Map();
  for (const x of [...(a || []), ...(b || [])]) {
    if (!x || !isMs(x.at)) continue;
    const key = `${x.unit}|${x.at}`;
    if (!byKey.has(key)) byKey.set(key, x);
  }
  return [...byKey.values()];
}

// Flatten latency/<unitId>/<sampleId> into { unit, at, v } for one field
// ("rxToWriteMs" or "eventAgeMs"). Samples missing the field or a time are skipped.
export function flattenLatency(tree, field) {
  const out = [];
  Object.entries(tree && typeof tree === "object" ? tree : {}).forEach(([unit, byId]) => {
    if (!byId || typeof byId !== "object") return;
    Object.values(byId).forEach((s) => {
      if (s && typeof s === "object" && isMs(s[field]) && isMs(s.lastUpdated)) out.push({ unit, at: s.lastUpdated, v: s[field] });
    });
  });
  return out;
}

// Firebase-to-dashboard delay for one write: server-corrected "now" when the listener
// fired, minus the write's timestamp. `offset` is .info/serverTimeOffset. A small
// negative result (clock jitter) counts as 0; a clearly negative one is unusable.
export function deliveryDelay(writtenAt, firedAt, offset) {
  if (!isMs(writtenAt) || typeof firedAt !== "number" || !Number.isFinite(firedAt)) return null;
  const d = firedAt + (Number.isFinite(offset) ? offset : 0) - writtenAt;
  if (d < -1000) return null;
  return Math.max(0, d);
}

// Total of the stage medians. It is a sum of separate medians, not a measured
// end-to-end time, and it only exists when every stage has a median.
export function sumOfMedians(stages) {
  const missing = stages.filter((s) => !s || !isMs(s.median)).map((s) => s?.label ?? "?");
  if (missing.length) return { value: null, missing };
  return { value: stages.reduce((sum, s) => sum + s.median, 0), missing: [] };
}

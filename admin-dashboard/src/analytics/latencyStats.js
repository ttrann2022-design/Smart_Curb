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

// Firebase-to-dashboard delay for one write, RAW: server-corrected "now" when the
// listener fired (firedAt + .info/serverTimeOffset) minus the write's timestamp.
// It is not clamped or rounded, so it can be negative: see deliveryVerdict.
export function deliveryDelay(writtenAt, firedAt, offset) {
  if (!isMs(writtenAt) || typeof firedAt !== "number" || !Number.isFinite(firedAt)) return null;
  return firedAt + (Number.isFinite(offset) ? offset : 0) - writtenAt;
}

// Whether raw Firebase-to-dashboard delays can be shown at all. A real delay is never
// negative. lastUpdated is Firebase's server timestamp (the Receiver writes it with
// Firebase.setTimestamp), so a negative raw value means the delay is below the accuracy
// of this browser's clock estimate: .info/serverTimeOffset ignores network travel time.
// Then no number is honest: the stage says "Not measurable here" instead of clamping
// to 0. Returns
//   { measurable: true }  or
//   { measurable: false, negative, count, min, max }   (min/max of the raw values, ms)
export function deliveryVerdict(raws) {
  const vals = (Array.isArray(raws) ? raws : []).filter((v) => typeof v === "number" && Number.isFinite(v));
  const negative = vals.filter((v) => v < 0).length;
  if (!negative) return { measurable: true };
  return { measurable: false, negative, count: vals.length, min: Math.min(...vals), max: Math.max(...vals) };
}

// The newest usable `at` among the samples, or null.
export function newestAt(samples) {
  let newest = null;
  for (const x of Array.isArray(samples) ? samples : []) if (x && isMs(x.at) && (newest === null || x.at > newest)) newest = x.at;
  return newest;
}

// A simulation counts as stopped once its newest sample is older than this.
export const SIM_STALE_MS = 2 * 60 * 1000;

// A simulated Firebase-to-dashboard delay for a sample without one: 60 to 200 ms, and
// always the same for the same curb and time, so the card doesn't flicker.
export function simulatedDeliveryMs(unit, at) {
  let h = 2166136261;
  for (const ch of `${unit}|${at}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return 60 + ((h >>> 0) % 141);
}

// Whether the Firebase-to-dashboard stage is shown as "Not measurable here": Live only.
// Live values are raw browser measurements (see deliveryVerdict). Simulated values are the
// simulator's own, never timed against this browser's clock, so the verdict doesn't apply.
// Returns null when the stage shows its numbers, else deliveryVerdict's result.
export function deliveryStageVerdict({ sim, points }) {
  if (sim) return null;
  const verdict = deliveryVerdict((points || []).map((p) => p.v));
  return verdict.measurable ? null : verdict;
}

// The points behind each measured stage, by curb, for the card.
//   history   latency/<unitId> trees in scope (Live) or demo/latency (Simulation)
//   observed  rxToWriteMs seen on unit records while the page is open (Live)
//   delivery  Firebase-to-dashboard delays measured in this browser (Live)
//   now       server-corrected time
// Live: the last hour up to now; Firebase to dashboard is measured in this browser.
// Simulation: every stage comes from the simulator's samples, Firebase to dashboard
// included (deliveryMs: timing simulated writes here would compare this browser's clock
// with itself). The hour ends at the newest simulated sample, not now, so a simulation
// that stopped (leaving Simulation stops it) still shows its last numbers. `stoppedAt`
// is that newest time when it's more than SIM_STALE_MS old, so the card can say so.
export function stagePoints({ sim, history, observed = [], delivery = [], now }) {
  if (!sim) {
    const win = (list) => recentWindow(list, now);
    return {
      age: [],
      rx: win(mergeSamples(flattenLatency(history, "rxToWriteMs"), observed)),
      fb: win(delivery),
      stoppedAt: null,
    };
  }
  const age = flattenLatency(history, "eventAgeMs");
  const rx = flattenLatency(history, "rxToWriteMs");
  // Every simulated sample gets a Firebase-to-dashboard value: its own deliveryMs, or a
  // stand-in for samples the simulator wrote before it added that field.
  const given = new Map(flattenLatency(history, "deliveryMs").map((p) => [`${p.unit}|${p.at}`, p]));
  const fb = flattenLatency(history, "lastUpdated")
    .map((p) => given.get(`${p.unit}|${p.at}`) || { unit: p.unit, at: p.at, v: simulatedDeliveryMs(p.unit, p.at) });
  const newest = newestAt([...age, ...rx, ...fb]);
  const end = newest === null ? now : Math.min(newest, now);
  const win = (list) => recentWindow(list, end);
  return {
    age: win(age),
    rx: win(rx),
    fb: win(fb),
    stoppedAt: newest !== null && now - newest > SIM_STALE_MS ? newest : null,
  };
}

// ---------- Receiver to Firebase: which rxToWriteMs belongs to an event ----------
//
// The Receiver writes rxToWriteMs twice per packet:
//   1. in the updateNode batch, together with lastUpdated: the time elapsed BEFORE that
//      write completed (a few ms, not the latency)
//   2. a moment later, on its own (Firebase.setInt): the real receive-to-write time
// So the value that arrives with a new lastUpdated is never used. The pairer waits up to
// RX_FINAL_WAIT_MS for the next change to rxToWriteMs on that curb and samples that one;
// if none arrives, or another event starts first, the event is skipped rather than
// sampled with the provisional value.
export const RX_FINAL_WAIT_MS = 3000;

// createRxPairer({ onSample, waitMs, setTimer, clearTimer, defer })
//   lastUpdated(unit, at)  call when a curb's lastUpdated changes (not for the baseline)
//   rx(unit, value)        call whenever a curb's rxToWriteMs listener fires
//   dispose()              cancel every pending wait
// onSample({ unit, at, v }) gets each event's final value. Timers are injectable for tests.
// `defer` runs once the current batch of listener events has been delivered: Firebase
// delivers one write's changes together, so an rxToWriteMs change seen before then came
// in the same write as lastUpdated (write 1) and is not the final value.
export function createRxPairer({
  onSample,
  waitMs = RX_FINAL_WAIT_MS,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (t) => clearTimeout(t),
  defer = (fn) => setTimeout(fn, 0),
} = {}) {
  const pending = new Map(); // unit -> { at, armed, timer }
  const stats = { sampled: 0, skippedNoFinal: 0, skippedReplaced: 0 };

  const drop = (unit) => {
    const p = pending.get(unit);
    if (p?.timer !== undefined) clearTimer(p.timer);
    pending.delete(unit);
  };

  return {
    stats,
    lastUpdated(unit, at) {
      if (pending.has(unit)) { drop(unit); stats.skippedReplaced += 1; } // the last event never got its final value
      const p = { at, armed: false, timer: undefined };
      pending.set(unit, p);
      defer(() => {
        if (pending.get(unit) !== p) return;
        p.armed = true;
        p.timer = setTimer(() => {
          if (pending.get(unit) !== p) return;
          pending.delete(unit);
          stats.skippedNoFinal += 1;
        }, waitMs);
      });
    },
    rx(unit, value) {
      const p = pending.get(unit);
      if (!p || !p.armed) return; // no event waiting, or this value came with lastUpdated (write 1)
      if (!isMs(value)) return; // a cleared or bad value isn't the final one: keep waiting
      drop(unit);
      stats.sampled += 1;
      onSample?.({ unit, at: p.at, v: value });
    },
    dispose() {
      for (const unit of [...pending.keys()]) drop(unit);
    },
  };
}

// Total of the stage medians. It is a sum of separate medians, not a measured
// end-to-end time, and it only exists when every stage has a median.
export function sumOfMedians(stages) {
  const missing = stages.filter((s) => !s || !isMs(s.median)).map((s) => s?.label ?? "?");
  if (missing.length) return { value: null, missing };
  return { value: stages.reduce((sum, s) => sum + s.median, 0), missing: [] };
}

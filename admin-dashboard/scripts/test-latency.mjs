// Unit tests for the latency card's stats helpers (src/analytics/latencyStats.js).
//   npm run test:latency
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MIN_SAMPLES, WINDOW_MS, WINDOW_MAX, isMs, summarize, recentWindow, mergeSamples,
  flattenLatency, deliveryDelay, deliveryVerdict, sumOfMedians, stagePoints, newestAt, simulatedDeliveryMs, deliveryStageVerdict,
} from "../src/analytics/latencyStats.js";
import { latencySample } from "../src/demo/latencySample.js";
import { CURB_TO_RECEIVER_BENCHMARK } from "../src/analytics/latencyBenchmarks.js";

// ---------- median and p95 ----------
test("median of an odd count is the middle value, regardless of input order", () => {
  assert.equal(summarize([50, 10, 40, 20, 30]).median, 30);
});

test("median of an even count is the mean of the two middle values", () => {
  assert.equal(summarize([10, 20, 30, 40, 50, 60]).median, 35);
});

test("p95 is nearest-rank: the value at ceil(0.95 n) in sorted order", () => {
  const twenty = Array.from({ length: 20 }, (_, i) => (i + 1) * 10); // 10..200
  assert.equal(summarize(twenty).p95, 190); // rank 19 of 20
  const hundred = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
  assert.equal(summarize(hundred).p95, 95);
  assert.equal(summarize([5, 5, 5, 5, 5]).p95, 5);
  assert.equal(summarize([1, 2, 3, 4, 1000]).p95, 1000); // n=5: rank 5 is the max
});

test("count, median and p95 for a typical set", () => {
  assert.deepEqual(summarize([48, 52, 61, 45, 610, 50]), { count: 6, enough: true, median: 51, p95: 610 });
});

// ---------- small samples ----------
test(`fewer than ${MIN_SAMPLES} samples is "not enough data": no median, no p95`, () => {
  assert.equal(MIN_SAMPLES, 5);
  for (const n of [0, 1, 4]) {
    const s = summarize(Array.from({ length: n }, () => 100));
    assert.equal(s.count, n);
    assert.equal(s.enough, false);
    assert.equal(s.median, null);
    assert.equal(s.p95, null);
  }
  assert.equal(summarize([1, 2, 3, 4, 5]).enough, true);
});

test("a custom minimum is honoured", () => {
  assert.equal(summarize([7], 1).median, 7);
  assert.equal(summarize([7, 8], 3).enough, false);
});

// ---------- missing and bad fields ----------
test("missing, null, NaN, negative, infinite and string values are dropped, not counted", () => {
  const s = summarize([100, undefined, null, NaN, -5, Infinity, "120", 110, 120, 130, 140]);
  assert.deepEqual(s, { count: 5, enough: true, median: 120, p95: 140 });
});

test("non-array input is treated as no samples", () => {
  for (const bad of [undefined, null, {}, "12"]) assert.deepEqual(summarize(bad), { count: 0, enough: false, median: null, p95: null });
});

test("zero milliseconds is a valid sample", () => {
  assert.equal(isMs(0), true);
  assert.equal(summarize([0, 0, 0, 0, 0]).median, 0);
});

test("flattenLatency skips samples missing the field or a timestamp", () => {
  const tree = {
    "C-095": {
      a: { rxToWriteMs: 610, lastUpdated: 1000 },
      b: { eventAgeMs: 200, lastUpdated: 2000 }, // no rxToWriteMs
      c: { rxToWriteMs: 55 }, // no lastUpdated: can't place it in the window
      d: null,
      e: "junk",
    },
    "C-001": "junk",
  };
  assert.deepEqual(flattenLatency(tree, "rxToWriteMs"), [{ unit: "C-095", at: 1000, v: 610 }]);
  assert.deepEqual(flattenLatency(tree, "eventAgeMs"), [{ unit: "C-095", at: 2000, v: 200 }]);
  assert.deepEqual(flattenLatency(null, "rxToWriteMs"), []);
});

// ---------- recent window ----------
test("recentWindow keeps only the last hour, oldest first", () => {
  const now = 10 * WINDOW_MS;
  const list = [
    { unit: "a", at: now - WINDOW_MS - 1, v: 1 }, // just outside
    { unit: "a", at: now - 10, v: 3 },
    { unit: "a", at: now - WINDOW_MS, v: 2 }, // exactly on the edge: kept
    { unit: "a", v: 4 }, // no time: dropped
  ];
  assert.deepEqual(recentWindow(list, now).map((x) => x.v), [2, 3]);
});

test(`recentWindow keeps at most the newest ${WINDOW_MAX}`, () => {
  const now = 1e9;
  const list = Array.from({ length: 250 }, (_, i) => ({ unit: "a", at: now - 250 + i, v: i }));
  const w = recentWindow(list, now);
  assert.equal(w.length, WINDOW_MAX);
  assert.equal(w[0].v, 50);
  assert.equal(w[w.length - 1].v, 249);
});

// ---------- merging the two Receiver sources ----------
test("mergeSamples keeps one sample per curb and write time", () => {
  const history = [{ unit: "C-095", at: 1000, v: 610 }, { unit: "C-095", at: 2000, v: 48 }];
  const observed = [{ unit: "C-095", at: 2000, v: 48 }, { unit: "C-095", at: 3000, v: 52 }, { unit: "C-042", at: 2000, v: 70 }];
  const merged = mergeSamples(history, observed);
  assert.equal(merged.length, 4);
  assert.deepEqual(merged.map((x) => `${x.unit}@${x.at}`).sort(), ["C-042@2000", "C-095@1000", "C-095@2000", "C-095@3000"]);
});

// ---------- Firebase to dashboard ----------
test("deliveryDelay corrects the browser clock with .info/serverTimeOffset", () => {
  // Browser clock 300 ms behind the server: offset +300. Written at server 10 000,
  // listener fired at browser 9 900 = server 10 200, so the delay is 200 ms.
  assert.equal(deliveryDelay(10000, 9900, 300), 200);
  assert.equal(deliveryDelay(10000, 10200, 0), 200);
  assert.equal(deliveryDelay(10000, 10200, undefined), 200); // offset not loaded yet
});

test("deliveryDelay returns the raw value: negatives are kept, never clamped to 0 or dropped", () => {
  assert.equal(deliveryDelay(10000, 9800, 0), -200);
  assert.equal(deliveryDelay(10000, 5000, 0), -5000);
  assert.equal(deliveryDelay(10000, 10000.4, 0), 10000.4 - 10000); // not rounded
  assert.equal(deliveryDelay(undefined, 10000, 0), null);
  assert.equal(deliveryDelay("10000", 10000, 0), null);
  assert.equal(deliveryDelay(10000, NaN, 0), null);
});

test("the offset sign: a browser clock behind the server has a positive offset, which is added", () => {
  // .info/serverTimeOffset: server time ≈ Date.now() + offset.
  const serverWrote = 1_000_000;
  const trueDelay = 120;
  const browserBehindBy = 300; // browser reads 300 ms less than the server
  const firedAt = serverWrote + trueDelay - browserBehindBy;
  assert.equal(deliveryDelay(serverWrote, firedAt, +browserBehindBy), trueDelay);
  // The wrong sign would turn a 120 ms delay into a negative one.
  assert.notEqual(deliveryDelay(serverWrote, firedAt, -browserBehindBy), trueDelay);
});

// ---------- is Firebase-to-dashboard measurable? ----------
test("all raw delays >= 0: measurable", () => {
  assert.deepEqual(deliveryVerdict([0, 12, 340, 95.5]), { measurable: true });
  assert.deepEqual(deliveryVerdict([]), { measurable: true }); // no data is "not enough data", not "not measurable"
});

test("any negative raw delay: not measurable, with the count and the raw range", () => {
  assert.deepEqual(deliveryVerdict([120, -40, 80]), { measurable: false, negative: 1, count: 3, min: -40, max: 120 });
});

test("a run like the reported one: 19 negative readings the old clamp showed as exactly 0 ms", () => {
  // Illustrative values: no live curb reported while it was being investigated. With n = 19
  // the nearest-rank p95 is the largest value, so p95 = 0 meant every raw value was <= 0.
  const raw = [-312, -280, -455, -90, -130, -201, -377, -64, -510, -233, -298, -145, -402, -176, -88, -260, -341, -119, -222];
  assert.equal(raw.length, 19);
  // Before: every value clamped to 0, so median 0 ms and p95 0 ms.
  assert.deepEqual(summarize(raw.map((v) => Math.max(0, v))), { count: 19, enough: true, median: 0, p95: 0 });
  // Now: the stage says it can't be measured instead.
  const v = deliveryVerdict(raw);
  assert.equal(v.measurable, false);
  assert.equal(v.negative, 19);
  assert.equal(v.min, -510);
  assert.equal(v.max, -64);
});

test("non-numbers are ignored by the verdict", () => {
  assert.deepEqual(deliveryVerdict([10, null, undefined, NaN, "5"]), { measurable: true });
});

// ---------- total ----------
test("the total is the sum of the medians, and only when every stage has one", () => {
  assert.deepEqual(sumOfMedians([{ label: "A", median: 300 }, { label: "B", median: 50 }, { label: "C", median: 120 }]), { value: 470, missing: [] });
  assert.deepEqual(sumOfMedians([{ label: "A", median: null }, { label: "B", median: 50 }, { label: "C" }]), { value: null, missing: ["A", "C"] });
  assert.deepEqual(sumOfMedians([{ label: "A", median: 0 }]), { value: 0, missing: [] });
});

// ---------- Brad's benchmark placeholders ----------
test("the benchmark is labelled as Brad's and stays TODO (null) until numbers are provided", () => {
  const b = CURB_TO_RECEIVER_BENCHMARK;
  assert.equal(b.measuredBy, "Brad");
  for (const k of ["samples", "medianMs", "p95Ms"]) {
    assert.ok(b[k] === null || (typeof b[k] === "number" && b[k] >= 0), `${k} must be null (TODO) or a number`);
  }
});

// ---------- Simulation: every stage from the simulator's samples ----------
// Brad's report: in Simulation, after switching to Live and back, the card showed no
// median or p95 even with simulated curbs. Three causes, each covered below:
//   1. Leaving Simulation stops the simulation, so no new samples arrive, and the card
//      only read the last hour up to now: once stopped, the samples aged out.
//   2. Firebase to dashboard was timed in this browser against the simulator's
//      lastUpdated, which is this browser's clock: it measured the clock gap (negative,
//      so "Not measurable here", when the browser runs ahead) and was memory only, so it
//      restarted at 0 after the switch and never filled with the simulation stopped.
//   3. With one stage empty, the total had no median.

const MIN = 60 * 1000;
const NOW = Date.UTC(2026, 10, 22, 15, 0);
// A demo/latency tree like the simulator writes: `perCurb` samples for each curb, the
// newest `ageMin` minutes before NOW, a minute apart.
function simTree(curbs, perCurb, ageMin, seed = 1) {
  let x = seed;
  const random = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  const tree = {};
  for (let c = 0; c < curbs; c++) {
    const id = `C-${String(c + 1).padStart(3, "0")}`;
    tree[id] = {};
    for (let i = 0; i < perCurb; i++) tree[id][`s${i}`] = latencySample(NOW - (ageMin + i) * MIN, random);
  }
  return tree;
}
const statsOf = (points) => summarize(points.map((p) => p.v));

test("the simulator's samples carry all three stages, as whole non-negative milliseconds", () => {
  let x = 7;
  const random = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  const samples = Array.from({ length: 500 }, () => latencySample(NOW, random));
  for (const s of samples) {
    assert.equal(s.lastUpdated, NOW);
    for (const k of ["rxToWriteMs", "deliveryMs"]) assert.ok(Number.isInteger(s[k]) && s[k] >= 0, k);
    if ("eventAgeMs" in s) assert.ok(Number.isInteger(s.eventAgeMs) && s.eventAgeMs >= 0);
  }
  const withAge = samples.filter((s) => "eventAgeMs" in s).length;
  assert.ok(withAge > 400 && withAge < 500, `about 9 in 10 have eventAgeMs (${withAge})`);
});

test("Simulation: a stopped simulation's samples still give a median and p95, with a note", () => {
  // 43 curbs, three samples each, the newest two hours old: the simulation stopped then.
  const history = simTree(43, 3, 120);
  const sim = stagePoints({ sim: true, history, now: NOW });
  for (const stage of ["age", "rx", "fb"]) {
    const st = statsOf(sim[stage]);
    assert.ok(st.enough, `${stage} has enough samples (${st.count})`);
    assert.ok(isMs(st.median) && isMs(st.p95), stage);
  }
  assert.equal(sim.stoppedAt, NOW - 120 * MIN);
  // Live, the same samples are two hours old, so they're out of the hour, as before.
  const live = stagePoints({ sim: false, history, now: NOW });
  assert.equal(live.rx.length, 0);
});

test("Simulation: Firebase to dashboard comes from the samples, never this browser's clock", () => {
  const history = simTree(10, 3, 0);
  // What timing the simulator's writes here gave with a browser clock 3 s ahead.
  const clockGap = Array.from({ length: 6 }, (_, i) => ({ unit: "C-001", at: NOW - i * 1000, v: -3010 }));
  const sim = stagePoints({ sim: true, history, delivery: clockGap, now: NOW });
  assert.equal(sim.fb.length, 30);
  assert.ok(sim.fb.every((p) => p.v >= 0), "no clock-gap values");
  assert.equal(deliveryVerdict(sim.fb.map((p) => p.v)).measurable, true);
  // Nothing in memory (after switching to Live and back) still fills the stage.
  assert.equal(stagePoints({ sim: true, history, delivery: [], now: NOW }).fb.length, 30);
  // Live still measures in the browser and still refuses negatives.
  const live = stagePoints({ sim: false, history: {}, delivery: clockGap, now: NOW });
  assert.equal(live.fb.length, 6);
  assert.equal(deliveryVerdict(live.fb.map((p) => p.v)).measurable, false);
});

test("Simulation: a running simulation has no note, and its hour ends at the newest sample", () => {
  const fresh = stagePoints({ sim: true, history: simTree(5, 3, 0), now: NOW });
  assert.equal(fresh.stoppedAt, null);
  // Samples more than an hour before the newest one are left out.
  const history = { "C-001": {
    new: latencySample(NOW - 200 * MIN, () => 0.5),
    old: latencySample(NOW - 200 * MIN - WINDOW_MS - MIN, () => 0.5),
  } };
  const st = stagePoints({ sim: true, history, now: NOW });
  assert.deepEqual(st.rx.map((p) => p.at), [NOW - 200 * MIN]);
  // A sample stamped ahead of now (another browser's clock) doesn't move the hour forward.
  const ahead = stagePoints({ sim: true, history: { "C-001": { a: latencySample(NOW + 10 * MIN, () => 0.5), b: latencySample(NOW - 5 * MIN, () => 0.5) } }, now: NOW });
  assert.equal(ahead.rx.length, 1);
  assert.equal(ahead.stoppedAt, null);
});

test("Simulation: samples from before deliveryMs existed still show all three stages", () => {
  const history = simTree(20, 3, 90);
  for (const byId of Object.values(history)) for (const s of Object.values(byId)) delete s.deliveryMs;
  const sim = stagePoints({ sim: true, history, now: NOW });
  assert.ok(statsOf(sim.age).enough && statsOf(sim.rx).enough);
  assert.equal(sim.fb.length, 60);
  assert.ok(statsOf(sim.fb).enough);
  assert.ok(sim.fb.every((p) => p.v >= 60 && p.v <= 200), "plausible stand-ins");
  // A sample's own deliveryMs wins over the stand-in.
  const mixed = { "C-001": { a: { rxToWriteMs: 50, deliveryMs: 999, lastUpdated: NOW }, b: { rxToWriteMs: 50, lastUpdated: NOW - MIN } } };
  const fb = stagePoints({ sim: true, history: mixed, now: NOW }).fb;
  assert.deepEqual(fb.map((p) => p.v), [simulatedDeliveryMs("C-001", NOW - MIN), 999]);
});

test("simulatedDeliveryMs: 60 to 200 ms, the same for the same curb and time", () => {
  const values = Array.from({ length: 2000 }, (_, i) => simulatedDeliveryMs(`C-${i % 50}`, NOW + i * 997));
  assert.ok(values.every((v) => Number.isInteger(v) && v >= 60 && v <= 200));
  assert.ok(new Set(values).size > 100, "spread, not constant");
  assert.equal(simulatedDeliveryMs("C-007", NOW), simulatedDeliveryMs("C-007", NOW));
});

// The reported readings: 25 values from -45 ms to -39 ms, from timing the simulator's writes
// against this browser's clock (the code before this fix).
const REPORTED = Array.from({ length: 25 }, (_, i) => ({ unit: `C-${String(i + 1).padStart(3, "0")}`, at: NOW - i * 1000, v: -45 + (i % 7) }));

test("the not-measurable verdict applies to Live only", () => {
  // Live: exactly as before, the reported readings are not measurable.
  const live = deliveryStageVerdict({ sim: false, points: REPORTED });
  assert.deepEqual(live, { measurable: false, negative: 25, count: 25, min: -45, max: -39 });
  assert.equal(deliveryStageVerdict({ sim: false, points: [{ v: 80 }, { v: 120 }] }), null);
  // Simulation: never, whatever the values.
  assert.equal(deliveryStageVerdict({ sim: true, points: REPORTED }), null);
  assert.equal(deliveryStageVerdict({ sim: true, points: [] }), null);
});

test("Simulation with the reported readings in memory: all three stages and the Total have numbers", () => {
  // 25 old-format samples (no deliveryMs), plus what the old code measured in the browser.
  const history = Object.fromEntries(REPORTED.map((r) => [r.unit, { s0: { rxToWriteMs: 60, eventAgeMs: 250, lastUpdated: r.at } }]));
  const p = stagePoints({ sim: true, history, delivery: REPORTED, now: NOW });
  assert.ok(p.fb.every((x) => x.v > 0), "no negative simulated values");
  assert.equal(deliveryStageVerdict({ sim: true, points: p.fb }), null);
  const stages = [p.age, p.rx, p.fb].map((pts, i) => ({ label: `stage ${i}`, ...statsOf(pts) }));
  assert.ok(stages.every((s) => s.enough && s.median > 0 && s.p95 > 0));
  assert.deepEqual(sumOfMedians(stages).missing, []);
});

test("Live is unchanged: stagePoints gives exactly what the card computed before", () => {
  // The card's old Live code: win(mergeSamples(flattenLatency(h, "rxToWriteMs"), observed)) and win(delivery).
  const history = { "C-001": { a: { rxToWriteMs: 40, lastUpdated: NOW - 5 * MIN }, b: { rxToWriteMs: 70, lastUpdated: NOW - 90 * MIN }, c: { eventAgeMs: 300, lastUpdated: NOW - MIN } },
    "C-002": { a: { rxToWriteMs: 55, deliveryMs: 999, lastUpdated: NOW - 2 * MIN } } };
  const observed = [{ unit: "C-001", at: NOW - 5 * MIN, v: 41 }, { unit: "C-002", at: NOW - 3 * MIN, v: 52 }];
  const delivery = [{ unit: "C-001", at: NOW - MIN, v: -12 }, { unit: "C-002", at: NOW - 70 * MIN, v: 30 }, { unit: "C-002", at: NOW, v: 25 }];
  const p = stagePoints({ sim: false, history, observed, delivery, now: NOW });
  assert.deepEqual(p.rx, recentWindow(mergeSamples(flattenLatency(history, "rxToWriteMs"), observed), NOW));
  assert.deepEqual(p.fb, recentWindow(delivery, NOW));
  assert.equal(p.stoppedAt, null);
  // Live never uses simulated values: deliveryMs and stand-ins stay out, negatives stay in.
  assert.ok(p.fb.some((x) => x.v === -12) && !p.fb.some((x) => x.v === 999));
  assert.equal(deliveryStageVerdict({ sim: false, points: p.fb }).measurable, false);
});

test("Brad's case: 43 curbs, simulation stopped after a switch, browser clock 3 s ahead: every stage and the total", () => {
  const history = simTree(43, 2, 75, 3);
  const clockGap = [{ unit: "C-001", at: NOW, v: -3010 }];
  const p = stagePoints({ sim: true, history, delivery: clockGap, now: NOW });
  const stages = [
    { label: "Curb to Receiver", ...statsOf(p.age) },
    { label: "Receiver to Firebase", ...statsOf(p.rx) },
    { label: "Firebase to dashboard", ...statsOf(p.fb) },
  ];
  const total = sumOfMedians(stages);
  assert.deepEqual(total.missing, []);
  assert.ok(isMs(total.value) && total.value > 0);
  assert.equal(newestAt([...p.age, ...p.rx, ...p.fb]), NOW - 75 * MIN);
});

test("newestAt ignores samples without a usable time", () => {
  assert.equal(newestAt([{ at: 5 }, { at: null }, { at: 9 }, null, { at: -1 }]), 9);
  assert.equal(newestAt([]), null);
  assert.equal(newestAt(undefined), null);
});

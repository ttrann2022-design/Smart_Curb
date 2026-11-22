// Unit tests for the latency card's stats helpers (src/analytics/latencyStats.js).
//   npm run test:latency
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MIN_SAMPLES, WINDOW_MS, WINDOW_MAX, isMs, summarize, recentWindow, mergeSamples,
  flattenLatency, deliveryDelay, deliveryVerdict, sumOfMedians,
} from "../src/analytics/latencyStats.js";
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

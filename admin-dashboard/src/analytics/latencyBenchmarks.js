// Benchmark numbers for the latency card: measured by Brad in his tests, NOT live data.
// The dashboard labels every value from this file "Benchmark · measured by Brad".
//
// Curb to Receiver ("event age"): how old a curb's event is when the Receiver gets
// the LoRa packet. Nothing in the live database measures this leg, so it comes from
// Brad's bench tests.
//
// TODO(Brad): fill in the numbers from your event-age benchmark. Leave a value null
// until you have it; the card shows "Benchmark pending" while any of them is null.
//   samples:  how many packets the benchmark measured (a whole number)
//   medianMs: median event age, in milliseconds
//   p95Ms:    95th-percentile event age, in milliseconds
//   measured: when the benchmark ran, e.g. "2026-11-20"
//   setup:    one line on the conditions, e.g. "SF7, 125 kHz, 40 m, line of sight"
export const CURB_TO_RECEIVER_BENCHMARK = {
  measuredBy: "Brad",
  samples: null, // TODO
  medianMs: null, // TODO
  p95Ms: null, // TODO
  measured: null, // TODO
  setup: null, // TODO
};

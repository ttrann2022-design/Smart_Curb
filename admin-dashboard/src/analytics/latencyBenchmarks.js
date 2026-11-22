// Benchmark numbers for the latency card. NOT live data, and NOT measured on the curbs:
// the dashboard labels every value from this file "Benchmark · simulated, from Brad's report".
//
// Curb to Receiver ("event age"): how old a curb's event is when the Receiver gets the
// LoRa packet. Nothing in the live database measures this leg. These numbers come from
// Brad's 10/30 report (task 8.2), which ran the event-age test in the simulator, not on
// the real hardware. Replace them if a hardware benchmark is ever run, and change
// `source` and the card's wording with them.
//   source:    "simulated": where the numbers came from (shown on the card)
//   by:        who ran the benchmark
//   report:    which report they come from (shown on the card)
//   samples:   how many events the benchmark measured
//   medianMs:  median event age, in milliseconds
//   p95Ms:     95th-percentile event age, in milliseconds
//   slowestMs: the slowest event age seen, in milliseconds
export const CURB_TO_RECEIVER_BENCHMARK = {
  source: "simulated",
  by: "Brad",
  report: "Brad's 10/30 report (task 8.2)",
  samples: 50,
  medianMs: 259,
  p95Ms: 359,
  slowestMs: 2530,
};

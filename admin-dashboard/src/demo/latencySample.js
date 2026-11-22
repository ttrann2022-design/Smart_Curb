// One synthetic latency sample, shaped like the Receiver's latency/<unitId>/<sampleId>,
// for the simulator (src/demo/simulator.js). No imports, so npm run test:latency can load it.
//
// It carries all three stages, because Simulation shows every stage from the simulator:
//   eventAgeMs   curb to Receiver. About 1 in 10 lacks it, as a Receiver that can't
//                tell when the curb saw the event would send.
//   rxToWriteMs  Receiver to Firebase.
//   deliveryMs   Firebase to dashboard. Simulated, not measured: the simulator stamps
//                lastUpdated with this browser's clock, so timing its writes here would
//                only measure the gap between this browser's clock and Firebase's.
// Mostly quick, with an occasional slow outlier. `random` is for tests.
export function latencySample(lastUpdated, random = Math.random) {
  const sample = {
    rxToWriteMs: Math.round(35 + random() * 55 + (random() < 0.06 ? 250 + random() * 600 : 0)),
    deliveryMs: Math.round(60 + random() * 140 + (random() < 0.05 ? 300 + random() * 900 : 0)),
    lastUpdated,
  };
  if (random() < 0.9) {
    sample.eventAgeMs = Math.round(140 + random() * 220 + (random() < 0.05 ? 700 + random() * 1500 : 0));
  }
  return sample;
}

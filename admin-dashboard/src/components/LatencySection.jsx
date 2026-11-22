import { useEffect, useRef, useState } from "react";
import { ref, onValue, query, orderByChild, startAt, limitToLast } from "firebase/database";
import { database } from "../firebase";
import { dataPath } from "../dataMode";
import { useNow } from "../units";
import useWidth from "../useWidth";
import { Button, Chips, Notice } from "./ui";
import {
  MIN_SAMPLES, WINDOW_MS, WINDOW_MAX, isMs, summarize, recentWindow, mergeSamples,
  flattenLatency, deliveryDelay, deliveryVerdict, sumOfMedians,
} from "../analytics/latencyStats";
import { CURB_TO_RECEIVER_BENCHMARK as BENCH } from "../analytics/latencyBenchmarks";

// Transmission latency for Analytics, by pipeline stage:
//   curb -> LoRa -> Receiver -> Firebase RTDB -> this dashboard
//
// Live:
//   Curb to Receiver       Benchmark (Brad's event-age tests, analytics/latencyBenchmarks.js).
//   Receiver to Firebase   Measured. The Receiver writes rxToWriteMs (receive the LoRa packet
//                          -> finish the Firebase write) on units/<id> with each lastUpdated.
//                          One sample per new lastUpdated while this page is open, plus any
//                          history under latency/<unitId>/<sampleId> from the last hour.
//   Firebase to dashboard  Measured in this browser: server-corrected time when a curb's
//                          lastUpdated listener fires, minus that lastUpdated. Memory only.
// Simulation: every stage comes from the simulator (demo/latency, demo/units) and is
// labelled Simulated. Simulated numbers are never shown as measured.
//
// Light on the database: per-curb listeners on units/<id>/lastUpdated and rxToWriteMs only
// (never the whole unit, so lastSnapshot images aren't downloaded; Analytics' own units
// listener already holds this data, so these add no download), and a windowed query per
// curb on latency/<id> (last hour, at most 200).

const SOURCE = {
  measured: { label: "Measured · live data", cls: "lt-src lt-src-measured" },
  benchmark: { label: "Benchmark · measured by Brad", cls: "lt-src lt-src-bench" },
  simulated: { label: "Simulated", cls: "lt-src lt-sim" },
};

const CHART_KEEP = 100;
const TABLE_ROWS = 8;

const fmtMs = (v) => (v == null ? "n/a" : v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(v < 10000 ? 2 : 1)} s`);
// Raw values can be negative: show a real minus sign.
const fmtSigned = (v) => (v < 0 ? `−${fmtMs(-v)}` : fmtMs(v));
const fmtTick = (v) => (v > 0 && v < 10 && v % 1 ? `${v.toFixed(1)} ms` : fmtMs(v));
const fmtTime = (t) => (isMs(t) ? new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) : null);

// Round up to 1, 2, 2.5 or 5 × 10^n so the top gridline lands on a clean number.
function niceCeil(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((n) => n >= v);
}

function LegChart({ points, label }) {
  const [box, W] = useWidth();
  const [hover, setHover] = useState(null);
  const H = 120, PAD_L = 52, PAD_R = 12, PAD_T = 10, PAD_B = 8;
  const top = niceCeil(Math.max(...points.map((p) => p.v)));
  const x = (i) => PAD_L + (points.length < 2 ? 0 : (i / (points.length - 1)) * (W - PAD_L - PAD_R));
  const y = (v) => PAD_T + (1 - v / top) * (H - PAD_T - PAD_B);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const shown = hover === null ? null : points[hover];

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - r.left - PAD_L) / Math.max(1, W - PAD_L - PAD_R);
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(f * (points.length - 1)))));
  };

  return (
    <div ref={box} className="lt-chart">
      {W > 0 && (
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="an-svg"
          role="img"
          aria-label={`${label}: last ${points.length} samples, from ${fmtMs(Math.min(...points.map((p) => p.v)))} to ${fmtMs(Math.max(...points.map((p) => p.v)))}.`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {[0, top / 2, top].map((v) => (
            <g key={v}>
              <line className={v === 0 ? "an-axis" : "an-grid"} x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} />
              <text className="an-tick" x={PAD_L - 8} y={y(v) + 3.5} textAnchor="end">{fmtTick(v)}</text>
            </g>
          ))}
          {points.length > 1 && <path className="lt-line" d={path} />}
          <circle className="lt-dot" cx={x(points.length - 1)} cy={y(points[points.length - 1].v)} r="4" />
          {shown && (
            <g pointerEvents="none">
              <line className="an-cross" x1={x(hover)} x2={x(hover)} y1={PAD_T} y2={y(0)} />
              <circle className="lt-dot" cx={x(hover)} cy={y(shown.v)} r="4" />
            </g>
          )}
        </svg>
      )}
      {shown && W > 0 && (
        <div role="status" className="an-tip" style={{ left: x(hover), transform: `translateX(${x(hover) > W * 0.6 ? "calc(-100% - 10px)" : "10px"})` }}>
          <span><span className="sws-mono" translate="no">{shown.unit}</span>{fmtTime(shown.at) ? ` · ${fmtTime(shown.at)}` : ""}</span>
          <span className="sws-mono">{fmtMs(shown.v)}</span>
        </div>
      )}
    </div>
  );
}

function SourceTag({ source }) {
  const s = SOURCE[source];
  return <span className={s.cls}>{s.label}</span>;
}

// One stage: source tag, sample count, median and p95, or "not enough data".
function StageCard({ stage, delay }) {
  const st = stage.stats;
  return (
    <div className="lt-leg sws-enter" style={{ "--d": `${delay}ms` }}>
      <div className="lt-leg-top">
        <div className="lt-leg-k">{stage.label}</div>
        <SourceTag source={stage.source} />
      </div>
      <p className="lt-leg-note">{stage.note}</p>
      {stage.unmeasurable ? (
        <>
          <div className="lt-empty">Not measurable here</div>
          <p className="lt-leg-note">
            {stage.unmeasurable.negative} of {stage.unmeasurable.count} readings arrived before the time they say they were written
            (raw {fmtSigned(stage.unmeasurable.min)} to {fmtSigned(stage.unmeasurable.max)}). A real delay can't be negative: the delay is
            below the accuracy of this browser's estimate of Firebase's clock, which ignores network travel time. No number here would
            be honest.
          </p>
        </>
      ) : stage.pending ? (
        <>
          <div className="lt-empty">Benchmark pending</div>
          <p className="lt-leg-note">Brad's event-age numbers haven't been added yet (src/analytics/latencyBenchmarks.js).</p>
        </>
      ) : st.enough ? (
        <>
          <div className="lt-median"><span className="sws-mono">{fmtMs(st.median)}</span> <small>median</small></div>
          <dl className="lt-stats">
            <div><dt>p95</dt><dd className="sws-mono">{fmtMs(st.p95)}</dd></div>
            <div><dt>Samples</dt><dd className="sws-mono">{st.count}</dd></div>
            {stage.when && <div><dt>Measured</dt><dd>{stage.when}</dd></div>}
          </dl>
          {stage.chart?.length > 0 && <LegChart points={stage.chart} label={`${SOURCE[stage.source].label}: ${stage.label}`} />}
        </>
      ) : (
        <>
          <div className="lt-empty">Not enough data</div>
          <p className="lt-leg-note">
            {st.count} of {MIN_SAMPLES} samples needed{stage.waiting ? `. ${stage.waiting}` : "."}
          </p>
        </>
      )}
    </div>
  );
}

// units: the curbs in scope (from Analytics' own listener), used for their IDs only.
function LatencySection({ mode, units, delay = 0 }) {
  const sim = mode === "sim";
  const now = useNow(15000);
  const offset = useRef(0); // for listeners (no re-render needed)
  const [offsetMs, setOffsetMs] = useState(0); // for render
  const seen = useRef({}); // unit -> last lastUpdated seen (the baseline is never a sample)
  const rx = useRef({}); // unit -> latest rxToWriteMs on the unit record
  const [observed, setObserved] = useState([]); // rxToWriteMs paired with each new lastUpdated
  const [delivery, setDelivery] = useState([]); // Firebase-to-dashboard delays
  const [history, setHistory] = useState({}); // unit -> latency/<unit> samples in the window
  const [historyError, setHistoryError] = useState(false);
  const [leg, setLeg] = useState("rx");
  const [showAll, setShowAll] = useState(false);
  const unitIds = Object.keys(units || {}).sort();
  const unitKey = unitIds.join("|");

  useEffect(() => onValue(ref(database, ".info/serverTimeOffset"), (snap) => {
    offset.current = Number(snap.val()) || 0;
    setOffsetMs(offset.current);
  }), []);

  useEffect(() => {
    const ids = unitKey ? unitKey.split("|") : [];
    const keep = (list) => list.slice(-WINDOW_MAX * 2);
    const stops = ids.flatMap((id) => [
      onValue(ref(database, dataPath(`units/${id}/rxToWriteMs`)), (snap) => { rx.current[id] = snap.val(); }, () => {}),
      onValue(ref(database, dataPath(`units/${id}/lastUpdated`)), (snap) => {
        // Time this listener fired, before anything else runs.
        const firedAt = Date.now();
        const lu = snap.val();
        const prev = seen.current[id];
        seen.current[id] = lu;
        if (prev === undefined || !isMs(lu) || lu === prev) return; // first value is the baseline
        const d = deliveryDelay(lu, firedAt, offset.current);
        if (d !== null) setDelivery((list) => keep([...list, { unit: id, at: firedAt + offset.current, v: d }]));
        // rxToWriteMs arrives in the same write; read it once this event's listeners have run.
        setTimeout(() => {
          const v = rx.current[id];
          if (isMs(v)) setObserved((list) => keep([...list, { unit: id, at: lu, v }]));
        }, 0);
      }, () => {}),
      onValue(
        query(ref(database, dataPath(`latency/${id}`)), orderByChild("lastUpdated"), startAt(Date.now() - WINDOW_MS), limitToLast(WINDOW_MAX)),
        (snap) => { setHistory((h) => ({ ...h, [id]: snap.val() || {} })); setHistoryError(false); },
        () => setHistoryError(true),
      ),
    ]);
    return () => stops.forEach((stop) => stop());
  }, [unitKey]);

  // Only curbs still in scope count.
  const inScope = (x) => Object.hasOwn(units || {}, x.unit);
  const serverNow = now + offsetMs;
  const win = (list) => recentWindow(list.filter(inScope), serverNow);

  const historyTree = Object.fromEntries(Object.entries(history).filter(([u]) => Object.hasOwn(units || {}, u)));
  const rxPoints = win(mergeSamples(flattenLatency(historyTree, "rxToWriteMs"), observed));
  const ageSimPoints = win(flattenLatency(historyTree, "eventAgeMs"));
  const deliveryPoints = win(delivery);

  const benchStats = {
    count: BENCH.samples ?? 0,
    enough: isMs(BENCH.medianMs) && isMs(BENCH.p95Ms) && Number.isInteger(BENCH.samples) && BENCH.samples >= MIN_SAMPLES,
    median: BENCH.medianMs,
    p95: BENCH.p95Ms,
  };
  const benchPending = BENCH.samples == null || BENCH.medianMs == null || BENCH.p95Ms == null;

  const stages = [
    sim
      ? { id: "age", label: "Curb to Receiver", source: "simulated", note: "Event age: how old the curb's event was when the Receiver got the LoRa packet.", points: ageSimPoints, waiting: "Start the simulation on the Simulation page." }
      : { id: "age", label: "Curb to Receiver", source: "benchmark", note: "Event age: how old the curb's event is when the Receiver gets the LoRa packet. From Brad's bench tests, not live data.", stats: benchStats, pending: benchPending, when: BENCH.measured || null },
    { id: "rx", label: "Receiver to Firebase", source: sim ? "simulated" : "measured", note: "From the Receiver getting the LoRa packet to finishing its Firebase write.", points: rxPoints, waiting: sim ? "Start the simulation on the Simulation page." : "A sample arrives each time a curb reports." },
    { id: "fb", label: "Firebase to dashboard", source: sim ? "simulated" : "measured", note: "From the write's timestamp to this page's listener firing, corrected for this browser's clock. Not stored.", points: deliveryPoints, waiting: "Counted while this page is open, each time a curb reports." },
  ].map((s) => (s.points ? { ...s, stats: summarize(s.points.map((p) => p.v)), chart: s.points.slice(-CHART_KEEP) } : s))
    // Firebase to dashboard keeps raw values. If any is negative the stage can't be measured:
    // say so instead of showing a clamped 0 (see deliveryVerdict).
    .map((s) => {
      if (s.id !== "fb") return s;
      const verdict = deliveryVerdict(s.points.map((p) => p.v));
      return verdict.measurable ? s : { ...s, unmeasurable: verdict, chart: [] };
    });

  const total = sumOfMedians(stages.map((s) => ({
    label: s.unmeasurable ? `${s.label} (not measurable here)` : s.label,
    median: s.pending || s.unmeasurable || !s.stats?.enough ? null : s.stats.median,
  })));
  const sources = [...new Set(stages.map((s) => s.source))];

  // Per-curb table for the stages measured per curb.
  const tableStages = stages.filter((s) => s.points && !s.unmeasurable);
  const tableStage = tableStages.find((s) => s.id === leg) || tableStages[0];
  const tableUnits = [...new Set(tableStage.points.map((p) => p.unit))];
  const tableRows = tableUnits
    .map((unit) => ({ unit, stats: summarize(tableStage.points.filter((p) => p.unit === unit).map((p) => p.v)) }))
    .sort((a, b) => (b.stats.p95 ?? -1) - (a.stats.p95 ?? -1) || a.unit.localeCompare(b.unit, undefined, { numeric: true }));
  const shownRows = showAll ? tableRows : tableRows.slice(0, TABLE_ROWS);

  return (
    <section className="an-section sws-enter" style={{ "--d": `${delay}ms` }} aria-labelledby="lt-h">
      <div className="an-head">
        <h2 id="lt-h" className="an-h2">
          Transmission latency
          {sim && <span className="sws-badge lt-sim">SIMULATED</span>}
        </h2>
        <span className="an-meta">Last hour · up to {WINDOW_MAX} samples per stage</span>
      </div>
      <p className="an-sub">
        {sim
          ? "Simulated by the simulator so you can see how this card behaves. None of these numbers are measurements of real hardware."
          : "How long a curb event takes to reach this dashboard, stage by stage. Each number says where it comes from: measured from live data, or a benchmark from Brad's tests."}
      </p>

      {historyError && !sim && (
        <div className="an-panel"><Notice tone="warn" title="Couldn't read the latency history">Showing only what this page measures while it's open. Your account may not have access to latency/.</Notice></div>
      )}

      <div className="lt-stack">
        <div className="lt-legs">
          {stages.map((s, i) => <StageCard key={s.id} stage={s} delay={delay + 40 + i * 40} />)}
        </div>

        <div className="an-panel lt-total">
          <div className="lt-leg-top">
            <div className="lt-leg-k">Total · sum of the three medians</div>
            <span className="lt-src-group">{sources.map((src) => <SourceTag key={src} source={src} />)}</span>
          </div>
          {total.value !== null ? (
            <div className="lt-median"><span className="sws-mono">{fmtMs(total.value)}</span> <small>sum of medians</small></div>
          ) : (
            <div className="lt-empty">Not enough data</div>
          )}
          <p className="lt-leg-note">
            {total.value !== null
              ? `Adds each stage's median${sim ? "" : ", mixing a benchmark with live measurements"}. It is not a measured end-to-end time, and medians don't add up to the median of a whole trip.`
              : `Needs a median for every stage. Missing: ${total.missing.join(", ")}.`}
          </p>
        </div>

        {tableRows.length > 0 && (
          <div className="an-panel lt-units">
            <div className="lt-units-head">
              <h3 className="lt-h3">By curb · {SOURCE[tableStage.source].label}</h3>
              <Chips label="Latency stage" options={tableStages.map((s) => ({ id: s.id, label: s.label }))} value={tableStage.id} onChange={setLeg} />
            </div>
            <div className="sws-table-scroll">
              <table className="lt-table">
                <caption className="sws-sr-only">{SOURCE[tableStage.source].label}: {tableStage.label} latency by curb, slowest 95th percentile first</caption>
                <thead>
                  <tr>
                    <th scope="col" className="sws-th">Curb</th>
                    <th scope="col" className="sws-th">Median</th>
                    <th scope="col" className="sws-th">p95</th>
                    <th scope="col" className="sws-th">Samples</th>
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map(({ unit, stats: s }) => (
                    <tr key={unit}>
                      <th scope="row" className="sws-mono" translate="no">{unit}</th>
                      {s.enough ? (
                        <>
                          <td className="sws-mono">{fmtMs(s.median)}</td>
                          <td className="sws-mono">{fmtMs(s.p95)}</td>
                        </>
                      ) : (
                        <td colSpan={2} className="lt-na">Not enough data</td>
                      )}
                      <td className="sws-mono">{s.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {tableRows.length > TABLE_ROWS && (
              <div><Button size="sm" onClick={() => setShowAll((v) => !v)}>{showAll ? `Show slowest ${TABLE_ROWS}` : `Show all ${tableRows.length} curbs`}</Button></div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default LatencySection;

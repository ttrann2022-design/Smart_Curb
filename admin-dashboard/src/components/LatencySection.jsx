import { useEffect, useRef, useState } from "react";
import { useScope, useScoped } from "../useScope";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";
import { dataPath } from "../dataMode";
import useWidth from "../useWidth";
import { Button, Chips, EmptyState, Notice } from "./ui";

// Transmission latency for Analytics. Three legs, each optional:
//   eventAgeMs   from latency/<unitId>/<sampleId> (written by the Receiver)
//   rxToWriteMs  from the same samples
//   fbToDash     measured in this browser: server-corrected "now" minus a unit's
//                lastUpdated, each time lastUpdated changes. Kept in memory only.
// In Simulation the samples come from demo/latency (synthetic, from the simulator).

const LEGS = [
  { id: "eventAgeMs", label: "Event age", note: "How old the curb's event was when the Receiver handled it." },
  { id: "rxToWriteMs", label: "Receiver to Firebase", note: "From the Receiver getting the event to its database write." },
  { id: "fbToDash", label: "Firebase to dashboard", note: "Measured in this browser when a curb's lastUpdated changes. Not stored." },
];
const CHART_KEEP = 100;
const DASH_KEEP = 500;
const TABLE_ROWS = 8;

const isMs = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;

// Median, nearest-rank 95th percentile, slowest and count; null when there's no data.
function stats(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return {
    median: s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2,
    p95: s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)],
    max: s[s.length - 1],
    count: s.length,
  };
}

const fmtMs = (v) => (v == null ? "n/a" : v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(v < 10000 ? 2 : 1)} s`);
// Axis ticks keep one decimal under 10 ms, so a 0 to 1 ms axis doesn't read 0 / 1 / 1.
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
          aria-label={`${label}: last ${points.length} ${points.length === 1 ? "sample" : "samples"}, from ${fmtMs(Math.min(...points.map((p) => p.v)))} to ${fmtMs(Math.max(...points.map((p) => p.v)))}.`}
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

function LatencySection({ mode, delay = 0 }) {
  const sim = mode === "sim";
  const [allSamples, setSamples] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [allDash, setDash] = useState([]);
  const [leg, setLeg] = useState("rxToWriteMs");
  const [showAll, setShowAll] = useState(false);
  const offset = useRef(0);
  const seen = useRef(null);
  // Curbs in scope, for filtering the samples below (src/scope.js).
  const [allLots, setLots] = useState({});
  const [allUnits, setUnits] = useState({});
  const scope = useScope();
  const { units: scopedUnits } = useScoped(allLots, allUnits);

  useEffect(() => {
    const stopSamples = onValue(ref(database, dataPath("latency")), (snap) => {
      const list = [];
      Object.entries(snap.val() || {}).forEach(([unit, byId]) => {
        if (!byId || typeof byId !== "object") return;
        Object.entries(byId).forEach(([id, s]) => {
          if (!s || typeof s !== "object") return;
          list.push({ unit, id, eventAgeMs: s.eventAgeMs, rxToWriteMs: s.rxToWriteMs, at: s.lastUpdated });
        });
      });
      // Oldest first; samples without a timestamp keep their key order at the start.
      list.sort((a, b) => (isMs(a.at) ? a.at : -1) - (isMs(b.at) ? b.at : -1) || a.id.localeCompare(b.id));
      setSamples(list);
      setError(false);
      setLoaded(true);
    }, () => { setError(true); setLoaded(true); });

    const stopOffset = onValue(ref(database, ".info/serverTimeOffset"), (snap) => { offset.current = Number(snap.val()) || 0; });

    // Firebase to dashboard: compare each changed lastUpdated with server-corrected now.
    // The first snapshot only sets the baseline; old timestamps aren't delays.
    const stopLots = onValue(ref(database, dataPath("lots")), (snap) => setLots(snap.val() || {}), () => {});
    const stopUnits = onValue(ref(database, dataPath("units")), (snap) => {
      setUnits(snap.val() || {});
      const now = Date.now() + offset.current;
      const latest = {};
      const fresh = [];
      Object.entries(snap.val() || {}).forEach(([unit, u]) => {
        const lu = u?.lastUpdated;
        if (!isMs(lu)) return;
        latest[unit] = lu;
        if (seen.current && seen.current[unit] !== lu) fresh.push({ unit, v: Math.max(0, now - lu), at: now });
      });
      seen.current = latest;
      if (fresh.length) setDash((d) => [...d, ...fresh].slice(-DASH_KEEP));
    }, () => {});

    return () => { stopSamples(); stopOffset(); stopUnits(); stopLots(); };
  }, []);

  // Only curbs in scope: another customer's samples never reach the chart or table.
  const inScope = (x) => scope.kind === "all" || Object.hasOwn(scopedUnits, x.unit);
  const samples = allSamples.filter(inScope);
  const dash = allDash.filter(inScope);

  // Points per leg, oldest first.
  const pointsFor = (id) => (id === "fbToDash"
    ? dash
    : samples.filter((s) => isMs(s[id])).map((s) => ({ unit: s.unit, v: s[id], at: s.at })));
  const legData = LEGS.map((l) => {
    const pts = pointsFor(l.id);
    return { ...l, stats: stats(pts.map((p) => p.v)), chart: pts.slice(-CHART_KEEP) };
  });

  const units = [...new Set([...samples.map((s) => s.unit), ...dash.map((d) => d.unit)])];
  const tableRows = units
    .map((unit) => ({ unit, stats: stats(pointsFor(leg).filter((p) => p.unit === unit).map((p) => p.v)) }))
    .sort((a, b) => (b.stats?.p95 ?? -1) - (a.stats?.p95 ?? -1) || a.unit.localeCompare(b.unit, undefined, { numeric: true }));
  const shownRows = showAll ? tableRows : tableRows.slice(0, TABLE_ROWS);
  const empty = loaded && !error && samples.length === 0 && dash.length === 0;
  const legName = LEGS.find((l) => l.id === leg).label;

  return (
    <section className="an-section sws-enter" style={{ "--d": `${delay}ms` }} aria-labelledby="lt-h">
      <div className="an-head">
        <h2 id="lt-h" className="an-h2">
          Transmission latency
          {sim && <span className="sws-badge lt-sim">SIMULATED</span>}
        </h2>
        {loaded && !empty && (
          <span className="an-meta">{samples.length} {sim ? "simulated " : ""}{samples.length === 1 ? "sample" : "samples"}</span>
        )}
      </div>
      <p className="an-sub">
        {sim
          ? "Simulated samples from the simulator, so you can see how this card behaves. They are not measurements of real hardware."
          : "How long a curb event takes to reach this dashboard, leg by leg. Each leg shows n/a until there's data for it."}
      </p>

      {error ? (
        <div className="an-panel"><Notice tone="busy" title="Couldn't read latency samples">Your account may not have access, or the connection dropped. Reload the page to try again.</Notice></div>
      ) : !loaded ? (
        <div className="an-panel"><p className="sws-note" role="status">Loading…</p></div>
      ) : empty ? (
        <div className="an-panel">
          <EmptyState icon="clock" title="No samples yet">
            {sim
              ? "Waiting for the simulation to report latency. Load fresh simulated data or start the simulation on the Simulation page."
              : "Waiting for the Receiver to report latency."}
          </EmptyState>
        </div>
      ) : (
        <div className="lt-stack">
          <div className="lt-legs">
            {legData.map((l, i) => (
              <div key={l.id} className="lt-leg sws-enter" style={{ "--d": `${delay + 40 + i * 40}ms` }}>
                <div className="lt-leg-k">{l.label}{sim && " · Simulated"}</div>
                <p className="lt-leg-note">{l.note}</p>
                {l.stats ? (
                  <>
                    <div className="lt-median"><span className="sws-mono">{fmtMs(l.stats.median)}</span> <small>median</small></div>
                    <dl className="lt-stats">
                      <div><dt>p95</dt><dd className="sws-mono">{fmtMs(l.stats.p95)}</dd></div>
                      <div><dt>Slowest</dt><dd className="sws-mono">{fmtMs(l.stats.max)}</dd></div>
                      <div><dt>Samples</dt><dd className="sws-mono">{l.stats.count}</dd></div>
                    </dl>
                    <LegChart points={l.chart} label={`${sim ? "Simulated " : ""}${l.label}`} />
                  </>
                ) : (
                  <>
                    <div className="lt-median lt-na"><span className="sws-mono">n/a</span></div>
                    <p className="lt-leg-note">
                      {l.id === "fbToDash"
                        ? "Appears when a curb changes while this page is open."
                        : "No samples include this field yet."}
                    </p>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="an-panel lt-units">
            <div className="lt-units-head">
              <h3 className="lt-h3">By unit{sim && " · Simulated"}</h3>
              <Chips label="Latency leg" options={LEGS.map((l) => ({ id: l.id, label: l.label }))} value={leg} onChange={setLeg} />
            </div>
            <div className="sws-table-scroll">
              <table className="lt-table">
                <caption className="sws-sr-only">{sim ? "Simulated " : ""}{legName} latency by unit, slowest 95th percentile first</caption>
                <thead>
                  <tr>
                    <th scope="col" className="sws-th">Unit</th>
                    <th scope="col" className="sws-th">Median</th>
                    <th scope="col" className="sws-th">p95</th>
                    <th scope="col" className="sws-th">Slowest</th>
                    <th scope="col" className="sws-th">Samples</th>
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map(({ unit, stats: s }) => (
                    <tr key={unit}>
                      <th scope="row" className="sws-mono" translate="no">{unit}</th>
                      <td className={`sws-mono${s ? "" : " lt-na"}`}>{fmtMs(s?.median)}</td>
                      <td className={`sws-mono${s ? "" : " lt-na"}`}>{fmtMs(s?.p95)}</td>
                      <td className={`sws-mono${s ? "" : " lt-na"}`}>{fmtMs(s?.max)}</td>
                      <td className="sws-mono">{s?.count ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {tableRows.length > TABLE_ROWS && (
              <div><Button size="sm" onClick={() => setShowAll((v) => !v)}>{showAll ? `Show slowest ${TABLE_ROWS}` : `Show all ${tableRows.length} units`}</Button></div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default LatencySection;

import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { ref, onValue, query, limitToLast } from "firebase/database";
import { database } from "../firebase";
import { dataPath } from "../dataMode";
import { c } from "../theme";
import { StallMark } from "../components/LotPlan";
import LatencySection from "../components/LatencySection";
import useWidth from "../useWidth";
import { PageHeader, EmptyState, Button } from "../components/ui";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = ["7a", "8a", "9a", "10a", "11a", "12p", "1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p"];
const HOURS_LONG = ["7 AM", "8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM", "6 PM", "7 PM", "8 PM"];

// Sequential ramp in the "occupied" hue (never lime: lime means free), from a dim
// step that still clears the panel surface up to full --occupied. Five bins of 20
// points; checked with the dataviz validator as a dark-mode ordinal ramp (one hue,
// monotone lightness, visible steps, low end at 2.15:1 against the panel).
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const BIN_EDGES = [0, 20, 40, 60, 80];
const RAMP = BIN_EDGES.map((_, i) => {
  const t = 0.45 + (i / (BIN_EDGES.length - 1)) * 0.55;
  const [s, o] = [hexRgb(c.panel), hexRgb(c.busy)];
  return `rgb(${s.map((v, k) => Math.round(v + (o[k] - v) * t)).join(",")})`;
});
const heat = (v) => RAMP[Math.max(0, BIN_EDGES.findLastIndex((edge) => v >= edge))];

const avgOf = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);

function Heatmap({ week }) {
  const [hover, setHover] = useState(null);
  const [asTable, setAsTable] = useState(false);

  if (asTable) {
    return (
      <div className="an-stack">
        <div className="sws-table-scroll">
          <table className="an-table">
            <caption className="sws-sr-only">Average occupancy percent by day and hour</caption>
            <thead>
              <tr>
                <th scope="col" className="sws-th">Day</th>
                {HOURS.map((h) => <th key={h} scope="col" className="sws-th">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((d) => (
                <tr key={d}>
                  <th scope="row">{d}</th>
                  {week[d].map((v, h) => <td key={h} className="sws-mono">{v}%</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div><Button size="sm" onClick={() => setAsTable(false)}>Show as heatmap</Button></div>
      </div>
    );
  }

  return (
    <div className="an-stack">
      <div
        className="an-heat"
        role="img"
        aria-label="Heatmap of average occupancy by day and hour. Use Show as table for the numbers."
        onMouseLeave={() => setHover(null)}
      >
        <div />
        {HOURS.map((h, i) => (
          <div key={h} className={`an-hour${i % 2 ? " is-odd" : ""}${hover?.h === i ? " is-on" : ""}`}>{h}</div>
        ))}
        {DAYS.map((d, di) => [
          <div key={d} className={`an-day${hover?.d === di ? " is-on" : ""}`}>{d}</div>,
          ...week[d].map((v, h) => (
            <div
              key={`${d}-${h}`}
              className={`an-cell${hover?.d === di && hover?.h === h ? " is-on" : ""}`}
              style={{ background: heat(v) }}
              onMouseEnter={() => setHover({ d: di, h, v })}
            />
          )),
        ])}
      </div>

      <div className="an-heat-foot">
        <div className="an-legend">
          <span className="sws-mono">0%</span>
          <span aria-hidden="true" className="an-legend-ramp">
            {RAMP.map((col, i) => <span key={i} style={{ background: col }} />)}
          </span>
          <span className="sws-mono">100%</span>
          <span className="sws-sr-only">Five bins of 20 percentage points, darker for emptier and brighter red for fuller.</span>
        </div>
        <div className="an-heat-actions">
          <div aria-live="polite" className={`an-readout${hover ? " is-on" : ""}`}>
            {hover ? <>{DAYS[hover.d]} {HOURS_LONG[hover.h]} <span className="sws-mono">{hover.v}% full</span></> : "Hover a cell for its value"}
          </div>
          <Button size="sm" onClick={() => setAsTable(true)}>Show as table</Button>
        </div>
      </div>
    </div>
  );
}

const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function LiveChart({ live }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const [box, W] = useWidth();
  const narrow = W > 0 && W < 520;
  const H = narrow ? 180 : 220;
  const PAD_L = 40, PAD_R = 48, PAD_T = 12, PAD_B = 26;
  const t0 = live[0].t;
  const t1 = live[live.length - 1].t;
  const span = Math.max(1, t1 - t0);
  const x = (t) => PAD_L + ((t - t0) / span) * (W - PAD_L - PAD_R);
  const y = (pct) => PAD_T + (1 - pct / 100) * (H - PAD_T - PAD_B);
  const path = live.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.pct).toFixed(1)}`).join(" ");
  const area = `${path} L${x(t1).toFixed(1)},${y(0)} L${x(t0).toFixed(1)},${y(0)} Z`;
  const last = live[live.length - 1];
  const shown = hoverIdx === null ? null : live[hoverIdx];
  const ticks = narrow ? [t0, t1] : [t0, t0 + span / 2, t1];

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const t = t0 + ((e.clientX - rect.left - PAD_L) / (W - PAD_L - PAD_R)) * span;
    let best = 0;
    live.forEach((p, i) => { if (Math.abs(p.t - t) < Math.abs(live[best].t - t)) best = i; });
    setHoverIdx(best);
  };

  return (
    <div ref={box} className="an-live">
      {W > 0 && (
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="an-svg"
          role="img"
          aria-label={`Occupancy over the last ${live.length} readings, from ${fmtTime(t0)} to ${fmtTime(t1)}. Latest ${last.pct}% full.`}
          onMouseMove={onMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {[0, 50, 100].map((v) => (
            <g key={v}>
              <line className={v === 0 ? "an-axis" : "an-grid"} x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} />
              <text className="an-tick" x={PAD_L - 8} y={y(v) + 3.5} textAnchor="end">{v}%</text>
            </g>
          ))}
          {ticks.map((t, i) => (
            <text key={i} className="an-tick" x={x(t)} y={H - 8} textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}>{fmtTime(t)}</text>
          ))}
          <path className="an-area" d={area} />
          <path className="an-line" d={path} />
          {/* Latest point, direct-labelled in text ink, not the line colour. */}
          <circle className="an-dot" cx={x(last.t)} cy={y(last.pct)} r="4.5" />
          <text className="an-end" x={x(last.t) + 9} y={y(last.pct) + 4}>{last.pct}%</text>
          {shown && (
            <g pointerEvents="none">
              <line className="an-cross" x1={x(shown.t)} x2={x(shown.t)} y1={PAD_T} y2={y(0)} />
              <circle className="an-dot" cx={x(shown.t)} cy={y(shown.pct)} r="4.5" />
            </g>
          )}
        </svg>
      )}
      {shown && W > 0 && (
        <div
          role="status"
          className="an-tip"
          style={{ left: x(shown.t), transform: `translateX(${x(shown.t) > W * 0.7 ? "calc(-100% - 10px)" : "10px"})` }}
        >
          <span>{fmtTime(shown.t)}</span>
          <span className="sws-mono">{shown.pct}% full</span>
        </div>
      )}
    </div>
  );
}

function Analytics() {
  const [week, setWeek] = useState(null);
  const [live, setLive] = useState([]);
  const [units, setUnits] = useState({});
  const [loaded, setLoaded] = useState(false);
  const { mode } = useOutletContext();

  useEffect(() => {
    const stopWeek = onValue(ref(database, dataPath("history/week")), (s) => { setWeek(s.val()); setLoaded(true); }, () => setLoaded(true));
    const stopLive = onValue(query(ref(database, dataPath("history/live")), limitToLast(60)), (s) => {
      setLive(Object.values(s.val() || {}).filter((p) => typeof p?.t === "number").sort((a, b) => a.t - b.t));
    }, () => {});
    const stopUnits = onValue(ref(database, dataPath("units")), (s) => setUnits(s.val() || {}));
    return () => { stopWeek(); stopLive(); stopUnits(); };
  }, []);

  // Right now comes straight from the curbs, not from the last history point.
  const reporting = Object.values(units).filter((u) => u.online);
  const nowPct = reporting.length ? Math.round((reporting.filter((u) => u.occupied).length / reporting.length) * 100) : null;

  const hasWeek = !!week && DAYS.every((d) => Array.isArray(week[d]) && week[d].length === HOURS.length);
  let insight = null;
  let avg = null, peakHour = "—", busiestDay = "—";
  if (hasWeek) {
    avg = Math.round(avgOf(DAYS.flatMap((d) => week[d])));
    const hourAvg = HOURS.map((_, h) => avgOf(DAYS.map((d) => week[d][h])));
    const peakIdx = hourAvg.indexOf(Math.max(...hourAvg));
    peakHour = HOURS_LONG[peakIdx];
    const dayAvg = DAYS.map((d) => avgOf(week[d]));
    busiestDay = DAYS[dayAvg.indexOf(Math.max(...dayAvg))];
    const weekdayAvg = Math.round(avgOf(DAYS.slice(0, 5).flatMap((d) => week[d])));
    const weekendAvg = Math.round(avgOf(["Sat", "Sun"].flatMap((d) => week[d])));
    const weekendPeak = Math.max(...week.Sat, ...week.Sun);
    insight = `Busiest around ${peakHour}, averaging ${Math.round(hourAvg[peakIdx])}% full. Weekdays average ${weekdayAvg}% and weekends ${weekendAvg}%.`;
    if (weekendPeak < 60) insight += ` Weekends never pass ${weekendPeak}% full, so permit-only lots could open to visitors on Saturdays and Sundays.`;
  }

  return (
    <>
      <PageHeader title="Analytics" subtitle={mode === "sim" ? "Occupancy trends across all simulated lots" : "Occupancy trends across all lots"} />

      <div className="sws-page-body an-body">
        <section className="an-summary sws-enter" aria-label="Summary">
          <div className="an-hero" title="Share of reporting curbs that are occupied">
            <span className="an-hero-n">{nowPct === null ? "—" : `${nowPct}%`}</span>
            <span className="an-hero-l">
              <StallMark status="occupied" swatch />
              {nowPct === null ? "no curbs reporting" : "full right now"}
            </span>
          </div>
          <dl className="an-facts">
            <div><dt>Average occupancy</dt><dd className="sws-mono">{avg === null ? "—" : `${avg}%`}</dd>{avg !== null && <span>past week</span>}</div>
            <div><dt>Peak hour</dt><dd className="sws-mono">{peakHour}</dd>{hasWeek && <span>all week</span>}</div>
            <div><dt>Busiest day</dt><dd className="sws-mono">{busiestDay}</dd></div>
          </dl>
        </section>

        {loaded && !hasWeek && live.length === 0 ? (
          <div className="an-panel sws-enter" style={{ "--d": "60ms" }}>
            <EmptyState icon="analytics" title="No history recorded yet">
              {mode === "sim"
                ? "Load fresh simulated data or start the simulation on the Simulation page, and trends appear here."
                : "Nothing records real-curb history yet, so trends can't be shown. The live occupancy above still comes from the curbs. Switch to Simulation to see how this page looks with a week of data."}
            </EmptyState>
          </div>
        ) : (
          <>
            {hasWeek && (
              <section className="an-section sws-enter" style={{ "--d": "60ms" }} aria-labelledby="an-heat-h">
                <h2 id="an-heat-h" className="an-h2">Average occupancy by day and hour</h2>
                <p className="an-sub">{insight}</p>
                <div className="an-panel"><Heatmap week={week} /></div>
              </section>
            )}

            <section className="an-section sws-enter" style={{ "--d": "120ms" }} aria-labelledby="an-live-h">
              <div className="an-head">
                <h2 id="an-live-h" className="an-h2">Live occupancy</h2>
                {live.length > 0 && <span className="an-meta">Last {live.length} readings</span>}
              </div>
              <div className="an-panel">
                {live.length < 2 ? (
                  <div className="sws-note">Collecting readings. A new point appears every few seconds while the simulation runs.</div>
                ) : (
                  <LiveChart live={live} />
                )}
              </div>
            </section>
          </>
        )}

        {/* Shown whether or not there is occupancy history. */}
        <LatencySection mode={mode} delay={180} />
      </div>
    </>
  );
}

export default Analytics;

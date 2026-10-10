import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { ref, onValue, query, limitToLast } from "firebase/database";
import { database } from "../firebase";
import { dataPath } from "../dataMode";
import { c, mono } from "../theme";
import { PageHeader, Card, StatTile, EmptyState, Button } from "../components/ui";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = ["7a", "8a", "9a", "10a", "11a", "12p", "1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p"];
const HOURS_LONG = ["7 AM", "8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM", "6 PM", "7 PM", "8 PM"];

// Sequential ramp: one hue (occupancy orange), dark to bright on the dark surface,
// in 7 bins of 15 points so a cell's colour reads as a range, not an exact value.
const HEAT_HUE = [242, 105, 76];
const SURFACE = [23, 23, 20];
const BIN_EDGES = [0, 15, 30, 45, 60, 75, 90];
const RAMP = BIN_EDGES.map((_, i) => {
  const t = 0.1 + (i / (BIN_EDGES.length - 1)) * 0.9;
  const mix = SURFACE.map((s, k) => Math.round(s + (HEAT_HUE[k] - s) * t));
  return `rgb(${mix.join(",")})`;
});
const heat = (v) => RAMP[Math.max(0, BIN_EDGES.findLastIndex((edge) => v >= edge))];

const avgOf = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);

function Heatmap({ week }) {
  const [hover, setHover] = useState(null);
  const [asTable, setAsTable] = useState(false);

  if (asTable) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="sws-table-scroll">
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5, minWidth: 640 }}>
            <caption className="sws-sr-only">Average occupancy percent by day and hour</caption>
            <thead>
              <tr>
                <th scope="col" className="sws-th" style={{ textAlign: "left", padding: "6px 8px" }}>Day</th>
                {HOURS.map((h) => <th key={h} scope="col" className="sws-th" style={{ padding: "6px 4px", textAlign: "right" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((d) => (
                <tr key={d} style={{ borderTop: `1px solid ${c.line}` }}>
                  <th scope="row" style={{ textAlign: "left", padding: "6px 8px", color: c.dim, fontWeight: 600 }}>{d}</th>
                  {week[d].map((v, h) => <td key={h} className="sws-mono" style={{ textAlign: "right", padding: "6px 4px" }}>{v}%</td>)}
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
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="sws-table-scroll">
        <div
          className="sws-heatmap"
          role="img"
          aria-label="Heatmap of average occupancy by day and hour. Use Show as table for the numbers."
          style={{ display: "grid", gridTemplateColumns: "40px repeat(14, minmax(22px, 1fr))", gap: 3, minWidth: 520, position: "relative" }}
          onMouseLeave={() => setHover(null)}
        >
          <div />
          {HOURS.map((h, i) => (
            <div key={h} style={{ fontSize: 10.5, color: hover?.h === i ? c.text : c.dim, textAlign: "center", paddingBottom: 2 }}>{h}</div>
          ))}
          {DAYS.map((d, di) => [
            <div key={d} style={{ fontSize: 11.5, fontWeight: 600, color: hover?.d === di ? c.text : c.dim, display: "flex", alignItems: "center" }}>{d}</div>,
            ...week[d].map((v, h) => {
              const active = hover?.d === di && hover?.h === h;
              return (
                <div
                  key={`${d}-${h}`}
                  onMouseEnter={() => setHover({ d: di, h, v })}
                  style={{
                    height: 30, borderRadius: 3, background: heat(v), cursor: "default",
                    boxShadow: active ? `0 0 0 2px ${c.panel}, 0 0 0 3px ${c.text}` : "none",
                    position: "relative", zIndex: active ? 1 : 0,
                  }}
                />
              );
            }),
          ])}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11.5, color: c.dim }}>Less full</span>
          <div aria-hidden="true" style={{ display: "flex", gap: 2 }}>
            {RAMP.map((col, i) => <span key={i} style={{ width: 22, height: 10, borderRadius: 2, background: col }} />)}
          </div>
          <span style={{ fontSize: 11.5, color: c.dim }}>More full</span>
          <span className="sws-sr-only">Seven bins of 15 percentage points, from 0 to 100 percent.</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div aria-live="polite" style={{ fontSize: 12.5, minWidth: 150, textAlign: "right", color: hover ? c.text : c.dim }}>
            {hover ? <><span style={{ color: c.dim }}>{DAYS[hover.d]} {HOURS_LONG[hover.h]}:</span> <span className="sws-mono" style={{ fontWeight: 600 }}>{hover.v}% full</span></> : "Hover a cell for its value"}
          </div>
          <Button size="sm" onClick={() => setAsTable(true)}>Show as table</Button>
        </div>
      </div>
    </div>
  );
}

const W = 1000, H = 230, PAD_L = 44, PAD_R = 52, PAD_T = 12, PAD_B = 26;
const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function LiveChart({ live }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);
  const t0 = live[0].t;
  const t1 = live[live.length - 1].t;
  const span = Math.max(1, t1 - t0);
  const x = (t) => PAD_L + ((t - t0) / span) * (W - PAD_L - PAD_R);
  const y = (pct) => PAD_T + (1 - pct / 100) * (H - PAD_T - PAD_B);
  const path = live.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.pct).toFixed(1)}`).join(" ");
  const area = `${path} L${x(t1).toFixed(1)},${y(0)} L${x(t0).toFixed(1)},${y(0)} Z`;
  const last = live[live.length - 1];
  const shown = hoverIdx === null ? null : live[hoverIdx];

  const onMove = (e) => {
    const box = svgRef.current.getBoundingClientRect();
    const sx = ((e.clientX - box.left) / box.width) * W;
    const t = t0 + ((sx - PAD_L) / (W - PAD_L - PAD_R)) * span;
    let best = 0;
    live.forEach((p, i) => { if (Math.abs(p.t - t) < Math.abs(live[best].t - t)) best = i; });
    setHoverIdx(best);
  };

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block", touchAction: "pan-y" }}
        role="img"
        aria-label={`Occupancy over the last ${live.length} readings, from ${fmtTime(t0)} to ${fmtTime(t1)}. Latest ${last.pct}% full.`}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="sws-live-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={c.accent} stopOpacity="0.16" />
            <stop offset="1" stopColor={c.accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} stroke={v === 0 ? c.lineStrong : c.line} strokeWidth="1" />
            <text x={PAD_L - 8} y={y(v) + 3.5} fill={c.dim} fontSize="10" fontFamily={mono} textAnchor="end">{v}%</text>
          </g>
        ))}
        {[t0, t0 + span / 2, t1].map((t, i) => (
          <text key={i} x={x(t)} y={H - 8} fill={c.dim} fontSize="10" fontFamily={mono} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}>{fmtTime(t)}</text>
        ))}
        <path d={area} fill="url(#sws-live-fill)" />
        <path d={path} fill="none" stroke={c.accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {/* Latest point, direct-labelled */}
        <circle cx={x(last.t)} cy={y(last.pct)} r="4.5" fill={c.accent} stroke={c.panel} strokeWidth="2" />
        <text x={x(last.t) + 9} y={y(last.pct) + 4} fill={c.text} fontSize="11.5" fontWeight="600" fontFamily={mono}>{last.pct}%</text>
        {shown && (
          <g pointerEvents="none">
            <line x1={x(shown.t)} x2={x(shown.t)} y1={PAD_T} y2={y(0)} stroke={c.dim} strokeWidth="1" />
            <circle cx={x(shown.t)} cy={y(shown.pct)} r="4.5" fill={c.accent} stroke={c.panel} strokeWidth="2" />
          </g>
        )}
      </svg>
      {shown && (
        <div
          role="status"
          style={{
            position: "absolute", top: 4, pointerEvents: "none",
            left: `${(x(shown.t) / W) * 100}%`, transform: `translateX(${x(shown.t) > W * 0.7 ? "calc(-100% - 10px)" : "10px"})`,
            background: c.card, border: `1px solid ${c.lineStrong}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, whiteSpace: "nowrap",
            boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ color: c.dim }}>{fmtTime(shown.t)}</div>
          <div className="sws-mono" style={{ fontWeight: 600, color: c.text }}>{shown.pct}% full</div>
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

      <div className="sws-page-body">
        <div className="sws-tiles">
          <StatTile label="Right now" value={nowPct === null ? "—" : `${nowPct}%`} sub={nowPct === null ? "no curbs reporting" : "full"} title="Share of reporting curbs that are occupied" />
          <StatTile animate={false} label="Average occupancy" value={avg === null ? "—" : `${avg}%`} sub="past week" />
          <StatTile animate={false} label="Peak hour" value={peakHour} sub={hasWeek ? "all week" : null} />
          <StatTile animate={false} label="Busiest day" value={busiestDay} />
        </div>

        {loaded && !hasWeek && live.length === 0 ? (
          <Card>
            <EmptyState icon="analytics" title="No history recorded yet">
              {mode === "sim"
                ? "Load fresh simulated data or start the simulation on the Simulation page, and trends appear here."
                : "Nothing records real-curb history yet, so trends can't be shown. The live occupancy above still comes from the curbs. Switch to Simulation to see how this page looks with a week of data."}
            </EmptyState>
          </Card>
        ) : (
          <>
            {hasWeek && (
              <Card title="Average occupancy by day and hour" subtitle={insight}>
                <Heatmap week={week} />
              </Card>
            )}

            <Card title="Live occupancy" meta={live.length ? `last ${live.length} readings` : null}>
              {live.length < 2 ? (
                <div className="sws-note">Collecting readings. A new point appears every few seconds while the simulation runs.</div>
              ) : (
                <LiveChart live={live} />
              )}
            </Card>
          </>
        )}
      </div>
    </>
  );
}

export default Analytics;

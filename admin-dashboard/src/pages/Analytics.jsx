import { useEffect, useState } from "react";
import { ref, onValue, query, limitToLast } from "firebase/database";
import { database } from "../firebase";
import { dataPath } from "../dataMode";
import { c, mono } from "../theme";
import { PageHeader, Card, StatTile, EmptyState } from "../components/ui";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = ["7a", "8a", "9a", "10a", "11a", "12p", "1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p"];

function heat(v) {
  if (v >= 90) return "#C4482B";
  if (v >= 75) return "#97482A";
  if (v >= 60) return "#6F4B22";
  if (v >= 45) return "#4C4620";
  if (v >= 30) return "#283220";
  if (v >= 15) return "#1F2419";
  return "#191915";
}

function Analytics() {
  const [week, setWeek] = useState(null);
  const [live, setLive] = useState([]);

  useEffect(() => {
    const stopWeek = onValue(ref(database, dataPath("history/week")), (s) => setWeek(s.val()));
    const stopLive = onValue(query(ref(database, dataPath("history/live")), limitToLast(60)), (s) => {
      setLive(Object.values(s.val() || {}).sort((a, b) => a.t - b.t));
    });
    return () => { stopWeek(); stopLive(); };
  }, []);

  const hasWeek = !!week && DAYS.every((d) => Array.isArray(week[d]));
  let avg = 0;
  let peakHour = "—";
  let busiestDay = "—";
  let weekendPeak = 0;
  if (hasWeek) {
    const all = DAYS.flatMap((d) => week[d]);
    avg = Math.round(all.reduce((s, v) => s + v, 0) / all.length);
    const hourAvg = HOURS.map((_, h) => DAYS.reduce((s, d) => s + week[d][h], 0) / DAYS.length);
    peakHour = HOURS[hourAvg.indexOf(Math.max(...hourAvg))];
    const dayAvg = DAYS.map((d) => week[d].reduce((s, v) => s + v, 0) / week[d].length);
    busiestDay = DAYS[dayAvg.indexOf(Math.max(...dayAvg))];
    weekendPeak = Math.max(...week.Sat, ...week.Sun);
  }

  const latest = live.length ? live[live.length - 1].pct : null;
  const W = 640, H = 170, padL = 36, padR = 12, padY = 14;
  const toY = (pct) => H - padY - (pct / 100) * (H - padY * 2);
  const pts = live.map((p, i) => {
    const x = padL + (live.length === 1 ? 0 : (i / (live.length - 1)) * (W - padL - padR));
    return `${x},${toY(p.pct)}`;
  });

  return (
    <>
      <PageHeader title="Analytics" subtitle="Occupancy trends across all lots" />

      <div className="sws-page-body">
        {!hasWeek && live.length === 0 ? (
          <Card>
            <EmptyState icon="analytics" title="No history yet">
              Occupancy is recorded as curbs report in, and charts will appear here once there's data.
            </EmptyState>
          </Card>
        ) : (
          <>
            <div className="sws-tiles">
              <StatTile animate={false} label="Average occupancy" value={hasWeek ? `${avg}%` : "—"} sub="past week" />
              <StatTile animate={false} label="Peak hour" value={peakHour} sub="all week" />
              <StatTile animate={false} label="Busiest day" value={busiestDay} />
              <StatTile animate={false} label="Right now" value={latest === null ? "—" : `${latest}%`} sub="full" />
            </div>

            {hasWeek && (
              <Card title="Average occupancy by day and hour">
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="sws-heatmap" style={{ display: "grid", gridTemplateColumns: "44px repeat(14, minmax(0, 1fr))", gap: 4 }}>
                  <div />
                  {HOURS.map((h) => <div key={h} style={{ fontSize: 10.5, color: c.dim, textAlign: "center" }}>{h}</div>)}
                  {DAYS.map((d) => [
                    <div key={d} style={{ fontSize: 11.5, fontWeight: 600, color: c.dim, display: "flex", alignItems: "center" }}>{d}</div>,
                    ...week[d].map((v, h) => (
                      <div key={`${d}-${h}`} title={`${d} ${HOURS[h]}: ${v}% full`} style={{ height: 30, borderRadius: 3, background: heat(v), display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontSize: 10.5, color: v >= 60 ? "#F2F1EA" : c.dim }}>
                        {v}
                      </div>
                    )),
                  ])}
                </div>
                <div className="sws-note">
                  Busiest around {peakHour}. Weekends never pass {weekendPeak}% full, so permit-only lots could open to visitors on Saturdays and Sundays.
                </div>
                </div>
              </Card>
            )}

            <Card title="Live occupancy" meta={`${live.length} readings`}>
              {live.length < 2 ? (
                <div className="sws-note">Collecting readings. A new point appears every few seconds while data is coming in.</div>
              ) : (
                <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
                  {[0, 50, 100].map((v) => (
                    <g key={v}>
                      <line x1={padL} x2={W - padR} y1={toY(v)} y2={toY(v)} stroke={c.line} strokeWidth="1" />
                      <text x={2} y={toY(v) + 4} fill={c.dim} fontSize="10" fontFamily="IBM Plex Mono, monospace">{v}%</text>
                    </g>
                  ))}
                  <polyline points={pts.join(" ")} fill="none" stroke={c.accent} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                  {pts.length > 0 && (() => {
                    const [x, y] = pts[pts.length - 1].split(",");
                    return <circle cx={x} cy={y} r="4.5" fill={c.accent} />;
                  })()}
                </svg>
              )}
            </Card>
          </>
        )}
      </div>
    </>
  );
}

export default Analytics;
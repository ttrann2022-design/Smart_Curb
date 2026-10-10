import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { database, dataPath } from "../firebase";
import { c, mono } from "../theme";
import AnimatedNumber from "../components/AnimatedNumber";
import { useFlash } from "../motion";
import { useAlertSettings, useNow, unitIssues, formatAgo } from "../units";

function Tile({ label, value, sub, color }) {
  const flash = useFlash(value);
  return (
    <div className={flash ? "sws-flash" : ""} style={{ flex: 1, background: c.panel, border: `1px solid ${c.line}`, borderRadius: 6, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: c.dim }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: mono, fontSize: 28, fontWeight: 600, color: color || c.text }}><AnimatedNumber value={value} /></span>
        {sub && <span style={{ fontSize: 12.5, color: c.dim }}>{sub}</span>}
      </div>
    </div>
  );
}

function LotRow({ lot, stats }) {
  const fill = stats.total ? Math.round(((stats.total - stats.open) / stats.total) * 100) : 0;
  const tone = fill >= 90 ? c.busy : fill >= 70 ? c.warn : c.open;
  const flash = useFlash(stats.open);
  return (
    <div className={`sws-hover${flash ? " sws-flash" : ""}`} style={{ border: `1px solid ${c.line}`, borderRadius: 5, padding: "11px 13px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{lot.name}</span>
        <span style={{ fontSize: 12, color: c.dim }}><AnimatedNumber value={stats.open} /> of {stats.total} open</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: c.line, overflow: "hidden" }}>
        <div style={{ width: `${fill}%`, height: 6, background: tone, transition: "width 0.6s ease, background-color 0.6s ease" }} />
      </div>
    </div>
  );
}

function Overview() {
  const [lots, setLots] = useState({});
  const [units, setUnits] = useState({});
  const [loading, setLoading] = useState(true);
  const alertSettings = useAlertSettings();
  const now = useNow();

  useEffect(() => {
    const stopLots = onValue(ref(database, dataPath("lots")), (snap) => {
      setLots(snap.val() || {});
      setLoading(false);
    });
    const stopUnits = onValue(ref(database, dataPath("units")), (snap) => setUnits(snap.val() || {}));
    return () => { stopLots(); stopUnits(); };
  }, []);

  const unitList = Object.values(units);
  const stats = {};
  Object.keys(lots).forEach((id) => { stats[id] = { total: 0, open: 0 }; });
  unitList.forEach((u) => {
    if (!stats[u.lot]) return;
    stats[u.lot].total += 1;
    if (u.online && !u.occupied) stats[u.lot].open += 1;
  });

  const total = unitList.length;
  const open = unitList.filter((u) => u.online && !u.occupied).length;
  const occupied = unitList.filter((u) => u.online && u.occupied).length;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  const alerts = Object.entries(units)
    .map(([id, u]) => [id, u, unitIssues(u, alertSettings, now)[0]])
    .filter(([, , issue]) => issue);

  return (
    <>
      <div className="sws-page-head" style={{ height: 68, flexShrink: 0, background: c.panel, borderBottom: `1px solid ${c.line}`, padding: "0 30px", display: "flex", alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 19, fontWeight: 600 }}>Overview</div>
          <div style={{ fontSize: 12.5, color: c.dim }}><span className="sws-live-dot" />Live data from Firebase</div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 30, color: c.dim }}>Loading live data…</div>
      ) : (
        <div className="sws-page-body" style={{ padding: "22px 30px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="sws-enter sws-tiles" style={{ display: "flex", gap: 14 }}>
            <Tile label="TOTAL SPOTS MONITORED" value={total} />
            <Tile label="AVAILABLE NOW" value={open} sub={`${pct(open)}%`} color={c.open} />
            <Tile label="OCCUPIED" value={occupied} sub={`${pct(occupied)}%`} color={c.busy} />
            <Tile label="NEEDS ATTENTION" value={alerts.length} sub={`of ${total} units`} color={c.warn} />
          </div>

          <div className="sws-stack" style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            <div className="sws-enter" style={{ flex: 2, background: c.panel, border: `1px solid ${c.line}`, borderRadius: 6, "--d": "80ms" }}>
              <div style={{ padding: "14px 18px", borderBottom: `1px solid ${c.line}`, fontFamily: mono, fontSize: 14, fontWeight: 600 }}>Parking lots</div>
              <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                {Object.entries(lots).map(([id, lot]) => (
                  <LotRow key={id} lot={lot} stats={stats[id] || { total: 0, open: 0 }} />
                ))}
              </div>
            </div>

            <div className="sws-enter" style={{ flex: 1, background: c.panel, border: `1px solid ${c.line}`, borderRadius: 6, "--d": "160ms" }}>
              <div style={{ padding: "14px 18px", borderBottom: `1px solid ${c.line}`, fontFamily: mono, fontSize: 14, fontWeight: 600 }}>Active alerts</div>
              <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 9 }}>
                {alerts.length === 0 && <div style={{ fontSize: 12.5, color: c.dim }}>All units healthy.</div>}
                {alerts.map(([id, u, issue]) => {
                  const offline = issue === "offline";
                  const lotName = lots[u.lot]?.name || u.lot;
                  const title = { offline: "Unit offline", stale: "No recent report", lowBattery: "Low battery" }[issue];
                  const text = {
                    offline: `Curb ${id} in ${lotName} is not reporting.`,
                    stale: `Curb ${id} in ${lotName} last reported ${formatAgo(u.lastUpdated, now)}.`,
                    lowBattery: `Curb ${id} in ${lotName} is at ${u.battery}%.`,
                  }[issue];
                  return (
                    <div key={id} className="sws-enter" style={{ borderRadius: 5, padding: "11px 12px", background: offline ? "#221410" : "#26200F", border: `1px solid ${offline ? "#4A2A20" : "#4A3A1C"}` }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: offline ? "#FF8F74" : "#FFC078" }}>{title}</div>
                      <div style={{ fontSize: 12, marginTop: 4 }}>{text}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Overview;
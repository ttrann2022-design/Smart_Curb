import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";
import { dataPath } from "../dataMode";
import { c, mono } from "../theme";
import { useAlertSettings, useNow, hasBattery, isLowBattery, unitIssues, cleanText, formatAgo, formatExact } from "../units";

const ledHex = { red: "#E5483A", blue: "#3B7DD8", green: "#35A96B", gold: "#E0A63C", white: "#E8E6DE" };

const filters = [
  { id: "all", label: "All units" },
  { id: "attention", label: "Needs attention" },
  { id: "offline", label: "Offline" },
  { id: "lowbattery", label: "Low battery" },
  { id: "open", label: "Open spots" },
];

const columns = "100px 1.5fr 1fr 1.3fr 1fr 0.9fr 1.1fr";

function statusOf(u) {
  if (!u.online) return { label: "Offline", color: c.dim };
  if (u.occupied) return { label: "Occupied", color: c.busy };
  return { label: "Open", color: c.open };
}

function batteryColor(b, alerts) {
  if (b < alerts.lowBattery) return c.busy;
  if (b < 50) return c.warn;
  return c.open;
}

function Units() {
  const [lots, setLots] = useState({});
  const [units, setUnits] = useState({});
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const alerts = useAlertSettings();
  const now = useNow();

  useEffect(() => {
    const stopLots = onValue(ref(database, dataPath("lots")), (snap) => setLots(snap.val() || {}));
    const stopUnits = onValue(ref(database, dataPath("units")), (snap) => setUnits(snap.val() || {}));
    return () => { stopLots(); stopUnits(); };
  }, []);

  const allUnits = Object.entries(units);
  const rows = allUnits
    .filter(([id, u]) => {
      if (search && !id.toLowerCase().includes(search.toLowerCase())) return false;
      if (filter === "attention") return unitIssues(u, alerts, now).length > 0;
      if (filter === "offline") return !u.online;
      if (filter === "lowbattery") return isLowBattery(u, alerts);
      if (filter === "open") return u.online && !u.occupied;
      return true;
    })
    .sort(([a], [b]) => a.localeCompare(b));

  const headerCell = { fontSize: 11, fontWeight: 700, letterSpacing: 0.7, color: c.dim };

  return (
    <>
      <div className="sws-page-head" style={{ height: 68, flexShrink: 0, background: c.panel, borderBottom: `1px solid ${c.line}`, padding: "0 30px", display: "flex", alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 19, fontWeight: 600 }}>Curb units</div>
          <div style={{ fontSize: 12.5, color: c.dim }}>Every unit across every lot, live from Firebase</div>
        </div>
      </div>

      <div className="sws-page-body" style={{ padding: "22px 30px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {filters.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                style={{
                  height: 32, padding: "0 13px", borderRadius: 5, cursor: "pointer", fontSize: 12.5, fontWeight: 600,
                  border: `1px solid ${filter === f.id ? c.accent : c.line}`,
                  background: filter === f.id ? c.navBg : c.panel,
                  color: filter === f.id ? c.accent : c.text,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search unit ID"
            style={{ height: 34, width: 220, padding: "0 12px", borderRadius: 5, border: `1px solid ${c.line}`, background: c.panel, color: c.text, fontSize: 13 }}
          />
        </div>

        <div style={{ background: c.panel, border: `1px solid ${c.line}`, borderRadius: 6, overflow: "hidden" }} className="sws-table">
          <div style={{ padding: "12px 18px", borderBottom: `1px solid ${c.line}`, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontFamily: mono, fontSize: 14, fontWeight: 600 }}>Units</span>
            <span style={{ fontSize: 12, color: c.dim }}>{rows.length} of {allUnits.length} units</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: columns, gap: 12, padding: "10px 18px", borderBottom: `1px solid ${c.line}`, background: "#1A1A17" }}>
            <div style={headerCell}>UNIT</div>
            <div style={headerCell}>LOT</div>
            <div style={headerCell}>STATUS</div>
            <div style={headerCell}>BATTERY</div>
            <div style={headerCell}>LAST CHANGE</div>
            <div style={headerCell}>LED</div>
            <div style={headerCell}>PANEL TEXT</div>
          </div>

          {rows.length === 0 && (
            <div style={{ padding: 18, fontSize: 12.5, color: c.dim }}>No units match this filter.</div>
          )}

          {rows.map(([id, u]) => {
            const status = statusOf(u);
            const led = cleanText(u.ledColor);
            const ago = formatAgo(u.lastUpdated, now);
            return (
              <div key={id} style={{ display: "grid", gridTemplateColumns: columns, gap: 12, alignItems: "center", padding: "12px 18px", borderBottom: `1px solid ${c.line}` }}>
                <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 700 }}>{id}</div>
                <div style={{ fontSize: 13 }}>{lots[u.lot]?.name || u.lot}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: status.color, display: "inline-block" }} />
                  {status.label}
                </div>
                {hasBattery(u) ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <div style={{ width: 70, height: 6, borderRadius: 3, background: c.line, overflow: "hidden" }}>
                      <div style={{ width: `${u.battery}%`, height: 6, background: batteryColor(u.battery, alerts) }} />
                    </div>
                    <span style={{ fontFamily: mono, fontSize: 12.5, color: batteryColor(u.battery, alerts) }}>{u.battery}%</span>
                  </div>
                ) : (
                  <span style={{ fontSize: 12.5, color: c.dim }}>Not measured</span>
                )}
                <div title={formatExact(u.lastUpdated)} style={{ fontSize: 12.5, color: ago ? c.text : c.dim }}>
                  {ago || "—"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13 }}>
                  {led ? (
                    <>
                      <span style={{ width: 12, height: 12, borderRadius: 3, background: ledHex[led] || c.dim, display: "inline-block" }} />
                      {led}
                    </>
                  ) : (
                    <span style={{ color: c.dim }}>not set</span>
                  )}
                </div>
                <div style={{ fontFamily: mono, fontSize: 12.5, color: u.panelText ? c.text : c.dim }}>
                  {u.panelText || "not set"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default Units;
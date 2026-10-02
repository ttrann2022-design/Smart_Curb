import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { database, dataPath } from "../firebase";
import { c, mono } from "../theme";

const ledHex = { red: "#E5483A", blue: "#3B7DD8", green: "#35A96B", gold: "#E0A63C", white: "#E8E6DE" };

const filters = [
  { id: "all", label: "All units" },
  { id: "attention", label: "Needs attention" },
  { id: "offline", label: "Offline" },
  { id: "lowbattery", label: "Low battery" },
  { id: "open", label: "Open spots" },
];

const columns = "110px 1.6fr 1fr 1.4fr 1fr 1.2fr";

function statusOf(u) {
  if (!u.online) return { label: "Offline", color: c.dim };
  if (u.occupied) return { label: "Occupied", color: c.busy };
  return { label: "Open", color: c.open };
}

function batteryColor(b) {
  if (b < 20) return c.busy;
  if (b < 50) return c.warn;
  return c.open;
}

function Units() {
  const [lots, setLots] = useState({});
  const [units, setUnits] = useState({});
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const stopLots = onValue(ref(database, dataPath("lots")), (snap) => setLots(snap.val() || {}));
    const stopUnits = onValue(ref(database, dataPath("units")), (snap) => setUnits(snap.val() || {}));
    return () => { stopLots(); stopUnits(); };
  }, []);

  const allUnits = Object.entries(units);
  const rows = allUnits
    .filter(([id, u]) => {
      if (search && !id.toLowerCase().includes(search.toLowerCase())) return false;
      if (filter === "attention") return !u.online || u.battery < 20;
      if (filter === "offline") return !u.online;
      if (filter === "lowbattery") return u.battery < 20;
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
            <div style={headerCell}>LED</div>
            <div style={headerCell}>PANEL TEXT</div>
          </div>

          {rows.length === 0 && (
            <div style={{ padding: 18, fontSize: 12.5, color: c.dim }}>No units match this filter.</div>
          )}

          {rows.map(([id, u]) => {
            const status = statusOf(u);
            const battery = u.battery ?? 0;
            return (
              <div key={id} style={{ display: "grid", gridTemplateColumns: columns, gap: 12, alignItems: "center", padding: "12px 18px", borderBottom: `1px solid ${c.line}` }}>
                <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 700 }}>{id}</div>
                <div style={{ fontSize: 13 }}>{lots[u.lot]?.name || u.lot}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: status.color, display: "inline-block" }} />
                  {status.label}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{ width: 70, height: 6, borderRadius: 3, background: c.line, overflow: "hidden" }}>
                    <div style={{ width: `${battery}%`, height: 6, background: batteryColor(battery) }} />
                  </div>
                  <span style={{ fontFamily: mono, fontSize: 12.5, color: batteryColor(battery) }}>{battery}%</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13 }}>
                  {u.ledColor ? (
                    <>
                      <span style={{ width: 12, height: 12, borderRadius: 3, background: ledHex[u.ledColor] || c.dim, display: "inline-block" }} />
                      {u.ledColor}
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
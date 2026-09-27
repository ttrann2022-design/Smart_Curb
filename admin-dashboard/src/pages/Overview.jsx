import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth, database } from "../firebase";

const c = {
  bg: "#0F0F0D", side: "#090908", panel: "#171714", line: "#2B2B25",
  text: "#F2F1EA", dim: "#8E8C82", accent: "#C6F24A", onAccent: "#12110F",
  open: "#8BD44A", busy: "#F2694C", warn: "#E0A63C",
};
const mono = "'IBM Plex Mono', monospace";

const navItems = ["Overview", "Parking lots", "Curb units", "Cameras", "Assistant", "Analytics", "Users & roles"];

function Tile({ label, value, sub, color }) {
  return (
    <div style={{ flex: 1, background: c.panel, border: `1px solid ${c.line}`, borderRadius: 6, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: c.dim }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: mono, fontSize: 28, fontWeight: 600, color: color || c.text }}>{value}</span>
        {sub && <span style={{ fontSize: 12.5, color: c.dim }}>{sub}</span>}
      </div>
    </div>
  );
}

function Overview() {
  const [lots, setLots] = useState({});
  const [units, setUnits] = useState({});
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const stopAuth = onAuthStateChanged(auth, (user) => {
      if (!user) navigate("/");
      else setUserEmail(user.email);
    });
    const stopLots = onValue(ref(database, "lots"), (snap) => {
      setLots(snap.val() || {});
      setLoading(false);
    });
    const stopUnits = onValue(ref(database, "units"), (snap) => {
      setUnits(snap.val() || {});
    });
    return () => { stopAuth(); stopLots(); stopUnits(); };
  }, [navigate]);

  const lotList = Object.entries(lots);
  const total = lotList.reduce((sum, [, l]) => sum + (l.totalSpots || 0), 0);
  const open = lotList.reduce((sum, [, l]) => sum + (l.openSpots || 0), 0);
  const occupied = total - open;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  const alerts = Object.entries(units).filter(([, u]) => !u.online || u.battery < 20);

  const handleSignOut = async () => {
    await signOut(auth);
    navigate("/");
  };

  return (
    <div style={{ display: "flex", height: "100vh", background: c.bg, color: c.text }}>
      {/* Sidebar */}
      <div style={{ width: 240, background: c.side, padding: "18px 12px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 6px 20px" }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: c.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 13, height: 5, borderRadius: 1, background: c.onAccent }} />
          </div>
          <div>
            <div style={{ fontFamily: mono, fontSize: 12.5, fontWeight: 600 }}>SMART WHEEL STOP</div>
            <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 1.2, color: c.dim }}>ADMIN CONSOLE</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flexGrow: 1 }}>
          {navItems.map((item) => (
            <div key={item} style={{
              padding: "10px 12px", borderRadius: 5, fontSize: 13.5,
              background: item === "Overview" ? "#232B15" : "transparent",
              color: item === "Overview" ? c.accent : "#A5A399",
              fontWeight: item === "Overview" ? 600 : 500,
            }}>{item}</div>
          ))}
        </div>
        <div style={{ padding: 12, borderRadius: 6, background: "#1D1D19" }}>
          <div style={{ fontSize: 12, color: c.text, overflow: "hidden", textOverflow: "ellipsis" }}>{userEmail}</div>
          <button onClick={handleSignOut} style={{ marginTop: 8, background: "transparent", border: "none", color: c.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>
            Sign out
          </button>
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ height: 68, background: c.panel, borderBottom: `1px solid ${c.line}`, padding: "0 30px", display: "flex", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 19, fontWeight: 600 }}>Overview</div>
            <div style={{ fontSize: 12.5, color: c.dim }}>Live data from Firebase</div>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 30, color: c.dim }}>Loading live data…</div>
        ) : (
          <div style={{ padding: "22px 30px", display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
            <div style={{ display: "flex", gap: 14 }}>
              <Tile label="TOTAL SPOTS MONITORED" value={total} />
              <Tile label="AVAILABLE NOW" value={open} sub={`${pct(open)}%`} color={c.open} />
              <Tile label="OCCUPIED" value={occupied} sub={`${pct(occupied)}%`} color={c.busy} />
              <Tile label="NEEDS ATTENTION" value={alerts.length} sub={`of ${Object.keys(units).length} units`} color={c.warn} />
            </div>

            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              {/* Lots */}
              <div style={{ flex: 2, background: c.panel, border: `1px solid ${c.line}`, borderRadius: 6 }}>
                <div style={{ padding: "14px 18px", borderBottom: `1px solid ${c.line}`, fontFamily: mono, fontSize: 14, fontWeight: 600 }}>Parking lots</div>
                <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {lotList.map(([id, lot]) => {
                    const fill = lot.totalSpots ? Math.round(((lot.totalSpots - lot.openSpots) / lot.totalSpots) * 100) : 0;
                    const tone = fill >= 90 ? c.busy : fill >= 70 ? c.warn : c.open;
                    return (
                      <div key={id} style={{ border: `1px solid ${c.line}`, borderRadius: 5, padding: "11px 13px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{lot.name}</span>
                          <span style={{ fontSize: 12, color: c.dim }}>{lot.openSpots} of {lot.totalSpots} open</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: c.line, overflow: "hidden" }}>
                          <div style={{ width: `${fill}%`, height: 6, background: tone }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Alerts */}
              <div style={{ flex: 1, background: c.panel, border: `1px solid ${c.line}`, borderRadius: 6 }}>
                <div style={{ padding: "14px 18px", borderBottom: `1px solid ${c.line}`, fontFamily: mono, fontSize: 14, fontWeight: 600 }}>Active alerts</div>
                <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 9 }}>
                  {alerts.length === 0 && <div style={{ fontSize: 12.5, color: c.dim }}>All units healthy.</div>}
                  {alerts.map(([id, u]) => {
                    const offline = !u.online;
                    const lotName = lots[u.lot]?.name || u.lot;
                    return (
                      <div key={id} style={{
                        borderRadius: 5, padding: "11px 12px",
                        background: offline ? "#221410" : "#26200F",
                        border: `1px solid ${offline ? "#4A2A20" : "#4A3A1C"}`,
                      }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: offline ? "#FF8F74" : "#FFC078" }}>
                          {offline ? "Unit offline" : "Low battery"}
                        </div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>
                          {offline ? `Curb ${id} in ${lotName} is not reporting.` : `Curb ${id} in ${lotName} is at ${u.battery}%.`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Overview;
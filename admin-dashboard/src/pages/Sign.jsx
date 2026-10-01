import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { database, dataPath } from "../firebase";

const mono = "'IBM Plex Mono', monospace";

function statusColor(open, total) {
  if (open === 0) return "#FF4D3D";
  if (total && open / total < 0.15) return "#FFB020";
  return "#9BF04A";
}

function Sign() {
  const [lots, setLots] = useState({});
  const [units, setUnits] = useState({});
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const stopLots = onValue(ref(database, dataPath("lots")), (s) => setLots(s.val() || {}));
    const stopUnits = onValue(ref(database, dataPath("units")), (s) => setUnits(s.val() || {}));
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { stopLots(); stopUnits(); clearInterval(clock); };
  }, []);

  const unitList = Object.values(units);
  const rows = Object.entries(lots).map(([id, lot]) => {
    const mine = unitList.filter((u) => u.lot === id);
    const open = mine.filter((u) => u.online && !u.occupied).length;
    const [main, sub] = (lot.name || id).split(" — ");
    return { id, main, sub, open, total: mine.length };
  });
  const totalOpen = rows.reduce((s, r) => s + r.open, 0);

  return (
    <div style={{ minHeight: "100vh", boxSizing: "border-box", background: "#050505", color: "#F2F1EA", fontFamily: mono, padding: "4vh 5vw", display: "flex", flexDirection: "column", gap: "3vh" }}>
      <style>{"@keyframes swsPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }"}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "min(2.6vw, 3.2vh)", letterSpacing: 2, color: "#8E8C82" }}>
        <span>PARKING AVAILABILITY</span>
        <span style={{ display: "flex", alignItems: "center", gap: "1vw" }}>
          <span style={{ width: "1.4vh", height: "1.4vh", borderRadius: "50%", background: "#9BF04A", display: "inline-block", animation: "swsPulse 1.6s ease-in-out infinite" }} />
          LIVE · {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </span>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {rows.length === 0 && <div style={{ fontSize: "3vh", color: "#8E8C82" }}>No lots configured.</div>}
        {rows.map((r) => {
          const color = statusColor(r.open, r.total);
          return (
            <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2.2vh 0", borderBottom: "2px dashed #222" }}>
              <div>
                <div style={{ fontSize: "min(5vw, 6.5vh)", fontWeight: 600, lineHeight: 1.1 }}>{r.main.toUpperCase()}</div>
                {r.sub && <div style={{ fontSize: "min(2vw, 2.6vh)", color: "#8E8C82", letterSpacing: 2, marginTop: "0.6vh" }}>{r.sub.toUpperCase()}</div>}
              </div>
              <div style={{ fontSize: "min(8vw, 11vh)", fontWeight: 700, color, textShadow: `0 0 2.5vh ${color}55`, transition: "color 0.4s" }}>
                {r.open === 0 ? "FULL" : r.open}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "min(2.2vw, 2.8vh)", color: "#8E8C82", letterSpacing: 2 }}>
        <span>ALL LOTS · {totalOpen} SPACES OPEN</span>
        <span>SMART CURB</span>
      </div>
    </div>
  );
}

export default Sign;
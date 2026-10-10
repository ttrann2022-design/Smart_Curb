import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";
import { DEMO_BUILD, SIM_ROOT } from "../dataMode";
import AnimatedNumber from "../components/AnimatedNumber";
import { useFlash } from "../motion";

const mono = "'IBM Plex Mono', monospace";

function statusColor(open, total) {
  if (!total) return "#5F5E56";
  if (open === 0) return "#FF4D3D";
  if (total && open / total < 0.15) return "#FFB020";
  return "#9BF04A";
}

function SignRow({ row }) {
  const color = statusColor(row.open, row.total);
  const pop = useFlash(row.open, 700);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2.2vh 0", borderBottom: "2px dashed #222" }}>
      <div>
        <div style={{ fontSize: "min(5vw, 6.5vh)", fontWeight: 600, lineHeight: 1.1 }}>{row.main.toUpperCase()}</div>
        {row.sub && <div style={{ fontSize: "min(2vw, 2.6vh)", color: "#8E8C82", letterSpacing: 2, marginTop: "0.6vh" }}>{row.sub.toUpperCase()}</div>}
      </div>
      <div
        className={pop ? "sws-pop" : ""}
        style={{ fontSize: "min(8vw, 11vh)", fontWeight: 700, color, textShadow: `0 0 2.5vh ${color}55`, transition: "color 0.4s, text-shadow 0.4s" }}
      >
        {/* A lot with no reporting curbs isn't full; it just has nothing to show. */}
        {!row.total ? "—" : row.open === 0 ? "FULL" : <AnimatedNumber value={row.open} />}
      </div>
    </div>
  );
}

function Sign() {
  const [lots, setLots] = useState({});
  const [units, setUnits] = useState({});
  const [now, setNow] = useState(new Date());
  const [params] = useSearchParams();
  // A TV shouldn't change source because someone flipped a switch elsewhere,
  // so the sign only shows simulated data when its URL says so.
  const simulated = DEMO_BUILD || params.get("source") === "sim";
  const root = simulated ? SIM_ROOT : "";

  useEffect(() => {
    const stopLots = onValue(ref(database, root + "lots"), (s) => setLots(s.val() || {}));
    const stopUnits = onValue(ref(database, root + "units"), (s) => setUnits(s.val() || {}));
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { stopLots(); stopUnits(); clearInterval(clock); };
  }, [root]);

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "min(2.6vw, 3.2vh)", letterSpacing: 2, color: "#8E8C82" }}>
        <span>PARKING AVAILABILITY{simulated && <span style={{ color: "#8FB4FF", marginLeft: "1.5vw" }}>· SIMULATED</span>}</span>
        <span style={{ display: "flex", alignItems: "center", gap: "1vw" }}>
          <span className="sws-live-dot" style={{ width: "1.4vh", height: "1.4vh", background: "#9BF04A", margin: 0 }} />
          LIVE · {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </span>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {rows.length === 0 && <div style={{ fontSize: "3vh", color: "#8E8C82" }}>No lots configured.</div>}
        {rows.map((r) => <SignRow key={r.id} row={r} />)}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "min(2.2vw, 2.8vh)", color: "#8E8C82", letterSpacing: 2 }}>
        <span>ALL LOTS · <AnimatedNumber value={totalOpen} /> SPACES OPEN</span>
        <span>SMART CURB</span>
      </div>
    </div>
  );
}

export default Sign;
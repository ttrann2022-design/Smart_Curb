import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { c } from "../theme";
import { DEMO_BUILD, setDataMode } from "../dataMode";
import { watchSimulation } from "../demo/simulator";

// Shown on every page while the dashboard is reading simulated data.
function SimBanner() {
  const [sim, setSim] = useState({ running: false, elsewhere: null });
  useEffect(() => watchSimulation(setSim), []);
  const active = sim.running || sim.elsewhere;

  return (
    <div role="status" className="sws-sim-banner" style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "9px 30px", background: c.simBg, borderBottom: `1px solid ${c.simLine}`, color: c.sim, fontSize: 12.5 }}>
      <span style={{ fontWeight: 700, letterSpacing: 1, fontSize: 11, padding: "3px 8px", borderRadius: 4, border: `1px solid ${c.simLine}` }}>
        SIMULATION
      </span>
      <span style={{ color: "#C9D8F5", flex: "1 1 280px" }}>
        {DEMO_BUILD
          ? "Demo site. Every curb here is simulated."
          : "You're viewing simulated curbs. Real curbs, including C-095, aren't shown or changed."}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 600 }}>
        <span className={active ? "sws-live-dot" : ""} style={{ width: 7, height: 7, borderRadius: 4, margin: 0, background: active ? c.sim : c.simLine, display: "inline-block" }} />
        {sim.running ? "Running in this tab" : sim.elsewhere ? `Running for ${sim.elsewhere}` : <Link to="/simulation" style={{ color: c.sim }}>Not running</Link>}
      </span>
      {!DEMO_BUILD && (
        <button type="button" onClick={() => setDataMode("live")} style={{ height: 28, padding: "0 12px", borderRadius: 5, border: `1px solid ${c.simLine}`, background: "transparent", color: c.sim, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          Switch to live data
        </button>
      )}
    </div>
  );
}

export default SimBanner;

import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { c, mono } from "../theme";
import { setDataMode } from "../dataMode";
import {
  resetDemoData, startSimulation, stopSimulation, watchSimulation,
  rushHour, knockCurbOffline, restoreAllCurbs, DEMO_CURB_COUNT, DEMO_LOT_COUNT,
} from "../demo/simulator";

const card = { background: c.panel, border: `1px solid ${c.line}`, borderRadius: 6, padding: 18, display: "flex", flexDirection: "column", gap: 12 };
const title = { fontFamily: mono, fontSize: 14, fontWeight: 600 };
const note = { fontSize: 12.5, color: c.dim, lineHeight: 1.5 };

function Btn({ children, onClick, primary, danger, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 40, padding: "0 16px", borderRadius: 5, fontSize: 13, fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        border: primary ? "none" : `1px solid ${danger ? c.busy : c.line}`,
        background: primary ? c.sim : c.bg,
        color: primary ? "#0B1220" : danger ? c.busy : c.text,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

function DemoControls() {
  const { role, mode } = useOutletContext();
  const [sim, setSim] = useState({ running: false, elsewhere: null });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const canRun = role === "operator" || role === "manager";

  useEffect(() => watchSimulation(setSim), []);

  const run = async (fn) => {
    setBusy(true);
    setStatus(null);
    try {
      const msg = await fn();
      if (msg) setStatus({ ok: true, text: msg });
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    }
    setBusy(false);
  };

  const head = (
    <div className="sws-page-head" style={{ height: 68, flexShrink: 0, background: c.panel, borderBottom: `1px solid ${c.line}`, padding: "0 30px", display: "flex", alignItems: "center" }}>
      <div>
        <div style={{ fontFamily: mono, fontSize: 19, fontWeight: 600 }}>Simulation</div>
        <div style={{ fontSize: 12.5, color: c.dim }}>Simulated curbs live in their own area of the database. Real curbs are never touched.</div>
      </div>
    </div>
  );

  if (mode !== "sim") {
    return (
      <>
        {head}
        <div className="sws-page-body" style={{ padding: "22px 30px", maxWidth: 820 }}>
          <div style={card}>
            <div style={title}>You're viewing live data</div>
            <div style={note}>Switch to Simulation to see and control simulated curbs. Live data, including C-095, stays exactly as the hardware reports it.</div>
            <div><Btn primary onClick={() => setDataMode("sim")}>Switch to Simulation</Btn></div>
          </div>
        </div>
      </>
    );
  }

  const runningLabel = sim.running ? "RUNNING HERE" : sim.elsewhere ? "RUNNING ELSEWHERE" : "STOPPED";
  const live = sim.running || sim.elsewhere;

  return (
    <>
      {head}
      <div className="sws-page-body" style={{ padding: "22px 30px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 820 }}>
        {!canRun && (
          <div style={{ ...note, color: c.sim }}>Viewers can watch the simulation. Operators and managers can control it.</div>
        )}

        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={title}>Live simulation</div>
            <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.6, color: live ? c.sim : c.dim }}>
              <span className={live ? "sws-live-dot" : ""} style={{ width: 8, height: 8, borderRadius: 4, margin: 0, background: live ? c.sim : c.dim, display: "inline-block" }} />
              {runningLabel}
            </span>
          </div>
          <div style={note}>
            Cars arrive and leave every 2 seconds and every screen updates live. Only one browser can run it at a time.
            It stops if this tab is closed or refreshed, or if you switch to live data.
          </div>
          {sim.elsewhere && !sim.running && (
            <div style={{ ...note, color: c.sim }}>Running in {sim.elsewhere}'s browser. Stop it there to run it here.</div>
          )}
          <div>
            {sim.running ? (
              <Btn onClick={() => run(stopSimulation)} disabled={busy || !canRun}>Stop simulation</Btn>
            ) : (
              <Btn primary onClick={() => run(startSimulation)} disabled={busy || !canRun || !!sim.elsewhere}>Start simulation</Btn>
            )}
          </div>
        </div>

        <div style={card}>
          <div style={title}>Scenarios</div>
          <div style={note}>One-click events for showing specific features in a presentation.</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Btn onClick={() => run(() => rushHour("lot06"))} disabled={busy || !canRun}>Rush hour in Lot 6</Btn>
            <Btn danger onClick={() => run(knockCurbOffline)} disabled={busy || !canRun}>Take a curb offline</Btn>
            <Btn onClick={() => run(restoreAllCurbs)} disabled={busy || !canRun}>Bring all curbs online</Btn>
          </div>
        </div>

        <div style={card}>
          <div style={title}>Reset simulated data</div>
          <div style={note}>
            Replaces every simulated curb with a fresh set: {DEMO_CURB_COUNT} curbs across {DEMO_LOT_COUNT} lots, one offline curb and two low batteries
            so the alerts have something to show, plus a week of history. Run it right before presenting.
          </div>
          {confirmReset ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: 12, borderRadius: 6, background: "#221410", border: "1px solid #4A2A20" }}>
              <span style={{ fontSize: 13, color: "#FFB8A6", flex: "1 1 220px" }}>Replace all simulated data? This can't be undone.</span>
              <Btn danger onClick={() => { setConfirmReset(false); run(resetDemoData); }} disabled={busy}>Yes, reset</Btn>
              <Btn onClick={() => setConfirmReset(false)}>Cancel</Btn>
            </div>
          ) : (
            <div><Btn onClick={() => setConfirmReset(true)} disabled={busy || !canRun}>Load fresh simulated data</Btn></div>
          )}
        </div>

        {status && (
          <div role="status" style={{ fontSize: 13, color: status.ok ? c.sim : c.busy }}>
            {status.ok ? "" : "Error: "}{status.text}
          </div>
        )}
      </div>
    </>
  );
}

export default DemoControls;

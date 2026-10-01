import { useEffect, useState } from "react";
import { c, mono } from "../theme";
import {
  resetDemoData, startSimulation, stopSimulation, watchSimulation,
  rushHour, knockCurbOffline, restoreAllCurbs,
} from "../demo/simulator";

const card = { background: c.panel, border: `1px solid ${c.line}`, borderRadius: 6, padding: 18, display: "flex", flexDirection: "column", gap: 12 };
const title = { fontFamily: mono, fontSize: 14, fontWeight: 600 };
const note = { fontSize: 12.5, color: c.dim, lineHeight: 1.5 };

function Btn({ children, onClick, primary, danger, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 40, padding: "0 16px", borderRadius: 5, fontSize: 13, fontWeight: 600,
        cursor: disabled ? "wait" : "pointer",
        border: primary ? "none" : `1px solid ${danger ? c.busy : c.line}`,
        background: primary ? c.accent : c.bg,
        color: primary ? c.onAccent : danger ? c.busy : c.text,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

function DemoControls() {
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => watchSimulation(setRunning), []);

  const run = async (fn) => {
    setBusy(true);
    setStatus("");
    try {
      const msg = await fn();
      if (msg) setStatus(msg);
    } catch (err) {
      setStatus("Error: " + err.message);
    }
    setBusy(false);
  };

  const handleReset = () => {
    if (!window.confirm("Replace all demo data with a fresh set of curbs?")) return;
    run(resetDemoData);
  };

  const handleToggle = () => {
    try {
      if (running) {
        stopSimulation();
        setStatus("Simulation stopped.");
      } else {
        startSimulation();
        setStatus("Simulation running. Cars arrive and leave every 2 seconds.");
      }
    } catch (err) {
      setStatus("Error: " + err.message);
    }
  };

  return (
    <>
      <div style={{ height: 68, flexShrink: 0, background: c.panel, borderBottom: `1px solid ${c.line}`, padding: "0 30px", display: "flex", alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 19, fontWeight: 600 }}>Demo controls</div>
          <div style={{ fontSize: 12.5, color: c.dim }}>Everything here writes to the demo section of the database. Real data is never touched.</div>
        </div>
      </div>

      <div style={{ padding: "22px 30px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 820 }}>
        <div style={card}>
          <div style={title}>1. Demo data</div>
          <div style={note}>Creates 94 curbs across 4 lots, with one offline curb and two low batteries so the alerts panel has something to show. Run this right before presenting to start from a clean slate.</div>
          <div><Btn onClick={handleReset} disabled={busy}>Load fresh demo data</Btn></div>
        </div>

        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={title}>2. Live simulation</div>
            <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, color: running ? c.open : c.dim }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: running ? c.open : c.dim, display: "inline-block" }} />
              {running ? "RUNNING" : "STOPPED"}
            </span>
          </div>
          <div style={note}>Cars arrive and leave every 2 seconds. Keeps running while you click between pages, but stops if this browser tab is refreshed or closed. Only start it on one computer.</div>
          <div><Btn primary={!running} onClick={handleToggle}>{running ? "Stop simulation" : "Start simulation"}</Btn></div>
        </div>

        <div style={card}>
          <div style={title}>3. Scenarios</div>
          <div style={note}>One-click events to show specific features during the presentation.</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Btn onClick={() => run(() => rushHour("lot06"))} disabled={busy}>Rush hour in Lot 6</Btn>
            <Btn danger onClick={() => run(knockCurbOffline)} disabled={busy}>Take a curb offline</Btn>
            <Btn onClick={() => run(restoreAllCurbs)} disabled={busy}>Bring all curbs online</Btn>
          </div>
        </div>

        {status && <div style={{ fontSize: 13, color: status.startsWith("Error") ? c.busy : c.open }}>{status}</div>}
      </div>
    </>
  );
}

export default DemoControls;
import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { c } from "../theme";
import { setDataMode } from "../dataMode";
import {
  resetDemoData, startSimulation, stopSimulation, watchSimulation,
  rushHour, knockCurbOffline, restoreAllCurbs, DEMO_CURB_COUNT, DEMO_LOT_COUNT,
} from "../demo/simulator";
import { PageHeader, Card, Button, Notice, StatusText } from "../components/ui";

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

  const head = <PageHeader title="Simulation" subtitle="Simulated curbs live in their own area of the database. Real curbs are never touched." />;

  if (mode !== "sim") {
    return (
      <>
        {head}
        <div className="sws-page-body sws-narrow">
          <Card title="You're viewing live data">
            <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start" }}>
              <div className="sws-note">Switch to Simulation to see and control simulated curbs. Live data, including C-095, stays exactly as the hardware reports it.</div>
              <Button variant="sim" icon="simulation" onClick={() => setDataMode("sim")}>Switch to Simulation</Button>
            </div>
          </Card>
        </div>
      </>
    );
  }

  const runningLabel = sim.running ? "RUNNING HERE" : sim.elsewhere ? "RUNNING ELSEWHERE" : "STOPPED";
  const live = sim.running || sim.elsewhere;

  return (
    <>
      {head}
      <div className="sws-page-body sws-narrow">
        {!canRun && (
          <Notice tone="sim" icon="lock">Viewers can watch the simulation. Operators and managers can control it.</Notice>
        )}

        <Card
          title="Live simulation"
          delay={0}
          actions={
            <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.6, color: live ? c.sim : c.dim }}>
              <span className={live ? "sws-live-dot" : ""} style={{ width: 8, height: 8, borderRadius: 4, margin: 0, background: live ? c.sim : c.dim, display: "inline-block" }} />
              {runningLabel}
            </span>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
            <div className="sws-note">
              Cars arrive and leave every 2 seconds and every screen updates live. Only one browser can run it at a time.
              It stops if this tab is closed or refreshed, or if you switch to live data.
            </div>
            {sim.elsewhere && !sim.running && (
              <Notice tone="sim">Running in {sim.elsewhere}'s browser. Stop it there to run it here.</Notice>
            )}
            {sim.running ? (
              <Button onClick={() => run(stopSimulation)} disabled={busy || !canRun}>Stop simulation</Button>
            ) : (
              <Button variant="sim" icon="simulation" onClick={() => run(startSimulation)} disabled={busy || !canRun || !!sim.elsewhere}>Start simulation</Button>
            )}
          </div>
        </Card>

        <Card title="Scenarios" subtitle="One-click events for showing specific features in a presentation." delay={60}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button onClick={() => run(() => rushHour("lot06"))} disabled={busy || !canRun}>Rush hour in Lot 6</Button>
            <Button variant="danger" onClick={() => run(knockCurbOffline)} disabled={busy || !canRun}>Take a curb offline</Button>
            <Button onClick={() => run(restoreAllCurbs)} disabled={busy || !canRun}>Bring all curbs online</Button>
          </div>
        </Card>

        <Card title="Reset simulated data" delay={120}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="sws-note">
              Replaces every simulated curb with a fresh set: {DEMO_CURB_COUNT} curbs across {DEMO_LOT_COUNT} lots, one offline curb and two low batteries
              so the alerts have something to show, plus a week of history. Run it right before presenting.
            </div>
            {confirmReset ? (
              <div role="alertdialog" aria-label="Confirm reset" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: 12, borderRadius: 6, background: c.busyBg, border: `1px solid ${c.busyLine}` }}>
                <span style={{ fontSize: 13, color: c.busyText, flex: "1 1 220px" }}>Replace all simulated data? This can't be undone.</span>
                <Button variant="danger" onClick={() => { setConfirmReset(false); run(resetDemoData); }} disabled={busy} autoFocus>Yes, reset</Button>
                <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
              </div>
            ) : (
              <div><Button onClick={() => setConfirmReset(true)} disabled={busy || !canRun}>Load fresh simulated data</Button></div>
            )}
          </div>
        </Card>

        <StatusText msg={status} />
      </div>
    </>
  );
}

export default DemoControls;

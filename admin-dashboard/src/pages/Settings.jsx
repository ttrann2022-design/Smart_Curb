import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, signOut } from "firebase/auth";
import { ref, update } from "firebase/database";
import { auth, database } from "../firebase";
import { c, mono } from "../theme";
import { DEFAULT_ALERTS, useAlertSettings } from "../units";
import { stopSimulation } from "../demo/simulator";
import DataModeSwitch from "../components/DataModeSwitch";
import { PageHeader, Card, Button, Field, Input, StatusText, Notice } from "../components/ui";

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const ready = current && next && confirm && !busy;

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (next.length < 6) return setMsg({ ok: false, text: "New password must be at least 6 characters." });
    if (next !== confirm) return setMsg({ ok: false, text: "New passwords don't match." });
    if (next === current) return setMsg({ ok: false, text: "Pick a password different from your current one." });
    const user = auth.currentUser;
    setBusy(true);
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
      await updatePassword(user, next);
      setCurrent(""); setNext(""); setConfirm("");
      setMsg({ ok: true, text: "Password changed." });
    } catch (err) {
      const code = err.code || "";
      if (code.includes("wrong-password") || code.includes("invalid-credential")) setMsg({ ok: false, text: "Your current password is incorrect." });
      else if (code.includes("too-many-requests")) setMsg({ ok: false, text: "Too many attempts. Wait a few minutes and try again." });
      else if (code.includes("weak-password")) setMsg({ ok: false, text: "That password is too weak. Try a longer one." });
      else setMsg({ ok: false, text: "Couldn't change your password. Check your connection and try again." });
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <input type="text" autoComplete="username" value={auth.currentUser?.email || ""} readOnly hidden />
      <Field label="Current password">
        <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <div className="sws-form-row" style={{ display: "flex", gap: 12 }}>
        <Field label="New password" hint="At least 6 characters." style={{ flex: 1 }}>
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirm new password" style={{ flex: 1 }}>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Button type="submit" variant="primary" disabled={!ready} busy={busy}>{busy ? "Changing…" : "Change password"}</Button>
        <StatusText msg={msg} />
      </div>
    </form>
  );
}

function AlertsForm({ saved, canEdit }) {
  const [lowBattery, setLowBattery] = useState(String(saved.lowBattery));
  const [staleEnabled, setStaleEnabled] = useState(saved.staleEnabled);
  const [staleMinutes, setStaleMinutes] = useState(String(saved.staleMinutes));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const dirty = Number(lowBattery) !== saved.lowBattery || staleEnabled !== saved.staleEnabled || Number(staleMinutes) !== saved.staleMinutes;

  const save = async (e) => {
    e.preventDefault();
    setMsg(null);
    const lb = Number(lowBattery);
    const sm = Number(staleMinutes);
    if (!Number.isInteger(lb) || lb < 1 || lb > 99) return setMsg({ ok: false, text: "Low battery must be a whole number from 1 to 99." });
    if (!Number.isInteger(sm) || sm < 1 || sm > 10080) return setMsg({ ok: false, text: "Stale time must be a whole number of minutes from 1 to 10080 (one week)." });
    setBusy(true);
    try {
      await update(ref(database, "settings/alerts"), { lowBattery: lb, staleEnabled, staleMinutes: sm });
      setMsg({ ok: true, text: "Saved. Every dashboard uses the new thresholds right away." });
    } catch (err) {
      setMsg({ ok: false, text: "Couldn't save: " + err.message });
    }
    setBusy(false);
  };

  const reset = () => {
    setLowBattery(String(DEFAULT_ALERTS.lowBattery));
    setStaleEnabled(DEFAULT_ALERTS.staleEnabled);
    setStaleMinutes(String(DEFAULT_ALERTS.staleMinutes));
  };

  return (
    <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <fieldset disabled={!canEdit} style={{ border: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
        <Field label="Low battery alert below" hint="Curbs without a battery reading are never flagged." style={{ maxWidth: 280 }}>
          <div style={{ position: "relative" }}>
            <Input type="number" min="1" max="99" step="1" inputMode="numeric" value={lowBattery} onChange={(e) => setLowBattery(e.target.value)} style={{ paddingRight: 34, fontFamily: mono }} />
            <span aria-hidden="true" style={{ position: "absolute", right: 12, top: 11, fontSize: 13, color: c.dim }}>%</span>
          </div>
        </Field>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 14, borderRadius: 6, border: `1px solid ${c.line}`, background: c.bg }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: canEdit ? "pointer" : "default" }}>
            <input type="checkbox" checked={staleEnabled} onChange={(e) => setStaleEnabled(e.target.checked)} style={{ width: 16, height: 16, accentColor: c.accent, margin: 0 }} />
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>Flag curbs that stop reporting</span>
            <span className="sws-badge" style={{ marginLeft: "auto", background: staleEnabled ? c.warnBg : c.card, color: staleEnabled ? c.warn : c.dim }}>{staleEnabled ? "ON" : "OFF"}</span>
          </label>
          <div className="sws-note">
            Leave this off until the Receiver sends a regular heartbeat. Right now <span className="sws-mono">lastUpdated</span> only changes when a car arrives or leaves,
            so a curb in a quiet spot would be flagged even though it's working.
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", opacity: staleEnabled ? 1 : 0.5 }}>
            <span style={{ fontSize: 13 }}>Flag after</span>
            <Input type="number" min="1" max="10080" step="1" inputMode="numeric" value={staleMinutes} disabled={!staleEnabled || !canEdit} onChange={(e) => setStaleMinutes(e.target.value)} style={{ width: 96, fontFamily: mono }} />
            <span style={{ fontSize: 13 }}>minutes without a report</span>
          </label>
        </div>
      </fieldset>

      {canEdit ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Button type="submit" variant="primary" disabled={!dirty || busy} busy={busy}>{busy ? "Saving…" : "Save thresholds"}</Button>
          <Button onClick={reset}>Restore defaults</Button>
          <StatusText msg={msg} />
        </div>
      ) : (
        <Notice tone="info" icon="lock">Only managers can change alert thresholds.</Notice>
      )}
    </form>
  );
}

function Settings() {
  const { role } = useOutletContext();
  const alerts = useAlertSettings();
  const navigate = useNavigate();
  const user = auth.currentUser;

  const handleSignOut = async () => {
    await stopSimulation();
    await signOut(auth);
    navigate("/");
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Your account, where data comes from, and when to raise alerts" />

      <div className="sws-page-body sws-narrow">
        <Card title="Account" delay={0}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div aria-hidden="true" style={{ width: 42, height: 42, borderRadius: 21, background: c.navBg, color: c.accent, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontWeight: 600, fontSize: 16 }}>
                {(user?.email || "?")[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{user?.email}</div>
                <div style={{ marginTop: 5 }}><span className="sws-badge">{role.toUpperCase()}</span></div>
              </div>
              <Button icon="logout" onClick={handleSignOut}>Sign out</Button>
            </div>
            <div style={{ borderTop: `1px solid ${c.line}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <h3 style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>Change password</h3>
              <PasswordForm />
            </div>
          </div>
        </Card>

        <Card
          title="Data source"
          delay={60}
          subtitle="Live shows the real curbs, including C-095 from the hardware Receiver. Simulation shows a separate set of simulated curbs for demos and testing. Switching only changes what this browser shows; it never moves or changes any data."
        >
          <div style={{ maxWidth: 360 }}>
            <DataModeSwitch size="lg" />
          </div>
        </Card>

        <Card title="Alert thresholds" delay={120} subtitle="Shared by everyone. These decide what shows up under Needs attention and Active alerts.">
          <AlertsForm key={JSON.stringify(alerts)} saved={alerts} canEdit={role === "manager"} />
        </Card>
      </div>
    </>
  );
}

export default Settings;

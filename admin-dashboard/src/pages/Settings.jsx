import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, signOut } from "firebase/auth";
import { ref, update } from "firebase/database";
import { auth, database } from "../firebase";
import { c, mono } from "../theme";
import { DEFAULT_ALERTS, useAlertSettings } from "../units";
import DataModeSwitch from "../components/DataModeSwitch";

const card = { background: c.panel, border: `1px solid ${c.line}`, borderRadius: 6 };
const cardHead = { padding: "14px 18px", borderBottom: `1px solid ${c.line}` };
const cardTitle = { fontFamily: mono, fontSize: 14, fontWeight: 600 };
const cardSub = { fontSize: 12.5, color: c.dim, marginTop: 3, lineHeight: 1.5 };
const label = { fontSize: 11.5, fontWeight: 600, color: c.dim };
const input = { height: 40, padding: "0 12px", borderRadius: 5, border: `1px solid ${c.line}`, background: c.bg, color: c.text, fontSize: 13.5, width: "100%" };
const primaryBtn = (enabled) => ({
  height: 40, padding: "0 18px", borderRadius: 5, border: "none", fontWeight: 600, fontSize: 13.5,
  background: enabled ? c.accent : c.line, color: enabled ? c.onAccent : c.dim, cursor: enabled ? "pointer" : "not-allowed",
});

function Message({ msg }) {
  if (!msg) return null;
  return <div role="status" style={{ fontSize: 12.5, color: msg.ok ? c.open : c.busy }}>{msg.text}</div>;
}

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
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={label}>Current password</span>
        <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} style={input} />
      </label>
      <div className="sws-form-row" style={{ display: "flex", gap: 12 }}>
        <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={label}>New password</span>
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} style={input} />
        </label>
        <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={label}>Confirm new password</span>
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={input} />
        </label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <button type="submit" disabled={!ready} style={primaryBtn(ready)}>{busy ? "Changing…" : "Change password"}</button>
        <Message msg={msg} />
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
      <fieldset disabled={!canEdit} style={{ border: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 18 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 260 }}>
          <span style={label}>Low battery alert below</span>
          <div style={{ position: "relative" }}>
            <input type="number" min="1" max="99" step="1" inputMode="numeric" value={lowBattery} onChange={(e) => setLowBattery(e.target.value)} style={{ ...input, paddingRight: 34, fontFamily: mono }} />
            <span style={{ position: "absolute", right: 12, top: 11, fontSize: 13, color: c.dim }}>%</span>
          </div>
          <span style={{ fontSize: 12, color: c.dim }}>Curbs without a battery reading are never flagged.</span>
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 6, border: `1px solid ${c.line}`, background: c.bg }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: canEdit ? "pointer" : "default" }}>
            <input type="checkbox" checked={staleEnabled} onChange={(e) => setStaleEnabled(e.target.checked)} style={{ width: 16, height: 16, accentColor: c.accent }} />
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>Flag curbs that stop reporting</span>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: staleEnabled ? c.warn : c.dim, marginLeft: "auto" }}>{staleEnabled ? "ON" : "OFF"}</span>
          </label>
          <div style={{ fontSize: 12.5, color: c.dim, lineHeight: 1.55 }}>
            Leave this off until the Receiver sends a regular heartbeat. Right now <span style={{ fontFamily: mono }}>lastUpdated</span> only changes when a car arrives or leaves,
            so a curb in a quiet spot would be flagged even though it's working.
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, opacity: staleEnabled ? 1 : 0.5 }}>
            <span style={{ fontSize: 13 }}>Flag after</span>
            <input type="number" min="1" max="10080" step="1" inputMode="numeric" value={staleMinutes} disabled={!staleEnabled || !canEdit} onChange={(e) => setStaleMinutes(e.target.value)} style={{ ...input, width: 96, fontFamily: mono }} />
            <span style={{ fontSize: 13 }}>minutes without a report</span>
          </label>
        </div>
      </fieldset>

      {canEdit ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button type="submit" disabled={!dirty || busy} style={primaryBtn(dirty && !busy)}>{busy ? "Saving…" : "Save thresholds"}</button>
          <button type="button" onClick={reset} style={{ height: 40, padding: "0 14px", borderRadius: 5, border: `1px solid ${c.line}`, background: "transparent", color: c.text, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Restore defaults</button>
          <Message msg={msg} />
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: c.dim }}>Only managers can change alert thresholds.</div>
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
    await signOut(auth);
    navigate("/");
  };

  return (
    <>
      <div className="sws-page-head" style={{ height: 68, flexShrink: 0, background: c.panel, borderBottom: `1px solid ${c.line}`, padding: "0 30px", display: "flex", alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 19, fontWeight: 600 }}>Settings</div>
          <div style={{ fontSize: 12.5, color: c.dim }}>Your account, where data comes from, and when to raise alerts</div>
        </div>
      </div>

      <div className="sws-page-body" style={{ padding: "22px 30px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 820 }}>
        <section style={card}>
          <div style={cardHead}>
            <div style={cardTitle}>Account</div>
          </div>
          <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div style={{ width: 40, height: 40, borderRadius: 20, background: c.navBg, color: c.accent, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontWeight: 600 }}>
                {(user?.email || "?")[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{user?.email}</div>
                <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, letterSpacing: 0.8, color: c.accent, marginTop: 3 }}>{role.toUpperCase()}</div>
              </div>
              <button type="button" onClick={handleSignOut} style={{ height: 36, padding: "0 14px", borderRadius: 5, border: `1px solid ${c.line}`, background: "transparent", color: c.text, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Sign out
              </button>
            </div>
            <div style={{ borderTop: `1px solid ${c.line}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>Change password</div>
              <PasswordForm />
            </div>
          </div>
        </section>

        <section style={card}>
          <div style={cardHead}>
            <div style={cardTitle}>Data source</div>
            <div style={cardSub}>
              Live shows the real curbs, including C-095 from the hardware Receiver. Simulation shows a separate set of simulated curbs
              for demos and testing. Switching only changes what this browser shows; it never moves or changes any data.
            </div>
          </div>
          <div style={{ padding: 18, maxWidth: 360 }}>
            <DataModeSwitch size="lg" />
          </div>
        </section>

        <section style={card}>
          <div style={cardHead}>
            <div style={cardTitle}>Alert thresholds</div>
            <div style={cardSub}>Shared by everyone. These decide what shows up under Needs attention and Active alerts.</div>
          </div>
          <div style={{ padding: 18 }}>
            <AlertsForm key={JSON.stringify(alerts)} saved={alerts} canEdit={role === "manager"} />
          </div>
        </section>
      </div>
    </>
  );
}

export default Settings;

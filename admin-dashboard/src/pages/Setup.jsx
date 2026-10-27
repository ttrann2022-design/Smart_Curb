import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useOutletContext } from "react-router-dom";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";
import { dataPath } from "../dataMode";
import { addNewSimCurbs } from "../demo/simulator";
import { c, mono, LED_HEX, LED_COLORS } from "../theme";
import { FACILITIES, MODULES, SITE_PATH, facilityById, writeSetup } from "../site";
import { useNow, formatAgo, formatExact } from "../units";
import { normalizeTheme } from "../themes";
import Icon from "../components/Icon";
import ThemePicker from "../components/ThemePicker";
import { Card, Button, Field, Input, Select, Notice, EmptyState, Skeleton, StatusText } from "../components/ui";

const STEPS = [
  { label: "Site details", next: "Next: choose your facility type" },
  { label: "Facility type", next: "Next: connect your curbs" },
  { label: "Connect curbs", next: "Last step" },
];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// A curb has reported once the Receiver (or the simulator) has written its state.
const hasReported = (u) => typeof u?.lastUpdated === "number" || typeof u?.occupied === "boolean";

function StepIndicator({ step, onPick }) {
  return (
    <ol className="su-steps" aria-label="Setup progress">
      {STEPS.map((s, i) => {
        const done = i < step;
        const inner = (
          <>
            <span className="su-step-num" aria-hidden="true">{done ? <Icon name="check" size={12} strokeWidth={2.6} /> : i + 1}</span>
            <span className="su-step-label">{s.label}</span>
            {done && <span className="sws-sr-only">(done)</span>}
          </>
        );
        return (
          <li key={s.label} className={`su-step${done ? " is-done" : ""}`} aria-current={i === step ? "step" : undefined}>
            {/* Finished steps can be revisited; later ones open only through Continue. */}
            {done ? <button type="button" className="su-step-btn" onClick={() => onPick(i)}>{inner}</button> : inner}
          </li>
        );
      })}
    </ol>
  );
}

function SiteStep({ form, setForm, invalid }) {
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <Card plain>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)", maxWidth: 640 }}>
        <Field label="Site name" hint="How the dashboard refers to this site, e.g. North Campus or City Centre.">
          <Input name="siteName" value={form.siteName} onChange={set("siteName")} maxLength={80} autoComplete="organization" aria-invalid={invalid.siteName || undefined} placeholder="e.g. North Campus" />
        </Field>
        <fieldset style={{ border: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--sp-3)", minWidth: 0 }}>
          <legend className="sws-card-title" style={{ padding: 0, marginBottom: "var(--sp-1)" }}>Site contact</legend>
          <p className="sws-note" style={{ margin: "0 0 var(--sp-1)" }}>Who staff should reach about the curbs and this dashboard.</p>
          <div className="sws-form-row" style={{ display: "flex", gap: "var(--sp-3)" }}>
            <Field label="Name" style={{ flex: 1 }}>
              <Input name="contactName" value={form.contactName} onChange={set("contactName")} maxLength={80} autoComplete="name" aria-invalid={invalid.contactName || undefined} />
            </Field>
            <Field label="Email" style={{ flex: 1 }}>
              <Input name="contactEmail" type="email" value={form.contactEmail} onChange={set("contactEmail")} maxLength={120} autoComplete="email" aria-invalid={invalid.contactEmail || undefined} />
            </Field>
          </div>
          <Field label="Phone (optional)" style={{ maxWidth: 312 }}>
            <Input name="contactPhone" type="tel" value={form.contactPhone} onChange={set("contactPhone")} maxLength={40} autoComplete="tel" />
          </Field>
        </fieldset>
      </div>
    </Card>
  );
}

function FacilityStep({ facility, modules, pickFacility, toggleModule }) {
  const chosen = facilityById(facility);
  return (
    <>
      <div role="radiogroup" aria-label="Facility type" className="su-grid">
        {FACILITIES.map((f) => (
          <label key={f.id} className="su-option">
            <input type="radio" name="facility" value={f.id} checked={facility === f.id} onChange={() => pickFacility(f.id)} className="sws-sr-only" />
            <span className="su-option-title">
              {f.label}
              <Icon name="check" size={16} strokeWidth={2.4} className="su-check" />
            </span>
            <span className="su-option-desc">{f.desc}</span>
          </label>
        ))}
      </div>

      {chosen && (
        <div key={chosen.id} className="su-split sws-enter">
          <Card plain title={`Modules turned on for ${chosen.label}`} subtitle="Modules that are on appear in the sidebar. None is built yet: each opens a page that says what it will do.">
            <div className="su-mods">
              {Object.keys(chosen.modules).map((id) => (
                <label key={id} className="su-mod">
                  <input type="checkbox" checked={!!modules[id]} onChange={() => toggleModule(id)} style={{ width: 16, height: 16, accentColor: c.text, margin: "1px 0 0", flexShrink: 0 }} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "block", fontSize: "var(--fs-body)", fontWeight: 600 }}>{MODULES[id].label}</span>
                    <span style={{ display: "block", fontSize: 12, color: c.dim, lineHeight: 1.45, marginTop: 2 }}>{MODULES[id].desc}</span>
                  </span>
                  <span className={`sws-badge${modules[id] ? "" : " su-off"}`} aria-hidden="true">{modules[id] ? "ON" : "OFF"}</span>
                </label>
              ))}
            </div>
          </Card>
          <Card plain title="Zone presets" subtitle="Ready-made zones for Parking lots → LED panel control. Operators can still set any colour and text.">
            <ul className="su-zones">
              {LED_COLORS.map((name) => (
                <li key={name}>
                  <span className="sws-dot" style={{ background: LED_HEX[name], width: 10, height: 10 }} aria-hidden="true" />
                  <span style={{ fontWeight: 600 }}>{chosen.zones[name].label}</span>
                  <span className="sws-mono" style={{ color: c.dim, fontSize: 11.5, marginLeft: "auto" }}>{chosen.zones[name].text}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}

function CurbsStep({ mode }) {
  const [units, setUnits] = useState(null);
  const [lots, setLots] = useState(null);
  const [choice, setChoice] = useState({});
  // Curbs assigned during this visit stay listed, so the manager sees what they did.
  const [assignedHere, setAssignedHere] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [msg, setMsg] = useState(null);
  const now = useNow();

  // Simulation only: new simulated curbs (demo/units) to try this step with.
  const install = async () => {
    setInstalling(true);
    setMsg(null);
    try {
      await addNewSimCurbs();
      setMsg({ ok: true, text: "Installed 3 simulated curbs. Put them in a lot below." });
    } catch (err) {
      setMsg({ ok: false, text: "Couldn't add simulated curbs: " + err.message });
    }
    setInstalling(false);
  };

  useEffect(() => {
    const stopUnits = onValue(ref(database, dataPath("units")), (s) => setUnits(s.val() || {}), () => setUnits({}));
    const stopLots = onValue(ref(database, dataPath("lots")), (s) => setLots(s.val() || {}), () => setLots({}));
    return () => { stopUnits(); stopLots(); };
  }, []);

  if (!units || !lots) {
    return <Card><div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={40} />)}</div></Card>;
  }

  const lotList = Object.entries(lots).map(([id, l]) => ({ id, name: l?.name || id })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const rows = Object.entries(units)
    .filter(([id, u]) => assignedHere[id] || (hasReported(u) && !lots[u.lot]))
    .sort(([a], [b]) => a.localeCompare(b));
  const waiting = rows.filter(([id]) => !assignedHere[id]);
  const online = waiting.filter(([, u]) => u.online).length;

  const assign = async (id) => {
    const lot = choice[id] ?? assignedHere[id];
    if (!lot) return;
    setBusyId(id);
    setMsg(null);
    try {
      await writeSetup(`units/${id}`, { lot });
      setAssignedHere((a) => ({ ...a, [id]: lot }));
      setChoice((ch) => { const next = { ...ch }; delete next[id]; return next; });
      setMsg({ ok: true, text: `${id} is now in ${lots[lot]?.name || lot}.` });
    } catch (err) {
      setMsg({ ok: false, text: err.code === "PERMISSION_DENIED" ? "Only managers can assign curbs to lots." : `Couldn't assign ${id}: ${err.message}` });
    }
    setBusyId(null);
  };

  return (
    <>
      {lotList.length === 0 && (
        <Notice tone="warn" title="No lots yet">
          Curbs can only go into a lot that exists. {mode === "sim" ? "Load simulated data from the Simulation page, then come back." : "Lots appear here once they're added to the database."} You can finish setup now and assign curbs later.
        </Notice>
      )}

      <Card
        body={false}
        title="Curbs without a lot"
        subtitle={rows.length ? `${waiting.length} waiting · ${online} online · ${waiting.length - online} offline` : null}
        actions={mode === "sim" && (
          <Button size="sm" variant="sim" icon="simulation" onClick={install} disabled={installing} busy={installing}>Install 3 simulated curbs</Button>
        )}
      >
        {rows.length === 0 ? (
          <EmptyState icon="check" title="Every curb that has reported is in a lot">
            New curbs appear here as soon as they report in. You can finish setup.
            {mode === "sim" && " To try this step, install some simulated curbs."}
          </EmptyState>
        ) : (
          <ul className="su-curbs">
            {rows.map(([id, u]) => {
              const current = assignedHere[id];
              const value = choice[id] ?? current ?? "";
              const ago = formatAgo(u.lastUpdated, now);
              return (
                <li key={id} className="su-curb">
                  <span className="su-curb-id">
                    <span className="sws-mono" translate="no" style={{ fontWeight: 600 }}>{id}</span>
                    {u.lot && !lots[u.lot] && <span className="su-curb-note" title={`Lot ${u.lot} doesn't exist`}>Unknown lot {u.lot}</span>}
                  </span>
                  <span className={`su-online${u.online ? " is-on" : ""}`}>
                    <span className="su-online-dot" aria-hidden="true" />
                    {u.online ? "Online" : "Offline"}
                  </span>
                  <span className="su-curb-ago" title={formatExact(u.lastUpdated)}>{ago ? `Reported ${ago}` : "Reported"}</span>
                  <span className="su-curb-act">
                    <Select aria-label={`Lot for curb ${id}`} value={value} disabled={!lotList.length || busyId === id} onChange={(e) => setChoice((ch) => ({ ...ch, [id]: e.target.value }))} style={{ height: 34, fontSize: 13 }}>
                      <option value="" disabled>Choose a lot</option>
                      {lotList.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </Select>
                    {current && value === current ? (
                      <span className="su-assigned"><Icon name="check" size={14} strokeWidth={2.4} />Assigned</span>
                    ) : (
                      <Button size="sm" variant="primary" disabled={!value || busyId === id} busy={busyId === id} onClick={() => assign(id)}>
                        {current ? "Move" : "Assign"}<span className="sws-sr-only"> {id}</span>
                      </Button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <StatusText msg={msg} />
    </>
  );
}

function Wizard({ saved, mode, previewTheme }) {
  const navigate = useNavigate();
  const reopened = saved?.setupComplete === true;
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    siteName: saved?.siteName || "",
    contactName: saved?.contact?.name || "",
    contactEmail: saved?.contact?.email || "",
    contactPhone: saved?.contact?.phone || "",
  });
  const [invalid, setInvalid] = useState({});
  const [facility, setFacility] = useState(facilityById(saved?.facilityType)?.id || null);
  const [modules, setModules] = useState(() => {
    const f = facilityById(saved?.facilityType);
    return f ? { ...f.modules, ...saved?.modules } : {};
  });
  // Previewed live while picking, saved with setupComplete on Finish.
  const [theme, setTheme] = useState(() => normalizeTheme(saved?.theme));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const heading = useRef(null);
  const body = useRef(null);
  const shownStep = useRef(step);

  // Moving to another step puts focus on its heading, so screen readers announce where they are.
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    heading.current?.focus();
  }, [step]);

  const save = async (fields) => {
    setBusy(true);
    setMsg(null);
    try {
      await writeSetup(SITE_PATH, fields);
      return true;
    } catch (err) {
      setMsg({ ok: false, text: err.code === "PERMISSION_DENIED" ? "Only managers can change site settings." : "Couldn't save: " + err.message });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const goTo = (i) => { setMsg(null); setStep(i); };

  const continueFromSite = async () => {
    const siteName = form.siteName.trim();
    const name = form.contactName.trim();
    const email = form.contactEmail.trim();
    const phone = form.contactPhone.trim();
    const bad = { siteName: !siteName, contactName: !name, contactEmail: !EMAIL_RE.test(email) };
    setInvalid(bad);
    const first = Object.keys(bad).find((k) => bad[k]);
    if (first) {
      setMsg({ ok: false, text: first === "siteName" ? "Give the site a name." : first === "contactName" ? "Add a contact name." : "Add a valid contact email." });
      body.current?.querySelector(`[name="${first}"]`)?.focus();
      return;
    }
    const ok = await save({ siteName, contact: { name, email, ...(phone ? { phone } : {}) }, setupComplete: reopened });
    if (ok) goTo(1);
  };

  const continueFromFacility = async () => {
    if (!facility) return setMsg({ ok: false, text: "Pick the kind of facility you manage." });
    const f = facilityById(facility);
    const chosen = Object.fromEntries(Object.keys(f.modules).map((id) => [id, !!modules[id]]));
    if (await save({ facilityType: facility, modules: chosen })) goTo(2);
  };

  // Leaving Setup without finishing drops the preview; after Finish the saved theme matches it.
  useEffect(() => () => previewTheme(null), [previewTheme]);

  const pickTheme = (id) => {
    setTheme(id);
    previewTheme(id);
  };

  const finish = async () => {
    if (await save({ setupComplete: true, theme })) navigate(reopened ? "/settings" : "/overview", { replace: true });
  };

  const pickFacility = (id) => {
    setMsg(null);
    setFacility(id);
    // A new facility type starts from its own module defaults.
    setModules(id === saved?.facilityType ? { ...facilityById(id).modules, ...saved.modules } : { ...facilityById(id).modules });
  };

  const titles = [
    { title: "Tell us about this site", sub: "The basics staff will see. You can change them later from Settings." },
    { title: "What kind of facility are you managing?", sub: "The dashboard configures itself around your answer: the zone presets and the modules in the sidebar both follow it. You can switch this later in Settings." },
    { title: "Connect curbs", sub: "These curbs have reported in but aren't in a lot yet. Put each one in the lot it's installed in, then pick a look for the dashboard." },
  ];

  const primary = [
    { label: "Continue", onClick: continueFromSite },
    { label: "Continue", onClick: continueFromFacility },
    { label: "Finish setup", onClick: finish },
  ][step];

  return (
    <div className="su-wrap">
      <StepIndicator step={step} onPick={goTo} />

      <div className="su-head">
        <div className="su-eyebrow">
          <span>Step {step + 1} of {STEPS.length}</span>
          {reopened && <Button variant="link" onClick={() => navigate("/settings")} style={{ fontSize: 12.5, letterSpacing: 0, textTransform: "none", fontFamily: "var(--sans)" }}>Exit setup</Button>}
        </div>
        <h1 ref={heading} tabIndex={-1} className="su-title">{titles[step].title}</h1>
        <p className="su-sub">{titles[step].sub}</p>
      </div>

      {/* Keyed by step so each one fades in (instantly with reduced motion). */}
      <div key={step} ref={body} className="su-body sws-enter">
        {step === 0 && <SiteStep form={form} setForm={setForm} invalid={invalid} />}
        {step === 1 && <FacilityStep facility={facility} modules={modules} pickFacility={pickFacility} toggleModule={(id) => setModules((m) => ({ ...m, [id]: !m[id] }))} />}
        {step === 2 && (
          <>
            <CurbsStep mode={mode} />
            <Card plain title="Appearance" subtitle="Pick a colour theme for everyone's dashboard. It's saved when you finish setup, and managers can change it later in Settings. Curb status colours are the same in every theme.">
              <ThemePicker value={theme} onPick={pickTheme} name="setup-theme" label="Site theme" />
            </Card>
          </>
        )}
      </div>

      <div className="su-foot">
        {step > 0 ? (
          <Button onClick={() => goTo(step - 1)} disabled={busy}>Back</Button>
        ) : reopened ? (
          <Button onClick={() => navigate("/settings")}>Cancel</Button>
        ) : null}
        <StatusText msg={msg} />
        <span className="su-foot-hint">{STEPS[step].next}</span>
        <Button variant="primary" onClick={primary.onClick} disabled={busy} busy={busy} iconRight={step < 2 && !busy ? "arrowRight" : undefined}>
          {busy ? "Saving…" : primary.label}
        </Button>
      </div>
    </div>
  );
}

function Setup() {
  const { role, mode, siteConfig, previewTheme } = useOutletContext();
  if (role !== "manager") return <Navigate to="/overview" replace />;
  if (!siteConfig.loaded) {
    return (
      <div className="su-wrap" role="status" style={{ alignItems: "center", color: c.dim, fontSize: 13, fontFamily: mono }}>
        <span className="sws-spinner" style={{ color: c.brand }} aria-hidden="true" />
        Loading site settings…
      </div>
    );
  }
  return <Wizard saved={siteConfig.site} mode={mode} previewTheme={previewTheme} />;
}

export default Setup;

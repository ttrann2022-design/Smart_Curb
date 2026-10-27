import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { useDataMode } from "../dataMode";
import { LEAD_LIMITS, createLead, leadErrors } from "../leads";
import { FACILITIES } from "../site";
import { DEFAULT_ALERTS, STALL_WORD, statusKey } from "../units";
import { Button, Input, Notice, Select } from "../components/ui";
import logo from "../assets/smartcurb-logo.jpg";
import Icon from "../components/Icon";
import LotPlan, { StallMark } from "../components/LotPlan";

// Public page for signed-out visitors at "/". Signed-in staff go straight to the Overview.
// Honest by design: Smart Curb is a student prototype, so there are no customers,
// statistics or prices here.

function Brand() {
  return (
    <Link to="/" className="ld-brand" aria-label="Smart Wheel Stop home">
      <img src={logo} alt="" width={34} height={34} />
      <span>SMART WHEEL STOP</span>
    </Link>
  );
}

const FLOW = [
  { icon: "units", title: "Sensor", text: "A sensor in each wheel stop notices when a car pulls in or leaves." },
  { icon: "radio", title: "Radio", text: "The curb radios that change to a receiver nearby, so there's no cable to every space." },
  { icon: "cloud", title: "Cloud", text: "The receiver writes it to a cloud database, where every screen picks it up." },
  { icon: "overview", title: "Dashboard and app", text: "Staff see every lot here. Drivers see free spaces in the app and on lot signs." },
];

// Sensor → radio → cloud → dashboard. A lime pulse travels each link in turn;
// with reduced motion the links are plain arrows.
function HowItWorks() {
  return (
    <section id="how" className="ld-sec" aria-labelledby="ld-how-h">
      <div className="ld-wrap">
        <div className="ld-sec-head">
          <span className="ld-sec-k">How it works</span>
          <h2 id="ld-how-h" className="ld-sec-h">From the curb to your screen</h2>
        </div>
        <ol className="ld-flow">
          {FLOW.map((step, i) => (
            <li key={step.title} className="ld-flow-step sws-enter" style={{ "--d": `${i * 80}ms`, "--i": i }}>
              <span className="ld-flow-icon" aria-hidden="true"><Icon name={step.icon} size={26} strokeWidth={1.6} /></span>
              <span className="ld-flow-n" aria-hidden="true">0{i + 1}</span>
              <h3 className="ld-flow-h">{step.title}</h3>
              <p className="ld-flow-p">{step.text}</p>
              {i < FLOW.length - 1 && (
                <span className="ld-flow-link" aria-hidden="true"><span className="ld-flow-pulse" /></span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// A made-up lot that runs entirely in the browser: nothing is read from or written to the database.
const DEMO_TARGET = 0.6;
const DEMO_TICK_MS = 2200;

function buildDemoLot() {
  const now = Date.now();
  const units = [];
  for (let i = 0; i < 20; i++) {
    units.push([`D-${String(i + 1).padStart(2, "0")}`, {
      occupied: Math.random() < DEMO_TARGET, online: true, battery: 60 + Math.floor(Math.random() * 40), lastUpdated: now - Math.floor(Math.random() * 30 * 60000),
    }]);
  }
  units[6][1].online = false;
  units[13][1].battery = 12;
  return units;
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function DemoLot() {
  const [units, setUnits] = useState(buildDemoLot);
  const [now, setNow] = useState(() => Date.now());
  // Starts paused for anyone who asked for reduced motion; anyone can pause it (WCAG 2.2.2).
  const [playing, setPlaying] = useState(() => !reducedMotion());
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!playing) return undefined;
    const t = setInterval(() => {
      const at = Date.now();
      setNow(at);
      setUnits((prev) => {
        const next = prev.map(([id, u]) => [id, u]);
        const flips = 1 + Math.floor(Math.random() * 2);
        for (let k = 0; k < flips; k++) {
          const i = Math.floor(Math.random() * next.length);
          const u = next[i][1];
          if (!u.online) continue;
          next[i] = [next[i][0], { ...u, occupied: !u.occupied, lastUpdated: at }];
        }
        return next;
      });
    }, DEMO_TICK_MS);
    return () => clearInterval(t);
  }, [playing]);

  const picked = selected && units.find(([id]) => id === selected);

  return (
    <section id="demo" className="ld-sec" aria-labelledby="ld-demo-h">
      <div className="ld-wrap ld-demo">
        <div className="ld-demo-copy">
          <div className="ld-sec-head" style={{ marginBottom: "var(--sp-4)" }}>
            <span className="ld-sec-k">Live lot plan</span>
            <h2 id="ld-demo-h" className="ld-sec-h">One block per space</h2>
            <p className="ld-sec-sub">
              This is the plan staff see on the dashboard. Each block is one curb: it changes the moment a car arrives or leaves.
            </p>
          </div>
          <ul className="ld-legend" aria-label="Legend">
            <li><StallMark status="open" swatch />{STALL_WORD.open}</li>
            <li><StallMark status="occupied" swatch />{STALL_WORD.occupied}</li>
            <li><StallMark status="offline" swatch />{STALL_WORD.offline}</li>
            <li><StallMark status="ring" low swatch />Low battery</li>
          </ul>
          <div className="ld-demo-ctl">
            <button type="button" className="sws-btn sws-btn-secondary sws-btn-sm" onClick={() => setPlaying((p) => !p)}>
              <Icon name={playing ? "pause" : "play"} size={14} />
              {playing ? "Pause demo" : "Play demo"}
            </button>
            <p className="ld-demo-pick" aria-live="polite">
              {picked ? <><span className="sws-mono">{picked[0]}</span>: {STALL_WORD[statusKey(picked[1])].toLowerCase()}</> : "Select a space to inspect it."}
            </p>
          </div>
        </div>
        <div className="ld-demo-plan">
          <span className="ld-demo-badge">Demo · simulated data</span>
          <LotPlan
            name="Demo lot"
            units={units}
            alerts={DEFAULT_ALERTS}
            now={now}
            selected={selected}
            onSelect={(id) => setSelected((cur) => (cur === id ? null : id))}
          />
        </div>
      </div>
    </section>
  );
}

// Only what the prototype actually does today.
const FEATURES = [
  { icon: "lots", title: "Every lot at a glance", text: "Each lot drawn as a plan, with free, occupied and offline spaces updating live." },
  { icon: "alert", title: "Alerts that matter", text: "Curbs that go offline or run low on battery are flagged before anyone has to go looking." },
  { icon: "sign", title: "Lot entrance signs", text: "A full-screen free-space count for a display at each entrance. It needs no sign-in." },
  { icon: "units", title: "LED zones and panel text", text: "Set each curb's zone colour and message from the dashboard. Not yet wired to the curb hardware." },
  { icon: "analytics", title: "Analytics", text: "Occupancy through the day and week, and how quickly changes reach the screen." },
  { icon: "users", title: "Roles for your team", text: "Viewers watch, operators change zones and text, managers handle users and setup." },
];

function WhatYouGet() {
  return (
    <section id="features" className="ld-sec" aria-labelledby="ld-feat-h">
      <div className="ld-wrap">
        <div className="ld-sec-head">
          <span className="ld-sec-k">What you get</span>
          <h2 id="ld-feat-h" className="ld-sec-h">A dashboard built around the curbs</h2>
        </div>
        <ul className="ld-feats">
          {FEATURES.map((f, i) => (
            <li key={f.title} className="ld-feat sws-enter" style={{ "--d": `${i * 50}ms` }}>
              <Icon name={f.icon} size={20} />
              <h3 className="ld-feat-h">{f.title}</h3>
              <p className="ld-feat-p">{f.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const BUILT_FOR = ["Campuses", "Stadiums", "Airports", "Hospitals", "Shopping centers", "Cities"];

function BuiltFor() {
  return (
    <section id="built-for" className="ld-sec ld-built" aria-labelledby="ld-built-h">
      <div className="ld-wrap">
        <h2 id="ld-built-h" className="ld-sec-k ld-built-h">Built for</h2>
        <ul className="ld-built-row">
          {BUILT_FOR.map((name) => <li key={name}>{name}</li>)}
        </ul>
        <p className="ld-built-note">
          Designed with these in mind: each facility type gets its own zone presets in setup. Smart Curb isn't installed at any of them yet.
        </p>
      </div>
    </section>
  );
}

const EMPTY_FORM = { name: "", email: "", organization: "", facilityType: "", message: "", website: "" };
const FIELD_ORDER = ["name", "email", "organization", "facilityType", "message"];

// One labelled control with its hint and error wired up for screen readers.
function FormField({ id, label, optional, hint, error, children }) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="ld-field">
      <label htmlFor={id} className="sws-field-label">
        {label}{optional && <span className="ld-optional"> (optional)</span>}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {hint && <span id={`${id}-hint`} className="sws-field-hint">{hint}</span>}
      {error && <span id={`${id}-err`} className="ld-err"><Icon name="alert" size={13} />{error}</span>}
    </div>
  );
}

function QuoteForm() {
  const mode = useDataMode();
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState("");
  // { email, sim }: sim means nothing was saved or sent.
  const [sent, setSent] = useState(null);
  const formRef = useRef(null);
  const doneRef = useRef(null);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors((errs) => { const next = { ...errs }; delete next[key]; return next; });
  };

  useEffect(() => { if (sent) doneRef.current?.focus(); }, [sent]);

  const submit = async (e) => {
    e.preventDefault();
    setFailed("");
    // Honeypot: people never see this field, so anything in it came from a bot.
    // Pretend it worked and write nothing.
    if (form.website) { setSent({ email: form.email.trim(), sim: false }); return; }
    const errs = leadErrors(form, FACILITIES.map((f) => f.id));
    setErrors(errs);
    const first = FIELD_ORDER.find((k) => errs[k]);
    if (first) { formRef.current?.querySelector(`#q-${first}`)?.focus(); return; }
    // Simulation (including the public demo site) never stores what a visitor types:
    // show the sent screen, say nothing was saved, and make no database write.
    if (mode === "sim") {
      setSent({ email: form.email.trim(), sim: true });
      setForm(EMPTY_FORM);
      return;
    }
    setBusy(true);
    try {
      await createLead(form);
      setSent({ email: form.email.trim(), sim: false });
      setForm(EMPTY_FORM);
    } catch (err) {
      setFailed(err.code === "PERMISSION_DENIED"
        ? "The request was turned away. Check the fields and try again."
        : "Couldn't send your request. Check your connection and try again.");
    }
    setBusy(false);
  };

  return (
    <section id="quote" className="ld-sec ld-quote" aria-labelledby="ld-quote-h">
      <div className="ld-wrap ld-quote-in">
        <div className="ld-sec-head">
          <span className="ld-sec-k">Request a quote</span>
          <h2 id="ld-quote-h" className="ld-sec-h">Tell us about your parking</h2>
          <p className="ld-sec-sub">
            Smart Curb is a student prototype, so there's no price list. Tell us what you're working with and the team will reply by email.
          </p>
        </div>

        <div className="ld-quote-card">
          {mode === "sim" && !sent && (
            <Notice tone="sim" title="Simulation">You can try this form, but nothing you enter is saved or sent.</Notice>
          )}
          {sent ? (
            <div ref={doneRef} tabIndex={-1} className="ld-done" role="status">
              <span className="ld-done-icon" aria-hidden="true"><Icon name="check" size={20} strokeWidth={2.4} /></span>
              <h3 className="ld-done-h">{sent.sim ? "Request sent (simulation)" : "Request sent"}</h3>
              {sent.sim ? (
                <Notice tone="sim" title="Nothing was saved or sent">
                  This is Simulation mode: your details weren&apos;t stored anywhere and no one will receive them.
                </Notice>
              ) : (
                <p className="ld-done-p">Thanks. We&apos;ll reply to {sent.email || "you"}.</p>
              )}
              <button type="button" className="sws-btn sws-btn-link" onClick={() => setSent(null)}>Send another request</button>
            </div>
          ) : (
            <form ref={formRef} onSubmit={submit} noValidate className="ld-form">
              <div className="ld-form-row">
                <FormField id="q-name" label="Name" error={errors.name}>
                  {(a) => <Input {...a} name="name" autoComplete="name" maxLength={LEAD_LIMITS.name} value={form.name} onChange={set("name")} />}
                </FormField>
                <FormField id="q-email" label="Email" error={errors.email}>
                  {(a) => <Input {...a} name="email" type="email" inputMode="email" autoComplete="email" spellCheck={false} maxLength={LEAD_LIMITS.email} value={form.email} onChange={set("email")} />}
                </FormField>
              </div>
              <div className="ld-form-row">
                <FormField id="q-organization" label="Organization" optional error={errors.organization}>
                  {(a) => <Input {...a} name="organization" autoComplete="organization" maxLength={LEAD_LIMITS.organization} value={form.organization} onChange={set("organization")} />}
                </FormField>
                <FormField id="q-facilityType" label="Facility type" error={errors.facilityType}>
                  {(a) => (
                    <Select {...a} name="facilityType" value={form.facilityType} onChange={set("facilityType")}>
                      <option value="" disabled>Choose one</option>
                      {FACILITIES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </Select>
                  )}
                </FormField>
              </div>
              <FormField id="q-message" label="Message" optional hint={`${form.message.length} of ${LEAD_LIMITS.message} characters. How many spaces, how many lots, anything else useful.`} error={errors.message}>
                {(a) => <textarea {...a} name="message" rows={5} maxLength={LEAD_LIMITS.message} className="sws-input ld-textarea" value={form.message} onChange={set("message")} />}
              </FormField>

              {/* Honeypot: hidden from people and screen readers, skipped by Tab. */}
              <div className="ld-hp" aria-hidden="true">
                <label htmlFor="q-website">Website</label>
                <input id="q-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
              </div>

              {failed && <Notice tone="busy" role="alert">{failed}</Notice>}
              <div className="ld-form-foot">
                <Button type="submit" variant="primary" size="lg" busy={busy} disabled={busy}>{busy ? "Sending…" : "Send request"}</Button>
                <span className="ld-form-note">We only use your details to reply to this request.</span>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function Landing() {
  const navigate = useNavigate();

  useEffect(() => onAuthStateChanged(auth, (user) => {
    if (user) navigate("/overview", { replace: true });
  }), [navigate]);

  return (
    <div className="ld">
      <a href="#main" className="sws-skip">Skip to content</a>
      <header className="ld-top">
        <div className="ld-wrap ld-top-in">
          <Brand />
          <nav aria-label="Site" className="ld-top-nav">
            <a href="#how" className="ld-top-link">How it works</a>
            <Link to="/login" className="ld-top-link">Staff sign in</Link>
            <a href="#quote" className="sws-btn sws-btn-primary sws-btn-sm">Request a quote</a>
          </nav>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <section className="ld-hero" aria-labelledby="ld-hero-h">
          <div className="ld-wrap">
            <p className="ld-eyebrow sws-enter">Student prototype · Smart curbs and a parking dashboard</p>
            <h1 id="ld-hero-h" className="ld-hero-h sws-enter" style={{ "--d": "60ms" }}>Every parking space, on one screen</h1>
            <p className="ld-hero-sub sws-enter" style={{ "--d": "120ms" }}>
              A sensor in each wheel stop reports whether its space is taken, and staff and drivers see every lot update live.
            </p>
            <div className="ld-hero-cta sws-enter" style={{ "--d": "180ms" }}>
              <a href="#quote" className="sws-btn sws-btn-primary sws-btn-lg">Request a quote</a>
              <a href="#how" className="sws-btn sws-btn-secondary sws-btn-lg">See how it works</a>
            </div>
          </div>
        </section>

        <HowItWorks />
        <DemoLot />
        <WhatYouGet />
        <BuiltFor />
        <QuoteForm />
      </main>

      <footer className="ld-foot">
        <div className="ld-wrap ld-foot-in">
          <Brand />
          <p className="ld-foot-note">
            A student prototype from FAU Engineering Senior Design. Not a commercial product yet: no installations, customers or pricing.
          </p>
          <nav aria-label="Footer" className="ld-foot-nav">
            <a href="#quote" className="sws-link">Request a quote</a>
            <Link to="/login" className="sws-link">Staff sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export default Landing;

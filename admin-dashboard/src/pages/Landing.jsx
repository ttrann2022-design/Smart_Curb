import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { DEFAULT_ALERTS, STALL_WORD, statusKey } from "../units";
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

import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import logo from "../assets/smartcurb-logo.jpg";

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

import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { ref, get } from "firebase/database";
import { auth, database } from "../firebase";
import { c, mono } from "../theme";
import { setDataMode, useDataMode } from "../dataMode";
import { Brand, FullScreen } from "../components/Brand";
import DataModeSwitch from "../components/DataModeSwitch";
import Icon from "../components/Icon";
import { Button } from "../components/ui";
import { CONSOLE_SUB } from "./constants";
import { useConsoleData } from "./data";
import { autoSeedOnce } from "./demoSeed";

const navItems = [
  { label: "Home", to: "/", icon: "overview", end: true },
  { label: "Customers", to: "/customers", icon: "users" },
  { label: "Requests", to: "/requests", icon: "inbox" },
  { label: "Deployments", to: "/deployments", icon: "units" },
  { label: "Import lots", to: "/import", icon: "lots" },
  { label: "Assistant", to: "/assistant", icon: "assistant" },
];

// Shown on every page while the console reads demo/ instead of live data.
function ConsoleSimBanner() {
  return (
    <div role="status" className="sws-sim-banner" style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "9px 30px", background: c.simBg, borderBottom: `1px solid ${c.simLine}`, color: c.sim, fontSize: 12.5 }}>
      <span style={{ fontWeight: 700, letterSpacing: 1, fontSize: 11, padding: "3px 8px", borderRadius: 4, border: `1px solid ${c.simLine}`, flexShrink: 0 }}>
        SIMULATION
      </span>
      <span className="sws-sim-text" style={{ color: c.simText, flex: "1 1 280px" }}>
        You're viewing simulated customers, requests and curbs. Live data isn't shown or changed.
      </span>
      <button type="button" onClick={() => setDataMode("live")} style={{ height: 28, padding: "0 12px", borderRadius: 5, border: `1px solid ${c.simLine}`, background: "transparent", color: c.sim, fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
        Switch to live<span className="sws-sim-long"> data</span>
      </button>
    </div>
  );
}

// The signed-in console: sidebar, banner and pages. Subscribes to sites, leads,
// lots and units once and passes them to every page, and seeds the demo
// customers the first time Simulation has none.
function ConsoleShell({ userEmail, mode, onSignOut }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const menuBtn = useRef(null);
  const sidebar = useRef(null);
  const data = useConsoleData(mode);
  const newLeads = Object.values(data.leads).filter((l) => l?.status === "new").length;

  const seedable = mode === "sim" && data.loaded && !data.error && Object.keys(data.sites).length === 0;
  useEffect(() => {
    if (seedable) autoSeedOnce()?.catch(() => { /* Home's "Reload demo customers" shows any error */ });
  }, [seedable]);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    menuBtn.current?.focus();
  }, []);

  // Mobile menu: Escape closes it; focus moves into it when it opens.
  useEffect(() => {
    if (!menuOpen) return;
    const frame = requestAnimationFrame(() => sidebar.current?.querySelector(".sws-nav-link")?.focus());
    const onKey = (e) => { if (e.key === "Escape") closeMenu(); };
    window.addEventListener("keydown", onKey);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("keydown", onKey); };
  }, [menuOpen, closeMenu]);

  return (
    <div className="sws-shell" style={{ display: "flex", minHeight: "100dvh", background: c.bg, color: c.text }}>
      <a href="#main" className="sws-skip">Skip to content</a>
      {menuOpen && <div className="sws-backdrop" onClick={closeMenu} aria-hidden="true" />}

      <nav
        ref={sidebar}
        id="sws-sidebar"
        aria-label="Main"
        className={`sws-sidebar${menuOpen ? " open" : ""}`}
        style={{ width: 240, flexShrink: 0, background: c.side, borderRight: `1px solid ${c.sideLine}`, padding: "18px 12px 14px", display: "flex", flexDirection: "column" }}
      >
        <div style={{ padding: "0 4px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <Brand sub={CONSOLE_SUB} />
          <button type="button" className="sws-menu-btn sws-sidebar-close" onClick={closeMenu} aria-label="Close menu" style={{ display: "none" }}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2, flexGrow: 1 }}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => `sws-nav-link${isActive ? " active" : ""}`}
            >
              <Icon name={item.icon} size={17} />
              {item.label}
              {item.to === "/requests" && newLeads > 0 && (
                // Keyed by count so it pops when a new request arrives.
                <span key={newLeads} className="sws-badge sws-nav-badge is-count sws-pop">
                  {newLeads}<span className="sws-sr-only"> new</span>
                </span>
              )}
            </NavLink>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
          <div>
            <div className="sws-label" style={{ fontSize: 10, letterSpacing: 1.1, padding: "0 2px 6px" }}>Data source</div>
            <DataModeSwitch />
          </div>

          <div style={{ padding: "10px 12px", borderRadius: 6, background: c.card, display: "flex", alignItems: "center", gap: 10 }}>
            <div aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 15, background: c.brandBg, color: c.brand, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
              {(userEmail || "?")[0].toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div title={userEmail} style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userEmail}</div>
              <div style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, letterSpacing: 0.8, color: c.brand, marginTop: 2 }}>PLATFORM ADMIN</div>
            </div>
            <button type="button" onClick={onSignOut} aria-label="Sign out" title="Sign out" className="sws-btn sws-btn-ghost sws-btn-sm" style={{ padding: "0 7px" }}>
              <Icon name="logout" size={16} />
            </button>
          </div>
        </div>
      </nav>

      <div className="sws-content" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div className="sws-topbar">
          <Brand size={32} sub={CONSOLE_SUB} />
          {/* The banner below scrolls away on phones; this sticky top bar keeps the label in view. */}
          {mode === "sim" && <span className="sws-badge cn-sim-badge" aria-hidden="true">SIMULATION</span>}
          <button
            ref={menuBtn}
            type="button"
            className="sws-menu-btn"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="sws-sidebar"
          >
            <Icon name="menu" size={18} />
          </button>
        </div>
        {mode === "sim" && <ConsoleSimBanner />}
        <main id="main" tabIndex={-1} className="sws-main" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Keyed by path so each route fades in (.sws-route); hash changes don't refade. */}
          <div key={location.pathname} className="sws-route">
            <Outlet key={mode} context={{ mode, data }} />
          </div>
        </main>
      </div>
    </div>
  );
}

// After sign-in, reads the live platformAdmins/<uid> (the same entry covers Live
// and Simulation) and signs out anyone without it. That is only a convenience:
// the database rules are what actually keep sites/ and leads/ to platform admins.
function ConsoleLayout() {
  const [userEmail, setUserEmail] = useState("");
  const [phase, setPhase] = useState("checking"); // checking | ready | error
  const [attempt, setAttempt] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const mode = useDataMode();

  useEffect(() => {
    let cancelled = false;

    const stopAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (!cancelled) navigate("/login", { replace: true, state: { from: location.pathname } });
        return;
      }
      try {
        const admin = await get(ref(database, `platformAdmins/${user.uid}`));
        if (cancelled) return;
        if (admin.val() !== true) {
          cancelled = true;
          await signOut(auth);
          navigate("/login?noaccess=1", { replace: true });
          return;
        }
        setUserEmail(user.email);
        setPhase("ready");
      } catch {
        if (!cancelled) setPhase("error");
      }
    });

    return () => { cancelled = true; stopAuth(); };
    // location is only read for the redirect target; re-running on every navigation isn't wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, attempt]);

  const handleSignOut = async () => {
    await signOut(auth);
    navigate("/login");
  };

  if (phase === "checking") {
    return (
      <FullScreen>
        <span className="sws-spinner" style={{ color: c.brand, width: 20, height: 20 }} aria-hidden="true" />
        <div role="status" style={{ fontSize: 13, color: c.dim }}>Checking console access…</div>
      </FullScreen>
    );
  }

  if (phase === "error") {
    return (
      <FullScreen>
        <div style={{ fontFamily: mono, fontSize: 17, fontWeight: 600 }}>Couldn't check console access</div>
        <div style={{ fontSize: 13, color: c.dim, lineHeight: 1.55 }}>
          The console couldn't reach the database. Check your connection and try again. If it keeps happening, the database rules may not be published yet.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="primary" onClick={() => { setPhase("checking"); setAttempt((n) => n + 1); }}>Try again</Button>
          <Button onClick={handleSignOut}>Sign out</Button>
        </div>
      </FullScreen>
    );
  }

  return <ConsoleShell userEmail={userEmail} mode={mode} onSignOut={handleSignOut} />;
}

export default ConsoleLayout;

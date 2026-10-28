import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { ref, get, set, update, remove, onValue, serverTimestamp } from "firebase/database";
import { auth, database, emailKey } from "../firebase";
import { c, mono } from "../theme";
import { DEMO_BUILD, useDataMode } from "../dataMode";
import { MODULES, enabledModules, useSiteConfig } from "../site";
import { applyTheme, clearTheme, normalizeTheme } from "../themes";
import { useLeads } from "../leads";
import { stopSimulation, watchSimulation } from "../demo/simulator";
import DataModeSwitch from "./DataModeSwitch";
import SimBanner from "./SimBanner";
import { Brand, FullScreen } from "./Brand";
import Icon from "./Icon";
import { Button } from "./ui";

const navItems = [
  { label: "Overview", to: "/overview", icon: "overview" },
  { label: "Parking lots", to: "/lots", icon: "lots" },
  { label: "Curb units", to: "/units", icon: "units" },
  { label: "Assistant", to: "/assistant", icon: "assistant" },
  { label: "Analytics", to: "/analytics", icon: "analytics" },
  { label: "Users & roles", to: "/users", icon: "users" },
  { label: "Requests", to: "/requests", icon: "inbox", managerOnly: true },
  { label: "Simulation", to: "/simulation", icon: "simulation", simOnly: true },
  { label: "Settings", to: "/settings", icon: "settings" },
];

function Layout() {
  const [userEmail, setUserEmail] = useState("");
  const [role, setRole] = useState(null);
  const [phase, setPhase] = useState("checking"); // checking | ready | error
  const [attempt, setAttempt] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const mode = useDataMode();
  const menuBtn = useRef(null);
  const sidebar = useRef(null);

  // Leaving Simulation stops a simulation running in this tab, so nothing
  // keeps changing simulated data out of sight.
  useEffect(() => {
    if (mode === "live") stopSimulation();
  }, [mode]);

  const [sim, setSim] = useState({ running: false, elsewhere: null });
  useEffect(() => (mode === "sim" ? watchSimulation(setSim) : undefined), [mode]);
  const simActive = !!(sim.running || sim.elsewhere);
  const siteConfig = useSiteConfig(mode);

  // Site theme: a manager's unsaved pick (previewTheme) wins, otherwise the value
  // saved for this data mode. Until that loads, the theme index.html set from
  // the cache stays on. Leaving the dashboard returns to the default look.
  const [themeOverride, previewTheme] = useState(null);
  const theme = themeOverride ?? (siteConfig.loaded ? normalizeTheme(siteConfig.site?.theme) : null);
  useEffect(() => { if (theme) applyTheme(theme); }, [theme]);
  useEffect(() => clearTheme, []);
  // Quote requests: managers only (the database refuses everyone else).
  const leadsState = useLeads(mode, role === "manager");
  const newLeads = leadsState.leads.filter((l) => l.status === "new").length;

  useEffect(() => {
    let stopRole = () => {};
    let cancelled = false;

    const stopAuth = onAuthStateChanged(auth, async (user) => {
      stopRole();
      if (!user) {
        if (!cancelled) navigate("/login", { replace: true, state: { from: location.pathname } });
        return;
      }

      try {
        const userRef = ref(database, `users/${user.uid}`);
        const snap = await get(userRef);

        if (!snap.exists()) {
          const inviteRef = ref(database, `invites/${emailKey(user.email)}`);
          const invite = await get(inviteRef);

          if (!invite.exists()) {
            cancelled = true;
            await signOut(auth);
            navigate("/login?noaccess=1", { replace: true });
            return;
          }

          await set(userRef, {
            email: user.email,
            role: invite.val().role || "viewer",
            // Server time, so the rules' "not in the future" check never trips on clock skew.
            createdAt: serverTimestamp(),
            lastActive: serverTimestamp(),
          });
          await remove(inviteRef);
        } else {
          // Bookkeeping only: never block sign-in if this write fails.
          update(userRef, { lastActive: serverTimestamp() }).catch(() => {});
        }
        if (cancelled) return;

        setUserEmail(user.email);
        stopRole = onValue(ref(database, `users/${user.uid}/role`), (s) => {
          setRole(s.val() || "viewer");
          setPhase("ready");
        }, () => setPhase("error"));
      } catch {
        if (!cancelled) setPhase("error");
      }
    });

    return () => { cancelled = true; stopAuth(); stopRole(); };
    // location is only read for the redirect target; re-running on every navigation isn't wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, attempt]);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    menuBtn.current?.focus();
  }, []);

  // Mobile menu: Escape closes it; focus moves into it when it opens.
  useEffect(() => {
    if (!menuOpen) return;
    // Wait a frame: the drawer is visibility:hidden until its transition starts.
    const frame = requestAnimationFrame(() => sidebar.current?.querySelector(".sws-nav-link")?.focus());
    const onKey = (e) => { if (e.key === "Escape") closeMenu(); };
    window.addEventListener("keydown", onKey);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("keydown", onKey); };
  }, [menuOpen, closeMenu]);

  const handleSignOut = async () => {
    await stopSimulation();
    await signOut(auth);
    navigate("/login");
  };

  if (phase === "checking") {
    return (
      <FullScreen>
        <span className="sws-spinner" style={{ color: c.brand, width: 20, height: 20 }} aria-hidden="true" />
        <div role="status" style={{ fontSize: 13, color: c.dim }}>Signing you in…</div>
      </FullScreen>
    );
  }

  if (phase === "error") {
    return (
      <FullScreen>
        <div style={{ fontFamily: mono, fontSize: 17, fontWeight: 600 }}>Couldn't load your account</div>
        <div style={{ fontSize: 13, color: c.dim, lineHeight: 1.55 }}>
          The dashboard couldn't reach the database. Check your connection and try again. If it keeps happening, your account may not have access.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="primary" onClick={() => { setPhase("checking"); setAttempt((n) => n + 1); }}>Try again</Button>
          <Button onClick={handleSignOut}>Sign out</Button>
        </div>
      </FullScreen>
    );
  }

  // First run: managers go through Setup until it's finished. Viewers and operators
  // never see it. If the database refuses the read (older published rules), don't block.
  const isManager = role === "manager";
  const onSetup = location.pathname === "/setup";
  if (isManager && !siteConfig.loaded) {
    return (
      <FullScreen>
        <span className="sws-spinner" style={{ color: c.brand, width: 20, height: 20 }} aria-hidden="true" />
        <div role="status" style={{ fontSize: 13, color: c.dim }}>Loading site settings…</div>
      </FullScreen>
    );
  }
  if (isManager && !siteConfig.error && siteConfig.site?.setupComplete !== true && !onSetup) {
    return <Navigate to="/setup" replace />;
  }
  if (onSetup && !isManager) return <Navigate to="/overview" replace />;

  // Setup gets its own bare screen: no sidebar, just the brand and a way out.
  if (onSetup) {
    return (
      <div className="su-shell">
        <a href="#main" className="sws-skip">Skip to content</a>
        <header className="su-top">
          <Brand size={36} sub="ADMIN CONSOLE · SETUP" />
          <div className="su-top-actions">
            {!DEMO_BUILD && <div className="su-top-switch"><DataModeSwitch /></div>}
            <button type="button" onClick={handleSignOut} aria-label="Sign out" title="Sign out" className="sws-btn sws-btn-ghost sws-btn-sm" style={{ padding: "0 7px" }}>
              <Icon name="logout" size={16} />
            </button>
          </div>
        </header>
        {mode === "sim" && <SimBanner />}
        <main id="main" tabIndex={-1} className="su-main">
          <Outlet key={mode} context={{ role, mode, siteConfig, leadsState, theme, previewTheme }} />
        </main>
      </div>
    );
  }

  const modules = enabledModules(siteConfig.site);

  // Pages scroll the window. The Assistant keeps a viewport-high layout so only
  // its conversation scrolls and the question box stays in view.
  const fixedHeight = location.pathname === "/assistant";

  return (
    <div className={`sws-shell${fixedHeight ? " sws-shell-fixed" : ""}`} style={{ display: "flex", minHeight: "100dvh", background: c.bg, color: c.text }}>
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
          <Brand />
          <button type="button" className="sws-menu-btn sws-sidebar-close" onClick={closeMenu} aria-label="Close menu" style={{ display: "none" }}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2, flexGrow: 1 }}>
          {navItems.filter((item) => (!item.simOnly || mode === "sim") && (!item.managerOnly || role === "manager")).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => `sws-nav-link${isActive ? " active" : ""}`}
            >
              <Icon name={item.icon} size={17} />
              {item.label}
              {item.simOnly && (
                <span className={`sws-badge sws-nav-badge${simActive ? " on" : ""}`} title={simActive ? "Simulation is running" : "Simulation is stopped"}>
                  {simActive ? "ON" : "OFF"}
                </span>
              )}
              {item.to === "/requests" && newLeads > 0 && (
                // Keyed by count so it pops when a new request arrives.
                <span key={newLeads} className="sws-badge sws-nav-badge is-count sws-pop">
                  {newLeads}<span className="sws-sr-only"> new</span>
                </span>
              )}
            </NavLink>
          ))}

          {/* Optional modules turned on in Setup. */}
          {modules.length > 0 && (
            <>
              <div className="sws-label" style={{ fontSize: 10, letterSpacing: 1.1, padding: "14px 14px 6px" }}>Modules</div>
              {modules.map((id) => (
                <NavLink
                  key={id}
                  to={`/modules/${id}`}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) => `sws-nav-link${isActive ? " active" : ""}`}
                >
                  <Icon name="module" size={17} />
                  {MODULES[id].label}
                </NavLink>
              ))}
            </>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
          <div>
            <div className="sws-label" style={{ fontSize: 10, letterSpacing: 1.1, padding: "0 2px 6px" }}>Data source</div>
            <DataModeSwitch />
          </div>

          <a
            href={mode === "sim" ? "/sign?source=sim" : "/sign"}
            target="_blank"
            rel="noreferrer"
            className="sws-nav-link"
            style={{ border: `1px dashed ${c.line}`, color: c.text, fontWeight: 600, fontSize: 13 }}
          >
            <Icon name="sign" size={16} />
            Open lot sign
            <Icon name="external" size={13} style={{ marginLeft: "auto" }} />
            <span className="sws-sr-only">(opens in a new tab)</span>
          </a>

          <div style={{ padding: "10px 12px", borderRadius: 6, background: c.card, display: "flex", alignItems: "center", gap: 10 }}>
            <div aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 15, background: c.brandBg, color: c.brand, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
              {(userEmail || "?")[0].toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div title={userEmail} style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userEmail}</div>
              <div style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, letterSpacing: 0.8, color: c.brand, marginTop: 2 }}>{role.toUpperCase()}</div>
            </div>
            <button type="button" onClick={handleSignOut} aria-label="Sign out" title="Sign out" className="sws-btn sws-btn-ghost sws-btn-sm" style={{ padding: "0 7px" }}>
              <Icon name="logout" size={16} />
            </button>
          </div>
        </div>
      </nav>

      <div className="sws-content" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div className="sws-topbar">
          <Brand size={32} />
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
        {mode === "sim" && <SimBanner />}
        <main id="main" tabIndex={-1} className="sws-main" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Keyed by path so each route fades in (.sws-route); query changes don't refade. */}
          <div key={location.pathname} className="sws-route">
            <Outlet key={mode} context={{ role, mode, siteConfig, leadsState, theme, previewTheme }} />
          </div>
        </main>
      </div>
    </div>
  );
}

export default Layout;

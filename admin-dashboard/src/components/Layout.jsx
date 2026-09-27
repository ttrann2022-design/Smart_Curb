import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { ref, get, set, update, onValue } from "firebase/database";
import { auth, database } from "../firebase";
import { c, mono } from "../theme";

const navItems = [
  { label: "Overview", to: "/overview" },
  { label: "Parking lots", to: "/lots" },
  { label: "Curb units", to: "/units" },
  { label: "Cameras", to: "/cameras" },
  { label: "Assistant", to: "/assistant" },
  { label: "Analytics", to: "/analytics" },
  { label: "Users & roles", to: "/users" },
];

function Layout() {
  const [userEmail, setUserEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let stopRole = () => {};
    const stopAuth = onAuthStateChanged(auth, async (user) => {
      stopRole();
      if (!user) {
        navigate("/");
        return;
      }
      setUserEmail(user.email);

      const userRef = ref(database, `users/${user.uid}`);
      const snap = await get(userRef);
      if (!snap.exists()) {
        await set(userRef, { email: user.email, role: "viewer", createdAt: Date.now(), lastActive: Date.now() });
      } else {
        await update(userRef, { lastActive: Date.now() });
      }

      stopRole = onValue(ref(database, `users/${user.uid}/role`), (s) => setRole(s.val() || "viewer"));
      setChecking(false);
    });
    return () => { stopAuth(); stopRole(); };
  }, [navigate]);

  const handleSignOut = async () => {
    await signOut(auth);
    navigate("/");
  };

  if (checking) {
    return <div style={{ padding: 30, color: c.dim, background: c.bg, height: "100vh" }}>Checking sign-in…</div>;
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: c.bg, color: c.text }}>
      <div style={{ width: 240, background: c.side, padding: "18px 12px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 6px 20px" }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: c.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 13, height: 5, borderRadius: 1, background: c.onAccent }} />
          </div>
          <div>
            <div style={{ fontFamily: mono, fontSize: 12.5, fontWeight: 600 }}>SMART WHEEL STOP</div>
            <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 1.2, color: c.dim }}>ADMIN CONSOLE</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2, flexGrow: 1 }}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                padding: "10px 12px", borderRadius: 5, fontSize: 13.5, textDecoration: "none",
                background: isActive ? c.navBg : "transparent",
                color: isActive ? c.accent : c.navText,
                fontWeight: isActive ? 600 : 500,
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </div>

        <div style={{ padding: 12, borderRadius: 6, background: c.card }}>
          <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis" }}>{userEmail}</div>
          <div style={{ fontFamily: mono, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.8, color: c.accent, marginTop: 4 }}>
            {role.toUpperCase()}
          </div>
          <button onClick={handleSignOut} style={{ marginTop: 8, background: "transparent", border: "none", color: c.dim, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>
            Sign out
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflowY: "auto" }}>
        <Outlet context={{ role }} />
      </div>
    </div>
  );
}

export default Layout;
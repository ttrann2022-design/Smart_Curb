import { c, mono } from "../theme";
import logo from "../assets/smartcurb-logo.jpg";

// Shared two-pane layout for Sign in and Create account.
function AuthShell({ children }) {
  return (
    <div className="sws-login" style={{ display: "flex", minHeight: "100dvh" }}>
      <div
        className="sws-login-brand"
        style={{
          flex: 1, padding: 56, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 32,
          background: `radial-gradient(120% 80% at 0% 100%, rgba(198, 242, 74, 0.07), transparent 60%), ${c.side}`,
          borderRight: `1px solid #16160F`,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 14 }}>
          <img src={logo} alt="Smart Curb logo" style={{ width: 132, height: 132, borderRadius: 14, objectFit: "cover" }} />
          <div>
            <div style={{ fontFamily: mono, fontSize: 14, fontWeight: 600, letterSpacing: 0.3 }}>SMART WHEEL STOP</div>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.4, color: c.dim }}>ADMIN CONSOLE</div>
          </div>
        </div>
        <div>
          <h1 style={{ fontFamily: mono, fontSize: 34, lineHeight: 1.2, margin: "0 0 14px", maxWidth: 520 }}>Every parking space, on one screen.</h1>
          <p style={{ color: c.navText, fontSize: 15, lineHeight: 1.6, margin: 0, maxWidth: 440 }}>
            Built for campuses, stadiums, airports, hospitals, and anywhere else with more cars than places to put them.
          </p>
        </div>
        <div className="sws-login-foot" style={{ fontSize: 12, color: c.dim }}>Smart Curb · FAU Engineering Senior Design</div>
      </div>

      <main className="sws-auth-pane" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: c.bg, padding: "40px 0" }}>
        {children}
      </main>
    </div>
  );
}

export default AuthShell;

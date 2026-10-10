import { Link } from "react-router-dom";
import { c, mono } from "../theme";
import logo from "../assets/smartcurb-logo.jpg";

function NotFound() {
  return (
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: c.bg, padding: 24 }}>
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12, alignItems: "center", maxWidth: 380 }}>
        <img src={logo} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover", marginBottom: 8 }} />
        <div style={{ fontFamily: mono, fontSize: 56, fontWeight: 600, color: c.accent, lineHeight: 1 }}>404</div>
        <h1 style={{ fontFamily: mono, fontSize: 18, fontWeight: 600, margin: 0 }}>This page doesn't exist</h1>
        <p style={{ fontSize: 13.5, color: c.dim, margin: 0, lineHeight: 1.55 }}>Check the address, or head back to the dashboard.</p>
        <Link to="/overview" className="sws-btn sws-btn-primary" style={{ marginTop: 10 }}>Go to Overview</Link>
      </div>
    </main>
  );
}

export default NotFound;

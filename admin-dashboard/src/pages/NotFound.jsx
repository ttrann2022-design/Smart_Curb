import { Link } from "react-router-dom";
import { c, mono } from "../theme";

function NotFound() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: c.bg, padding: 24 }}>
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
        <div style={{ fontFamily: mono, fontSize: 56, fontWeight: 600, color: c.accent }}>404</div>
        <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 600 }}>This page doesn't exist</div>
        <div style={{ fontSize: 13.5, color: c.dim }}>Check the address, or head back to the dashboard.</div>
        <Link to="/overview" style={{ marginTop: 8, height: 40, padding: "0 18px", borderRadius: 6, background: c.accent, color: c.onAccent, fontWeight: 600, fontSize: 13.5, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
          Go to Overview
        </Link>
      </div>
    </div>
  );
}

export default NotFound;

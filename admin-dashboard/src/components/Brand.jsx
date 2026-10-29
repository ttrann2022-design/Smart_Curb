import { c, mono } from "../theme";
import logo from "../assets/smartcurb-logo.jpg";

// Logo and wordmark for the sidebar and top bars (dashboard and company console).
// customer: the customer this dashboard is scoped to, shown under the label.
export function Brand({ size = 40, sub = "ADMIN DASHBOARD", customer }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <img src={logo} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: mono, fontSize: 12.5, fontWeight: 600, letterSpacing: 0.3, whiteSpace: "nowrap" }}>SMART WHEEL STOP</div>
        <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 1.4, color: c.dim }}>{sub}</div>
        {customer && <div className="sws-brand-customer" title={customer}>{customer}</div>}
      </div>
    </div>
  );
}

// Centred logo and message, for signing in and load errors.
export function FullScreen({ children }) {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: c.bg, padding: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, textAlign: "center", maxWidth: 380 }}>
        <img src={logo} alt="Smart Wheel Stop" width={64} height={64} style={{ width: 64, height: 64, borderRadius: 12, objectFit: "cover" }} />
        {children}
      </div>
    </div>
  );
}

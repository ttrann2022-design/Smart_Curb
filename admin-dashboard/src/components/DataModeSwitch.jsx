import { c } from "../theme";
import { DEMO_BUILD, setDataMode, useDataMode } from "../dataMode";

const options = [
  { id: "live", label: "Live" },
  { id: "sim", label: "Simulation" },
];

// Segmented Live / Simulation control. Used in the sidebar and on Settings.
function DataModeSwitch({ size = "sm" }) {
  const mode = useDataMode();
  const h = size === "lg" ? 40 : 32;

  if (DEMO_BUILD) {
    return <div style={{ fontSize: 12, color: c.sim }}>Demo site: simulated data only</div>;
  }

  return (
    <div role="radiogroup" aria-label="Data source" style={{ display: "flex", padding: 3, gap: 3, borderRadius: 7, background: c.bg, border: `1px solid ${c.line}` }}>
      {options.map((o) => {
        const active = mode === o.id;
        const tone = o.id === "sim" ? c.sim : c.accent;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setDataMode(o.id)}
            className="sws-seg"
            style={{
              flex: 1, height: h, borderRadius: 5, border: "none", cursor: active ? "default" : "pointer",
              fontSize: size === "lg" ? 13.5 : 12.5, fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              background: active ? (o.id === "sim" ? c.simBg : c.navBg) : "transparent",
              color: active ? tone : c.navText,
              boxShadow: active ? `inset 0 0 0 1px ${o.id === "sim" ? c.simLine : "#3A4A1F"}` : "none",
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: 4, background: active ? tone : c.line }} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default DataModeSwitch;

import { c, mono, LED_HEX } from "../theme";

// What the curb's LED panel would show: zone colour, brightness and the panel text.
// It draws the physical matrix (black panel, lit pixels), so its colours are
// hardware colours and stay the same in every site theme.
function LedPreview({ color, text, brightness = 100 }) {
  const hex = LED_HEX[color] || c.dim;
  const glow = 0.15 + 0.85 * (brightness / 100);
  return (
    <div
      role="img"
      aria-label={`Preview: ${color} panel at ${brightness}% brightness showing ${text || "no text"}`}
      style={{
        position: "relative", height: 64, borderRadius: 6, overflow: "hidden",
        background: "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1.4px) 0 0 / 5px 5px, #070706",
        border: `1px solid ${c.lineStrong}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: `inset 0 -3px 0 ${hex}`,
      }}
    >
      <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, background: hex, boxShadow: `0 0 14px ${hex}`, opacity: glow, transition: "opacity var(--dur-base) var(--ease-out)" }} />
      <span aria-hidden="true" style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 6, background: hex, boxShadow: `0 0 14px ${hex}`, opacity: glow, transition: "opacity var(--dur-base) var(--ease-out)" }} />
      <span style={{
        fontFamily: mono, fontWeight: 700, fontSize: text && text.length > 12 ? 15 : 19, letterSpacing: 2,
        color: text ? "#FFF6D8" : c.faint, textShadow: text ? `0 0 6px ${hex}, 0 0 14px ${hex}` : "none",
        padding: "0 18px", whiteSpace: "nowrap", overflow: "hidden", opacity: text ? glow : 1, transition: "opacity var(--dur-base) var(--ease-out)",
      }}>
        {text || "NO TEXT"}
      </span>
    </div>
  );
}

export default LedPreview;

// Colour tokens for inline styles. Each one is a CSS variable from src/themes.css,
// so components follow the site theme without knowing which one is active.
const v = (name) => `var(--${name})`;

export const c = {
  bg: v("bg"), side: v("side"), sideLine: v("side-line"), panel: v("panel"), panel2: v("panel-2"),
  line: v("line"), lineStrong: v("line-strong"),
  text: v("text"), dim: v("dim"), faint: v("faint"),
  // Brand accent for actions and identity. accent/onAccent are older aliases.
  brand: v("brand"), brandInk: v("brand-ink"), brandBg: v("brand-bg"), brandLine: v("brand-line"),
  accent: v("accent"), onAccent: v("on-accent"),
  // Message tones (success, error, warning). Curb status has its own fixed tokens in CSS.
  open: v("open"), busy: v("busy"), warn: v("warn"),
  openBg: v("open-bg"), openText: v("open-text"), busyBg: v("busy-bg"), busyLine: v("busy-line"), busyText: v("busy-text"),
  warnBg: v("warn-bg"), warnLine: v("warn-line"), warnText: v("warn-text"),
  navBg: v("nav-active-bg"), navText: v("nav-text"), card: v("card"), accentLine: v("accent-line"),
  // Simulation mode gets its own hue so it can never be mistaken for live data.
  sim: v("sim"), simBg: v("sim-bg"), simLine: v("sim-line"), simText: v("sim-text"),
};

export const mono = "'IBM Plex Mono', ui-monospace, monospace";

// Physical LED colours on the curb's panel. These are hardware colours, not
// theme colours, so they're the same in every theme.
export const LED_HEX = { red: "#E5483A", blue: "#3B7DD8", green: "#35A96B", gold: "#E0A63C", white: "#E8E6DE" };
export const LED_COLORS = Object.keys(LED_HEX);

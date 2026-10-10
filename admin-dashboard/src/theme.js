// Mirrors the CSS variables in index.css, for inline styles and SVG.
export const c = {
  bg: "#0F0F0D", side: "#090908", panel: "#171714", panel2: "#1A1A17", line: "#2B2B25", lineStrong: "#3A3A32",
  text: "#F2F1EA", dim: "#8E8C82", faint: "#5F5E56", accent: "#C6F24A", onAccent: "#12110F",
  open: "#8BD44A", busy: "#F2694C", warn: "#E0A63C",
  openBg: "#1C2612", openText: "#B4E86A", busyBg: "#221410", busyLine: "#4A2A20", busyText: "#FF8F74",
  warnBg: "#26200F", warnLine: "#4A3A1C", warnText: "#FFC078",
  navBg: "#232B15", navText: "#A5A399", card: "#1D1D19", accentLine: "#3A4A1F",
  // Simulation mode gets its own hue so it can never be mistaken for live data.
  sim: "#8FB4FF", simBg: "#121A2B", simLine: "#2A3B5E",
};

export const mono = "'IBM Plex Mono', ui-monospace, monospace";

export const LED_HEX = { red: "#E5483A", blue: "#3B7DD8", green: "#35A96B", gold: "#E0A63C", white: "#E8E6DE" };
export const LED_COLORS = Object.keys(LED_HEX);

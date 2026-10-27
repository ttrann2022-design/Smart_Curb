// WCAG contrast check for every site theme in src/themes.css.
//   npm run check:contrast
// Also runs inside scripts/check-build.mjs, so a deploy is blocked if any theme fails.
//
// Pairs checked, per theme (a theme inherits any token it doesn't set from lime):
//   - body text and muted text on the background and every surface (4.5:1)
//   - the accent: its button label on it, and accent-coloured text on surfaces (4.5:1)
//   - curb status colours on every surface they're drawn on: 3:1 as graphics,
//     4.5:1 where used as text (free counts, attention text)
//   - message tones (success, error, warning) and Simulation colours (4.5:1)
// Status colours are fixed on :root and may not be overridden by any theme. A theme
// whose own surfaces can't carry them (Paper) declares dark "status insets" with
// [data-theme="x"] :is(...), and the status checks run against those instead.
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { THEME_IDS } from "../src/themes.js";

const CSS = new URL("../src/themes.css", import.meta.url);
const STATUS = ["--free", "--occupied", "--attention", "--offline", "--offline-mark"];
const SURFACES = ["--bg", "--side", "--panel", "--panel-2", "--card"];
const DATA_SURFACES = ["--bg", "--panel", "--panel-2", "--card"];

function parse(css) {
  const blocks = [];
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const tokens = {};
    for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[name] = value.trim();
    blocks.push({ selector: selector.trim().replace(/\s+/g, " "), tokens });
  }
  return blocks;
}

function luminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Not a #RRGGBB colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// Every check for one theme: [group, fgToken, bgToken, minimum, tokens to read from].
function checksFor(theme, tokens, inset) {
  const out = [];
  const add = (group, fg, bgs, min, t = tokens) => bgs.forEach((bg) => out.push({ group, fg, bg, min, t }));

  add("Body text", "--text", SURFACES, 4.5);
  add("Muted text", "--dim", SURFACES, 4.5);
  add("Muted text", "--nav-text", ["--side", "--bg"], 4.5);

  add("Accent", "--brand-ink", ["--brand", "--brand-hover"], 4.5);
  add("Accent", "--brand", ["--bg", "--side", "--panel", "--brand-bg"], 4.5);

  // Status colours sit on the theme's data surfaces, or on its dark insets if it has them.
  const statusTokens = inset || tokens;
  const statusSurfaces = [...DATA_SURFACES, ...(tokens["--status-ring"] ? ["--status-ring"] : [])];
  for (const s of ["--free", "--occupied", "--attention", "--offline-mark"]) add("Status graphics", s, statusSurfaces, 3, statusTokens);
  add("Status graphics", "--offline-mark", ["--offline"], 3, statusTokens);
  for (const s of ["--free", "--occupied", "--attention"]) add("Status as text", s, DATA_SURFACES, 4.5, statusTokens);
  if (inset) {
    add("Inset text", "--text", DATA_SURFACES, 4.5, inset);
    add("Inset text", "--dim", DATA_SURFACES, 4.5, inset);
    // Accent used inside an inset (active sort, links, buttons).
    add("Inset text", "--brand", [...DATA_SURFACES, "--brand-bg"], 4.5, inset);
    add("Inset text", "--brand-ink", ["--brand", "--brand-hover"], 4.5, inset);
  }

  add("Message tones", "--open-text", ["--open-bg"], 4.5);
  add("Message tones", "--busy-text", ["--busy-bg"], 4.5);
  add("Message tones", "--warn-text", ["--warn-bg"], 4.5);
  add("Message tones", "--open", ["--bg", "--panel"], 4.5);
  add("Message tones", "--busy", ["--bg", "--panel", "--busy-bg"], 4.5);
  add("Message tones", "--warn", ["--bg", "--panel", "--warn-bg"], 4.5);

  add("Simulation", "--sim", ["--sim-bg", "--bg", "--side"], 4.5);
  add("Simulation", "--sim-text", ["--sim-bg"], 4.5);
  add("Simulation", "--sim-ink", ["--sim", "--sim-hover"], 4.5);

  return out.map((c) => ({ ...c, theme, ratio: contrast(c.t[c.fg], c.t[c.bg]) }));
}

export function checkContrast(css = readFileSync(CSS, "utf8")) {
  const blocks = parse(css);
  const problems = [];
  const fixed = Object.assign({}, ...blocks.filter((b) => b.selector === ":root").map((b) => b.tokens));
  const lime = blocks.find((b) => b.selector.split(",").map((s) => s.trim()).includes('[data-theme="lime"]'));
  if (!lime) problems.push("themes.css has no lime block.");

  for (const b of blocks) {
    if (b.selector === ":root") continue;
    const overridden = STATUS.filter((s) => s in b.tokens);
    if (overridden.length) problems.push(`${b.selector} overrides fixed status colour(s) ${overridden.join(", ")}.`);
  }

  const results = [];
  for (const theme of THEME_IDS) {
    const own = theme === "lime" ? lime : blocks.find((b) => b.selector === `[data-theme="${theme}"]`);
    if (!own) { problems.push(`themes.css has no [data-theme="${theme}"] block.`); continue; }
    const tokens = { ...fixed, ...lime.tokens, ...own.tokens };
    const insetBlock = blocks.find((b) => b.selector.startsWith(`[data-theme="${theme}"] :is(`));
    const inset = insetBlock ? { ...tokens, ...insetBlock.tokens } : null;
    results.push(...checksFor(theme, tokens, inset));
  }
  const failures = results.filter((r) => r.ratio < r.min);
  return { results, failures, problems };
}

function report({ results, failures, problems }) {
  const groups = [...new Set(results.map((r) => r.group))];
  const pad = (s, n) => String(s).padEnd(n);
  const W = 24;
  console.log(`\n  Contrast by theme (lowest ratio in each group, minimum in brackets)\n`);
  console.log("  " + pad("", W) + THEME_IDS.map((t) => pad(t, 11)).join(""));
  for (const g of groups) {
    const min = results.find((r) => r.group === g).min;
    const row = THEME_IDS.map((t) => {
      const rs = results.filter((r) => r.group === g && r.theme === t);
      if (!rs.length) return pad("–", 11);
      const low = Math.min(...rs.map((r) => r.ratio));
      return pad(`${low.toFixed(2)}${rs.some((r) => r.ratio < r.min) ? " ✗" : ""}`, 11);
    }).join("");
    console.log("  " + pad(`${g} [${min}]`, W) + row);
  }
  console.log(`\n  ${results.length} pairs checked across ${THEME_IDS.length} themes.`);
  problems.forEach((p) => console.error(`  PROBLEM: ${p}`));
  failures.forEach((f) => console.error(`  FAIL ${f.theme}: ${f.fg} on ${f.bg} = ${f.ratio.toFixed(2)}:1 (needs ${f.min}:1)`));
  return failures.length === 0 && problems.length === 0;
}

// Run directly: print the table and exit non-zero on any failure.
if (import.meta.url === pathToFileURL(process.argv[1] || "").href || fileURLToPath(import.meta.url) === process.argv[1]) {
  const ok = report(checkContrast());
  if (!ok) { console.error("\n  CONTRAST CHECK FAILED\n"); process.exit(1); }
  console.log("  All pairs pass.\n");
}

export { report };

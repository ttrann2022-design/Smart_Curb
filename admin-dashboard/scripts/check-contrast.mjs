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
//   - small labels listed in LABELS, using the colour their rule in index.css sets (4.5:1)
//   - the company console's text, badges and chips (CONSOLE_RULES, read from
//     src/console/console.css), and that its curb status marks are inset or ringed on Paper
// Status colours are fixed on :root and may not be overridden by any theme. A theme
// whose own surfaces can't carry them (Paper) declares dark "status insets" with
// [data-theme="x"] :is(...), and the status checks run against those instead.
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { THEME_IDS } from "../src/themes.js";

const CSS = new URL("../src/themes.css", import.meta.url);
const APP_CSS = new URL("../src/index.css", import.meta.url);
// Small labels that once used --faint and fell below 4.5:1. Their colour is read
// from index.css, so swapping one back to a fainter token fails the check.
// inset: the label sits inside a Paper status inset, so it's checked on those tokens.
const LABELS = [
  { selector: ".sws-nav-badge", name: "nav badge", surfaces: ["--side", "--bg"] },
  { selector: ".lp-readout-k", name: "lot plan Last change", surfaces: ["--bg", "--panel", "--panel-2", "--card"], inset: true },
  { selector: ".un-meta", name: "units count", surfaces: ["--bg", "--panel", "--panel-2", "--card"], inset: true },
];
// The company console (src/console/console.css) uses the same themes. Each rule
// below is read from that file: its colour is checked on its own background if it
// sets one, otherwise on the surfaces listed. Swapping a token for a fainter one fails.
const CONSOLE_CSS = new URL("../src/console/console.css", import.meta.url);
const PANELS = ["--panel", "--panel-2", "--card"];
const PAGE = ["--bg", ...PANELS];
const CONSOLE_RULES = [
  // Text
  { selector: ".cn-dim", surfaces: PAGE },
  { selector: ".cn-warn", surfaces: PAGE },
  { selector: ".cn-issue-off", surfaces: PANELS },
  { selector: ".cn-k", surfaces: PANELS },
  { selector: ".cn-cc-type", surfaces: ["--panel"] },
  { selector: ".cn-cc-foot", surfaces: ["--panel"] },
  { selector: ".cn-hero-line", surfaces: ["--bg"] },
  { selector: ".cn-hero-facts", surfaces: ["--bg"] },
  { selector: ".cn-pipe-s", surfaces: ["--panel"] },
  { selector: ".cn-health.is-empty", surfaces: PANELS },
  { selector: ".cn-health-key", surfaces: PANELS },
  { selector: ".cn-lot-meta", surfaces: ["--panel-2"] },
  { selector: ".cn-lot-empty", surfaces: PAGE },
  { selector: ".cn-empty-text", surfaces: ["--panel"] },
  { selector: ".rq-when", surfaces: ["--panel"] },
  { selector: ".rq-meta", surfaces: ["--panel"] },
  { selector: ".rq-msg", surfaces: [] },
  { selector: ".rq-msg.is-empty", surfaces: ["--panel"] },
  { selector: ".rq-seg-opt", surfaces: ["--bg"] },
  { selector: ".cn-more > summary", surfaces: PANELS },
  // Badges, chips and tinted marks (colour on their own background)
  { selector: ".cn-status.is-prospect" },
  { selector: ".cn-status.is-active" },
  { selector: ".cn-status.is-paused" },
  { selector: ".cn-call.is-off" },
  { selector: ".cn-call.is-low" },
  { selector: ".cn-call.is-ok" },
  { selector: ".rq-badge.is-won" },
  { selector: ".rq-badge.is-contacted" },
  { selector: ".rq-badge.is-closed" },
  { selector: ".im-badge.is-new" },
  { selector: ".im-badge.is-update" },
  { selector: ".im-badge.is-error" },
  { selector: ".im-badge.is-plain" },
  { selector: ".sws-nav-badge.is-count" },
  { selector: ".cn-sim-badge" },
  { selector: ".cn-empty-icon" },
  { selector: ".cn-empty.is-ok .cn-empty-icon" },
  { selector: ".rq-seg-opt.is-new:has(input:checked)" },
  // A highlighted curb row: body text on the selection tint.
  { selector: ".cn-curb.is-sel", fg: "--text" },
];
// Console parts that draw curb status in the fixed colours. Paper must either turn
// them into a dark status inset (themes.css) or ring them with --status-ring (console.css).
const CONSOLE_STATUS_INSETS = [".cn-health-bar", ".cn-dots"];
const CONSOLE_STATUS_RINGED = [".cn-dot"];
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
function checksFor(theme, tokens, inset, labels = [], consoleRules = []) {
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

  for (const l of labels) add("Labels", l.token, l.surfaces, 4.5, l.inset && inset ? inset : tokens);

  for (const r of consoleRules) add(r.own ? "Console badges" : "Console text", r.fg, r.surfaces, 4.5);

  return out.map((c) => ({ ...c, theme, ratio: contrast(hex(c.t, c.fg), hex(c.t, c.bg)) }));
}

// A token's colour, following aliases such as --nav-active-bg: var(--brand-bg).
function hex(tokens, name) {
  let value = tokens[name];
  for (let i = 0; i < 5 && /^var\(/.test(value || ""); i++) value = tokens[value.slice(4, -1).trim()];
  return value;
}

// Every rule in a stylesheet as { selectors, body }, comments removed. Rules inside
// @media come after the base rule, so the first match is the base one.
function rules(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({ selectors: sel.split(",").map((x) => x.trim().replace(/\s+/g, " ")), body }));
}

// The console rules to check, each with the colour and background its rule in
// console.css sets, plus the structural rules for curb status on Paper.
function consoleChecks(consoleCss, themesCss, problems) {
  const all = rules(consoleCss);
  const checks = CONSOLE_RULES.flatMap((c) => {
    const rule = all.find((r) => r.selectors.includes(c.selector));
    if (!rule) { problems.push(`console.css has no "${c.selector}" rule.`); return []; }
    const fg = c.fg || /(?<![-\w])color:\s*var\((--[\w-]+)\)/.exec(rule.body)?.[1];
    const bg = /(?<![-\w])background(?:-color)?:\s*var\((--[\w-]+)\)/.exec(rule.body)?.[1];
    if (!fg) { problems.push(`console.css "${c.selector}" has no "color: var(--…)".`); return []; }
    const surfaces = bg ? [bg] : c.surfaces || [];
    if (!surfaces.length) { problems.push(`console.css "${c.selector}" sets no background and the check lists no surfaces.`); return []; }
    return [{ selector: c.selector, fg, surfaces, own: !!bg && !c.surfaces }];
  });
  const insetList = /\[data-theme="paper"\] :is\(([^)]*)\)/.exec(themesCss.replace(/\/\*[\s\S]*?\*\//g, ""))?.[1].split(",").map((x) => x.trim()) || [];
  for (const sel of CONSOLE_STATUS_INSETS) {
    if (!insetList.includes(sel)) problems.push(`${sel} draws curb status but isn't one of Paper's status insets in themes.css.`);
  }
  for (const sel of CONSOLE_STATUS_RINGED) {
    const ringed = all.some((r) => r.selectors.some((x) => x.includes('[data-theme="paper"]') && x.endsWith(sel)) && r.body.includes("var(--status-ring)"));
    if (!ringed) problems.push(`${sel} draws curb status on light rows but has no Paper --status-ring rule in console.css.`);
  }
  return checks;
}

// The colour token each label's base rule uses in index.css.
function labelTokens(appCss, problems) {
  appCss = appCss.replace(/\/\*[\s\S]*?\*\//g, "");
  return LABELS.flatMap((l) => {
    const esc = l.selector.replace(/[.-]/g, "\\$&");
    const rule = new RegExp(`(?:^|\\n)\\s*${esc}\\s*\\{([^}]*)\\}`).exec(appCss);
    const token = rule && /(?:^|;)\s*color:\s*var\((--[\w-]+)\)/.exec(rule[1])?.[1];
    if (!token) { problems.push(`index.css has no "${l.selector} { color: var(--…) }" rule for the ${l.name}.`); return []; }
    return [{ ...l, token }];
  });
}

export function checkContrast(css = readFileSync(CSS, "utf8"), appCss = readFileSync(APP_CSS, "utf8"), consoleCss = readFileSync(CONSOLE_CSS, "utf8")) {
  const blocks = parse(css);
  const problems = [];
  const labels = labelTokens(appCss, problems);
  const consoleRules = consoleChecks(consoleCss, css, problems);
  const fixed = Object.assign({}, ...blocks.filter((b) => b.selector === ":root").map((b) => b.tokens));
  const aliases = blocks.find((b) => b.selector === ":root, [data-theme]")?.tokens || {};
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
    const tokens = { ...fixed, ...aliases, ...lime.tokens, ...own.tokens };
    const insetBlock = blocks.find((b) => b.selector.startsWith(`[data-theme="${theme}"] :is(`));
    const inset = insetBlock ? { ...tokens, ...insetBlock.tokens } : null;
    results.push(...checksFor(theme, tokens, inset, labels, consoleRules));
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

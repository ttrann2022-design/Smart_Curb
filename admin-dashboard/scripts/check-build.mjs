// Refuses to let a deploy go ahead unless the folder holds the right kind of build
// and every site theme passes the WCAG contrast check (scripts/check-contrast.mjs).
//   node scripts/check-build.mjs dist real
//   node scripts/check-build.mjs dist-demo demo
//   node scripts/check-build.mjs dist-console console
// Runs automatically as a Firebase predeploy hook (see firebase.json, firebase.demo.json
// and firebase.console.json).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { checkContrast, report } from "./check-contrast.mjs";
import { CONSOLE_MARKER } from "../src/console/constants.js";

const BUILD_CMD = { real: "npm run build", demo: "npm run build:demo", console: "npm run build:console" };

// Text that only the customer dashboard's own pages contain (Layout, Lots,
// Simulation, Landing). None of it may reach the console bundle.
const DASHBOARD_MARKERS = [
  "Open lot sign",
  "Pick a lot, then a curb to see its status",
  "Load fresh simulated data",
  "Tell us about your parking",
  "A dashboard built around the curbs",
];

// Text from the console's own pages (Requests, Customers, Deployments, Home).
// None of it may reach a customer bundle; quote requests live only in the console.
const CONSOLE_PAGE_MARKERS = [
  "Convert to customer",
  "Lots without a customer",
  "Reload demo customers",
  "Assign a lot",
  "Open spots keep coming from the curbs",
];

const [dir, expected] = process.argv.slice(2);

function fail(msg) {
  console.error(`\n  DEPLOY BLOCKED: ${msg}\n`);
  process.exit(1);
}

if (!dir || !Object.keys(BUILD_CMD).includes(expected)) {
  fail("usage: node scripts/check-build.mjs <dir> real|demo|console");
}

let info;
try {
  info = JSON.parse(readFileSync(join(dir, "build-info.json"), "utf8"));
} catch {
  fail(`${dir}/ has no build-info.json. Run ${BUILD_CMD[expected]} first.`);
}

// Builds from before the console existed have no "app" field: they're the dashboard.
const isConsole = info.app === "console";
const isDemo = info.demo === true || info.dataRoot !== "";
if (expected !== "console" && isConsole) {
  fail(`${dir}/ holds a COMPANY CONSOLE build (built ${info.builtAt}). Run ${BUILD_CMD[expected]} first.`);
}
if (expected === "console" && !isConsole) {
  fail(`${dir}/ holds a customer dashboard build, not the console. Run npm run build:console first.`);
}
if (expected === "console" && isDemo) {
  fail(`${dir}/ is a console build with demo settings. The console switches Live/Simulation itself; build it with npm run build:console only.`);
}
if (expected === "real" && isDemo) {
  fail(`${dir}/ holds a DEMO build (built ${info.builtAt}). Run npm run build before deploying the real site.`);
}
if (expected === "demo" && !isDemo) {
  fail(`${dir}/ holds a REAL build, not a demo build. Run npm run build:demo first.`);
}

// Neither app may carry the other's code. Look inside every script the build emitted.
const scripts = readdirSync(join(dir, "assets"))
  .filter((f) => f.endsWith(".js"))
  .map((f) => readFileSync(join(dir, "assets", f), "utf8"));
const bundle = scripts.join("\n");
if (!scripts.length) fail(`${dir}/assets has no scripts. Run ${BUILD_CMD[expected]} again.`);
if (expected === "console") {
  if (!bundle.includes(CONSOLE_MARKER)) fail(`${dir}/ doesn't contain the console marker "${CONSOLE_MARKER}".`);
  const leaked = DASHBOARD_MARKERS.filter((m) => bundle.includes(m));
  if (leaked.length) fail(`the console bundle contains customer dashboard code: ${leaked.map((m) => `"${m}"`).join(", ")}.`);
  const absent = CONSOLE_PAGE_MARKERS.filter((m) => !bundle.includes(m));
  if (absent.length) fail(`the console bundle is missing its own pages' text: ${absent.map((m) => `"${m}"`).join(", ")}. If you changed that text, update CONSOLE_PAGE_MARKERS in scripts/check-build.mjs.`);
} else {
  if (bundle.includes(CONSOLE_MARKER)) fail(`the ${expected} bundle contains company console code ("${CONSOLE_MARKER}").`);
  const leaked = CONSOLE_PAGE_MARKERS.filter((m) => bundle.includes(m));
  if (leaked.length) fail(`the ${expected} bundle contains company console pages: ${leaked.map((m) => `"${m}"`).join(", ")}.`);
  const missing = DASHBOARD_MARKERS.filter((m) => !bundle.includes(m));
  if (missing.length) fail(`the ${expected} bundle is missing dashboard text it should have: ${missing.map((m) => `"${m}"`).join(", ")}. If you changed that text, update DASHBOARD_MARKERS in scripts/check-build.mjs.`);
}

if (!report(checkContrast())) {
  fail("a site theme fails the contrast check (see above). Fix src/themes.css, then rebuild.");
}

console.log(`  Build check passed: ${dir}/ is a ${expected} build from ${info.builtAt}.`);

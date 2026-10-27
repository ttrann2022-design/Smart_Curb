// Refuses to let a deploy go ahead unless the folder holds the right kind of build
// and every site theme passes the WCAG contrast check (scripts/check-contrast.mjs).
//   node scripts/check-build.mjs dist real
//   node scripts/check-build.mjs dist-demo demo
// Runs automatically as a Firebase predeploy hook (see firebase.json and firebase.demo.json).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkContrast, report } from "./check-contrast.mjs";

const [dir, expected] = process.argv.slice(2);

function fail(msg) {
  console.error(`\n  DEPLOY BLOCKED: ${msg}\n`);
  process.exit(1);
}

if (!dir || !["real", "demo"].includes(expected)) {
  fail("usage: node scripts/check-build.mjs <dir> real|demo");
}

let info;
try {
  info = JSON.parse(readFileSync(join(dir, "build-info.json"), "utf8"));
} catch {
  fail(`${dir}/ has no build-info.json. Run ${expected === "demo" ? "npm run build:demo" : "npm run build"} first.`);
}

const isDemo = info.demo === true || info.dataRoot !== "";
if (expected === "real" && isDemo) {
  fail(`${dir}/ holds a DEMO build (built ${info.builtAt}). Run npm run build before deploying the real site.`);
}
if (expected === "demo" && !isDemo) {
  fail(`${dir}/ holds a REAL build, not a demo build. Run npm run build:demo first.`);
}

if (!report(checkContrast())) {
  fail("a site theme fails the contrast check (see above). Fix src/themes.css, then rebuild.");
}

console.log(`  Build check passed: ${dir}/ is a ${expected} build from ${info.builtAt}.`);

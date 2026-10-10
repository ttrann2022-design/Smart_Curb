// Refuses to let a deploy go ahead unless the folder holds the right kind of build.
//   node scripts/check-build.mjs dist real
//   node scripts/check-build.mjs dist-demo demo
// Runs automatically as a Firebase predeploy hook (see firebase.json and firebase.demo.json).
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

console.log(`  Build check passed: ${dir}/ is a ${expected} build from ${info.builtAt}.`);

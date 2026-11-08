// Firebase uploads only functions/, so the runner and evaluator are copied in before a
// deploy (the predeploy hook in firebase.functions.json runs this). functions/vendor/ is
// generated and not committed: edit scheduler/ and shared/, never the copies.
import { cpSync, mkdirSync, rmSync } from "node:fs";

const VENDOR = new URL("../functions/vendor/", import.meta.url);
rmSync(VENDOR, { recursive: true, force: true });
for (const [from, to] of [["../scheduler/runOnce.js", "scheduler/runOnce.js"], ["../shared/schedule.js", "shared/schedule.js"]]) {
  mkdirSync(new URL(to.replace(/[^/]+$/, ""), VENDOR), { recursive: true });
  cpSync(new URL(from, import.meta.url), new URL(to, VENDOR));
}
console.log("  Copied the timed-states runner into functions/vendor/.");

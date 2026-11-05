// npm run scheduler:once: one pass of the timed-states runner against the local Realtime
// Database emulator (start it first with npm run emulators). It refuses any other host.
//
//   npm run scheduler:once
//   npm run scheduler:once -- --at 2026-11-06T23:00:00-05:00    pretend it's another time
//
// Uses the emulator's REST API with its admin token, so like the Admin SDK it skips the
// rules, and it needs no extra packages.
import { pathToFileURL } from "node:url";
import { runOnce } from "./runOnce.js";

const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9000";
const NS = process.env.SCHEDULER_NAMESPACE || "smartcurb-d174e-default-rtdb";
const HEADERS = { Authorization: "Bearer owner" };

function emulatorDb(host = HOST, ns = NS) {
  if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)) throw new Error(`Refusing to run against ${host}: only a local emulator is allowed.`);
  const url = (path) => `http://${host}/${path}.json?ns=${ns}`;
  const check = async (res) => {
    if (!res.ok) throw new Error(`Database said ${res.status}: ${await res.text()}`);
    return res.json();
  };
  return {
    read: (path) => fetch(url(path), { headers: HEADERS }).then(check),
    write: (updates) => fetch(url(""), { method: "PATCH", headers: HEADERS, body: JSON.stringify(updates) }).then(check),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const i = process.argv.indexOf("--at");
  const now = i > 0 ? Date.parse(process.argv[i + 1]) : Date.now();
  if (Number.isNaN(now)) { console.error("--at needs a date and time, like 2026-11-06T23:00:00-05:00"); process.exit(1); }
  const result = await runOnce({ ...emulatorDb(), now });
  console.log(`Timed states, ${new Date(now).toISOString()}:`);
  if (!result.sites.length) console.log("  No site is switched on.");
  for (const s of result.sites) {
    console.log(`  ${s.siteId}: ${s.error || `${s.changed} curbs changed, ${s.unchanged} unchanged, ${s.failed} failed`}`);
  }
  if (result.sites.some((s) => s.error || s.failed)) process.exitCode = 1;
}

// One pass of the timed-states runner, shared by every wrapper: the Cloud Function
// (functions/index.js), npm run scheduler:once (scheduler/once.mjs) and the dashboard's
// Apply now button (src/schedules.js). Each passes in how to read and write:
//   read(path)      -> the value there, or null
//   write(updates)  -> one multi-path update at the database root
//
// For each enabled site, for each curb in that site's lots, it works out the effective
// look. When that differs from what was last applied, it writes the same three fields
// the manual LED control writes (units/<id>/ledColor, panelText, ledBrightness) and
// records the key, so the Receiver needs no change and a manual LED edit stays until
// the next scheduled change. Disabled sites aren't touched. Live data only: Simulation
// never goes through here.
import { effectiveLook, isTimezone, settingsErrors } from "../shared/schedule.js";

export const BATCH_SIZE = 100; // curbs per multi-path write (4 paths each)

const obj = (x) => (x && typeof x === "object" ? x : {});

// The paths one curb's change writes. Applied goes in the same write, so a refused or
// failed write is simply tried again on the next run.
function updatesFor(siteId, unitId, look, key, now) {
  return {
    [`units/${unitId}/ledColor`]: look.ledColor,
    [`units/${unitId}/panelText`]: look.panelText,
    [`units/${unitId}/ledBrightness`]: look.ledBrightness,
    [`schedules/${siteId}/applied/${unitId}`]: { key, at: now },
  };
}

// Writes in batches. A refused batch retries curb by curb, so one bad curb can't hold
// up the rest. Returns how many curbs landed and how many failed.
async function writeBatches(changes, write, batchSize) {
  let changed = 0;
  let failed = 0;
  for (let i = 0; i < changes.length; i += batchSize) {
    const batch = changes.slice(i, i + batchSize);
    try {
      await write(Object.assign({}, ...batch));
      changed += batch.length;
    } catch {
      for (const one of batch) {
        try { await write(one); changed += 1; } catch { failed += 1; }
      }
    }
  }
  return { changed, failed };
}

export async function runOnce({ read, write, now = Date.now(), siteIds, batchSize = BATCH_SIZE }) {
  // Only platform admins and the Admin SDK can read schedules/ whole; the dashboard asks
  // for its own site.
  const schedules = siteIds
    ? Object.fromEntries(await Promise.all(siteIds.map(async (id) => [id, await read(`schedules/${id}`)])))
    : obj(await read("schedules"));

  const enabled = Object.entries(obj(schedules)).filter(([, s]) => s?.settings?.enabled === true);
  // Curbs can be large records and this runs every minute: don't fetch them for nothing.
  if (!enabled.length) return { at: now, sites: [] };

  const [lots, units] = await Promise.all([read("lots"), read("units")]).then((r) => r.map(obj));
  const sites = [];
  for (const [siteId, schedule] of enabled) {
    const row = { siteId, changed: 0, unchanged: 0, failed: 0 };
    sites.push(row);
    const { settings, rules, applied } = schedule;
    if (!isTimezone(settings.timezone)) { row.error = `Invalid timezone: ${settings.timezone}`; continue; }
    if (settingsErrors(settings).default) { row.error = "No valid default look, so nothing was written."; continue; }

    const changes = [];
    for (const [unitId, unit] of Object.entries(units)) {
      const lotId = unit && typeof unit === "object" ? unit.lot : null;
      if (typeof lotId !== "string" || !Object.hasOwn(lots, lotId) || lots[lotId]?.siteId !== siteId) continue;
      const result = effectiveLook(unitId, lotId, rules, settings, now, { withNext: false });
      if (!result?.look) continue;
      if (obj(applied)[unitId]?.key === result.key) { row.unchanged += 1; continue; }
      changes.push(updatesFor(siteId, unitId, result.look, result.key, now));
    }
    Object.assign(row, await writeBatches(changes, write, batchSize));
  }
  return { at: now, sites };
}

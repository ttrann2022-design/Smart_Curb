// Cloud Function: the timed-states runner, once a minute. The curbs have no clock, so
// this applies each scheduled LED look when it's due, through the Admin SDK (which skips
// the database rules, as the hardware Receiver's secret does).
//
// Deploy with: firebase deploy --only functions --config firebase.functions.json
// (the predeploy hook copies scheduler/ and shared/ into vendor/ first).
import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { runOnce } from "./vendor/scheduler/runOnce.js";

initializeApp();

export const applyTimedStates = onSchedule({
  schedule: "every 1 minutes",
  timeZone: "Etc/UTC",
  // The next run is a minute away and does the same work, so a failed run needn't retry.
  retryCount: 0,
  timeoutSeconds: 55,
  memory: "256MiB",
}, async () => {
  const db = getDatabase();
  const result = await runOnce({
    read: async (path) => (await db.ref(path).get()).val(),
    write: (updates) => db.ref().update(updates),
  });
  for (const site of result.sites) {
    if (site.error || site.failed) logger.error("Timed states had a problem", site);
    else if (site.changed) logger.info("Timed states applied", site);
  }
});

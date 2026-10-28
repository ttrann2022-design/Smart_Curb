// Answer functions for the rule-based assistant. Each takes the context
//   { lots, units, alerts, now, mode: "live" | "sim", role: "viewer" | "operator" | "manager" }
// and the entities the matcher found ({ curbId, lotId }), and returns the reply
// text, or { text, chips } to replace the intent's usual follow-up chips.
// Nothing here writes to the database.
import { DEFAULT_ALERTS, batteryText, cleanText, formatAgo, hasBattery, isLowBattery, isStale, unitIssues } from "../unitStatus.js";
import { curbEntries, curbsWithoutLot, listCurbs, lotName, lotViews, plural, sourceLine } from "./data.js";

const alertsOf = (ctx) => ({ ...DEFAULT_ALERTS, ...(ctx.alerts || {}) });
const ROLE_NAME = { viewer: "a viewer", operator: "an operator", manager: "a manager" };
const roleText = (ctx) => ROLE_NAME[ctx.role] || "signed in without a role yet";
const canOperate = (ctx) => ctx.role === "operator" || ctx.role === "manager";
const isManager = (ctx) => ctx.role === "manager";

// Role notes for how-to answers.
const ASK_MANAGER = "Ask a manager: Users & roles lists who they are.";
const needOperator = (ctx, what) =>
  canOperate(ctx) ? "" : `\n\nYou're ${roleText(ctx)}, so you can see ${what} but not change it. ${ASK_MANAGER} They can make you an operator.`;
const needManager = (ctx, what) =>
  isManager(ctx) ? "" : `\n\nOnly managers can ${what}, and you're ${roleText(ctx)}. ${ASK_MANAGER}`;

// Status answers need some data first.
function noData(ctx) {
  if (Object.keys(ctx.lots || {}).length || curbEntries(ctx.units).length) return null;
  return ctx.mode === "sim"
    ? "I don't see any simulated lots or curbs yet. An operator or manager can load them on the Simulation page with Load fresh simulated data."
    : "I don't see any lots or curbs in the live data yet. They appear once the Receiver reports and lots are added.";
}
const withSource = (ctx, text, entries) => `${text}\n\n${sourceLine(ctx, entries)}`;

const spots = (n) => plural(n, "free spot");

// ---------- Status ----------

export function freeTotal(ctx) {
  const empty = noData(ctx);
  if (empty) return empty;
  const lots = lotViews(ctx);
  const open = lots.reduce((s, l) => s + l.open, 0);
  const total = lots.reduce((s, l) => s + l.total, 0);
  const lines = lots.map((l) => `• ${l.name}: ${l.open} of ${l.total}`).join("\n");
  return withSource(ctx, `${open} of ${total} spots are free across ${plural(lots.length, "lot")}:\n${lines}`);
}

export function freeInLot(ctx, ent) {
  const empty = noData(ctx);
  if (empty) return empty;
  const lot = lotViews(ctx).find((l) => l.id === ent.lotId);
  if (!lot) return freeByLot(ctx);
  let text;
  if (lot.total === 0) text = `${lot.name} has no curbs reporting yet, so I can't count its spots.`;
  else if (lot.open === 0) text = `${lot.name} is full: none of its ${lot.total} spots are free${lot.offline ? ` (${lot.offline} offline)` : ""}.`;
  else text = `${lot.name} has ${spots(lot.open)} out of ${lot.total}${lot.offline ? `, with ${lot.offline} offline` : ""}.`;
  return withSource(ctx, text, lot.curbs);
}

export function freeByLot(ctx) {
  const empty = noData(ctx);
  if (empty) return empty;
  const lots = lotViews(ctx);
  const lines = lots.map((l) => `• ${l.name}: ${l.open} free, ${l.occupied} occupied${l.offline ? `, ${l.offline} offline` : ""}`).join("\n");
  return withSource(ctx, `Free spots in each lot:\n${lines}`);
}

export function bestLot(ctx) {
  const empty = noData(ctx);
  if (empty) return empty;
  const best = [...lotViews(ctx)].sort((a, b) => b.open - a.open)[0];
  if (!best || best.open === 0) return withSource(ctx, "Every lot is full right now: there are no free spots anywhere.");
  return withSource(ctx, `${best.name} has the most room, with ${spots(best.open)} out of ${best.total}.`, best.curbs);
}

export function busiestLot(ctx) {
  const empty = noData(ctx);
  if (empty) return empty;
  const lots = lotViews(ctx).filter((l) => l.pctFull !== null).sort((a, b) => b.pctFull - a.pctFull);
  if (!lots.length) return withSource(ctx, "No lot has a curb reporting right now, so I can't tell which is busiest.");
  const [top] = lots;
  return withSource(ctx, `${top.name} is the busiest at ${top.pctFull}% full, with ${spots(top.open)} left.`, top.curbs);
}

export function fullLots(ctx) {
  const empty = noData(ctx);
  if (empty) return empty;
  const lots = lotViews(ctx).filter((l) => l.total > 0);
  const full = lots.filter((l) => l.open === 0);
  if (!full.length) return withSource(ctx, `No lot is full. Every lot with curbs has at least one free spot.`);
  return withSource(ctx, `${plural(full.length, "lot is", "lots are")} full right now:\n${full.map((l) => `• ${l.name} (${l.total} spots)`).join("\n")}`);
}

export function occupancyRate(ctx) {
  const empty = noData(ctx);
  if (empty) return empty;
  const lots = lotViews(ctx);
  const reporting = lots.reduce((s, l) => s + l.open + l.occupied, 0);
  const occupied = lots.reduce((s, l) => s + l.occupied, 0);
  if (!reporting) return withSource(ctx, "No curb is reporting right now, so I can't work out how full the site is.");
  const lines = lots.filter((l) => l.pctFull !== null).map((l) => `• ${l.name}: ${l.pctFull}%`).join("\n");
  return withSource(ctx, `The site is ${Math.round((occupied / reporting) * 100)}% full: ${occupied} of ${reporting} reporting curbs are occupied.\n${lines}`);
}

export function occupiedCount(ctx) {
  const empty = noData(ctx);
  if (empty) return empty;
  const lots = lotViews(ctx);
  const occupied = lots.reduce((s, l) => s + l.occupied, 0);
  const lines = lots.map((l) => `• ${l.name}: ${l.occupied}`).join("\n");
  return withSource(ctx, `${plural(occupied, "spot is", "spots are")} occupied:\n${lines}`);
}

export function offlineCurbs(ctx) {
  const empty = noData(ctx);
  if (empty) return empty;
  const off = curbEntries(ctx.units).filter(([, u]) => !u.online);
  if (!off.length) return withSource(ctx, "Every curb is online and reporting.");
  return withSource(ctx, `${plural(off.length, "curb is", "curbs are")} offline:\n${listCurbs(ctx, off, (u) => (typeof u.lastUpdated === "number" ? `last heard ${formatAgo(u.lastUpdated, ctx.now)}` : ""))}`);
}

export function onlineCount(ctx) {
  const empty = noData(ctx);
  if (empty) return empty;
  const all = curbEntries(ctx.units);
  const on = all.filter(([, u]) => u.online).length;
  return withSource(ctx, `${on} of ${plural(all.length, "curb")} ${on === 1 ? "is" : "are"} online and reporting${on < all.length ? `; ${all.length - on} offline` : ""}.`);
}

export function lowBattery(ctx) {
  const empty = noData(ctx);
  if (empty) return empty;
  const alerts = alertsOf(ctx);
  const low = curbEntries(ctx.units).filter(([, u]) => isLowBattery(u, alerts)).sort(([, a], [, b]) => a.battery - b.battery);
  if (!low.length) return withSource(ctx, `No curb is low on battery. Every measured curb is at ${alerts.lowBattery}% or above.`);
  return withSource(ctx, `${plural(low.length, "curb is", "curbs are")} below ${alerts.lowBattery}% battery:\n${listCurbs(ctx, low, (u) => `${u.battery}%`)}`);
}

export function batteryOverview(ctx) {
  const empty = noData(ctx);
  if (empty) return empty;
  const alerts = alertsOf(ctx);
  const all = curbEntries(ctx.units);
  const measured = all.filter(([, u]) => hasBattery(u));
  if (!measured.length) return withSource(ctx, "None of the curbs report a battery level yet.");
  const avg = Math.round(measured.reduce((s, [, u]) => s + u.battery, 0) / measured.length);
  const [lowestId, lowest] = [...measured].sort(([, a], [, b]) => a.battery - b.battery)[0];
  const low = measured.filter(([, u]) => isLowBattery(u, alerts)).length;
  return withSource(ctx,
    `Average battery is ${avg}% across ${plural(measured.length, "measured curb")}${all.length > measured.length ? ` (${all.length - measured.length} not measured)` : ""}.\n` +
    `Lowest: ${lowestId} at ${lowest.battery}%. ${low ? `${plural(low, "curb is", "curbs are")} below the ${alerts.lowBattery}% alert.` : `None is below the ${alerts.lowBattery}% alert.`}`);
}

const ISSUE_TEXT = { offline: "offline", stale: "stopped reporting", lowBattery: "low battery" };

export function attention(ctx) {
  const empty = noData(ctx);
  if (empty) return empty;
  const alerts = alertsOf(ctx);
  const flagged = curbEntries(ctx.units).filter(([, u]) => unitIssues(u, alerts, ctx.now).length);
  if (!flagged.length) return withSource(ctx, "Nothing needs attention: every curb is online with a healthy battery.");
  return withSource(ctx, `${plural(flagged.length, "curb needs", "curbs need")} attention:\n${listCurbs(ctx, flagged, (u) =>
    unitIssues(u, alerts, ctx.now).map((i) => (i === "lowBattery" ? `battery ${u.battery}%` : ISSUE_TEXT[i])).join(", "))}`);
}

export function lastUpdate(ctx) {
  const empty = noData(ctx);
  if (empty) return empty;
  const timed = curbEntries(ctx.units).filter(([, u]) => typeof u.lastUpdated === "number").sort(([, a], [, b]) => b.lastUpdated - a.lastUpdated);
  if (!timed.length) return withSource(ctx, "No curb has sent a reading time yet.");
  const [id, u] = timed[0];
  const oldest = timed[timed.length - 1];
  return withSource(ctx,
    `The latest reading came from ${id} in ${lotName(ctx.lots, u.lot)}, ${formatAgo(u.lastUpdated, ctx.now)}.` +
    (timed.length > 1 ? `\nThe longest quiet is ${oldest[0]}, last heard ${formatAgo(oldest[1].lastUpdated, ctx.now)}. Curbs only send a reading when their spot changes.` : ""));
}

const STATE = (u) => (!u.online ? "offline" : u.occupied ? "occupied" : "free");

// Which curb? Offers real IDs as chips.
function askCurb(ctx, verb) {
  const ids = curbEntries(ctx.units).slice(0, 3).map(([id]) => id);
  return {
    text: `Which curb should I ${verb}? Give its ID, like ${ids[0] || "C-012"}.`,
    chips: ids.map((id) => `Status of ${id}`),
  };
}
function missingCurb(ctx, id) {
  return `I can't find a curb called ${id} in the ${ctx.mode === "sim" ? "simulated" : "live"} data. Curb units lists every curb.`;
}

export function curbStatus(ctx, ent) {
  if (!ent.curbId) return askCurb(ctx, "check");
  const u = ctx.units?.[ent.curbId];
  if (!u) return missingCurb(ctx, ent.curbId);
  const alerts = alertsOf(ctx);
  const low = isLowBattery(u, alerts);
  const color = cleanText(u.ledColor);
  const lines = [
    `${ent.curbId} is in ${ctx.lots?.[u.lot] ? lotName(ctx.lots, u.lot) : "no lot yet"}.`,
    `Status: ${STATE(u)}${isStale(u, alerts, ctx.now) ? " (stopped reporting)" : ""}`,
    `Battery: ${batteryText(u)}${low ? ` (below the ${alerts.lowBattery}% alert)` : ""}`,
    `LED: ${color ? `${color}${u.panelText ? `, showing "${u.panelText}"` : ""}` : "not set"}`,
  ];
  return withSource(ctx, lines.join("\n"), [[ent.curbId, u]]);
}

export function curbLocation(ctx, ent) {
  if (!ent.curbId) return askCurb(ctx, "find");
  const u = ctx.units?.[ent.curbId];
  if (!u) return missingCurb(ctx, ent.curbId);
  if (!ctx.lots?.[u.lot]) return withSource(ctx, `${ent.curbId} isn't in a lot yet. A manager can put it in one in Setup, on the Connect curbs step.`, [[ent.curbId, u]]);
  return withSource(ctx, `${ent.curbId} is in ${lotName(ctx.lots, u.lot)}. Parking lots shows it on the lot's plan.`, [[ent.curbId, u]]);
}

export function curbLed(ctx, ent) {
  if (!ent.curbId) return askCurb(ctx, "check the LED of");
  const u = ctx.units?.[ent.curbId];
  if (!u) return missingCurb(ctx, ent.curbId);
  const color = cleanText(u.ledColor);
  const text = color
    ? `${ent.curbId}'s LED is ${color}${u.panelText ? `, showing "${u.panelText}"` : " with no panel text"}${typeof u.ledBrightness === "number" ? `, at ${u.ledBrightness}% brightness` : ""}.`
    : `${ent.curbId}'s LED hasn't been set yet.`;
  return withSource(ctx, text + (canOperate(ctx) ? " Change it under Parking lots, LED panel control." : needOperator(ctx, "it")), [[ent.curbId, u]]);
}

export function lotList(ctx) {
  const empty = noData(ctx);
  if (empty) return empty;
  const lots = lotViews(ctx);
  if (!lots.length) return withSource(ctx, "There are no lots yet.");
  return withSource(ctx, `There ${lots.length === 1 ? "is 1 lot" : `are ${lots.length} lots`}:\n${lots.map((l) => `• ${l.name}: ${plural(l.total, "curb")}`).join("\n")}`);
}

export function curbCount(ctx) {
  const empty = noData(ctx);
  if (empty) return empty;
  const all = curbEntries(ctx.units);
  const loose = curbsWithoutLot(ctx).length;
  return withSource(ctx, `There are ${plural(all.length, "curb")} across ${plural(lotViews(ctx).length, "lot")}${loose ? `, and ${loose} of them ${loose === 1 ? "isn't" : "aren't"} in a lot yet` : ""}.`);
}

export function unassignedCurbs(ctx) {
  const empty = noData(ctx);
  if (empty) return empty;
  const loose = curbsWithoutLot(ctx);
  if (!loose.length) return withSource(ctx, "Every curb that has reported is in a lot.");
  return withSource(ctx, `${plural(loose.length, "curb isn't", "curbs aren't")} in a lot yet:\n${loose.slice(0, 8).map(([id]) => `• ${id}`).join("\n")}\n\nManagers put them in lots in Setup, on the Connect curbs step.`);
}

export function staleCurbs(ctx) {
  const empty = noData(ctx);
  if (empty) return empty;
  const alerts = alertsOf(ctx);
  if (!alerts.staleEnabled) {
    return withSource(ctx, "Flagging curbs that stop reporting is turned off, because curbs only send a reading when their spot changes. A manager can turn it on in Settings, under Alert thresholds. Ask me which curbs are offline instead.");
  }
  const stale = curbEntries(ctx.units).filter(([, u]) => isStale(u, alerts, ctx.now));
  if (!stale.length) return withSource(ctx, `No online curb has been quiet for more than ${alerts.staleMinutes} minutes.`);
  return withSource(ctx, `${plural(stale.length, "curb hasn't", "curbs haven't")} reported for over ${alerts.staleMinutes} minutes:\n${listCurbs(ctx, stale, (u) => `last heard ${formatAgo(u.lastUpdated, ctx.now)}`)}`);
}

export function dataModeNow(ctx) {
  return ctx.mode === "sim"
    ? "You're looking at Simulation: simulated curbs and lots kept apart from the real ones. Nothing you see here is the real site. Switch to Live with Data source at the bottom of the sidebar."
    : "You're looking at Live data: the real curbs, as the hardware Receiver reports them. Simulation, under Data source at the bottom of the sidebar, shows a separate set of simulated curbs.";
}

// ---------- How-to ----------

const LOT_PATH = "Open Parking lots, pick the lot, then pick a curb.";

export const howtoLedColor = (ctx) =>
  `${LOT_PATH} Under LED panel control, choose a Zone colour (red, blue, green, gold or white) or a Zone preset, then press Apply changes. Colour and panel text save together.` + needOperator(ctx, "LED settings");

export const howtoPanelText = (ctx) =>
  `${LOT_PATH} Under LED panel control, type in Panel text (up to 16 characters), then press Apply changes.` + needOperator(ctx, "the panel text");

export const howtoBrightness = (ctx) =>
  `${LOT_PATH} Under LED panel control, drag the Brightness slider (0 to 100%). It saves when you let go.` + needOperator(ctx, "the brightness");

export const howtoZonePresets = (ctx) =>
  "Zone presets are ready-made colour and text pairs that fit your facility type, for example permit zones on a campus. Pick one under Parking lots, LED panel control, then press Apply changes. Operators can still set any colour and text by hand." + needOperator(ctx, "the presets");

export const howtoInviteUser = (ctx) =>
  "Open Users & roles. Under Invite someone, enter their email, pick a role and press Send invite. The dashboard doesn't email anyone: copy their sign-up link and send it yourself. They show under Pending invites until they create their account." + needManager(ctx, "invite people");

export const howtoChangeRole = (ctx) =>
  "Open Users & roles and find the person under People. Pick their new role and confirm. You can't remove your own manager access; another manager has to do that." + needManager(ctx, "change roles");

export const howtoRemoveUser = (ctx) =>
  "In Users & roles you can revoke an invite that hasn't been used yet, under Pending invites. Accounts that already exist can't be deleted from the dashboard yet: set them to Viewer to limit what they can do, and contact Smart Wheel Stop to remove the account." + needManager(ctx, "manage people");

export const howtoSetup = (ctx) =>
  "Open Settings and press Reopen setup under Site setup. Setup has three steps: the site's name and contact, the facility type (which picks the zone presets and modules), and Connect curbs, where curbs that have reported get put in their lots." + needManager(ctx, "run Setup");

export const howtoSwitchMode = (ctx) =>
  `Use Data source at the bottom of the sidebar (on a phone, open the menu first) and pick Live or Simulation. It's also in Settings. Switching only changes what this browser shows; it never moves or changes any data. You're on ${ctx.mode === "sim" ? "Simulation" : "Live"} now.`;

export const howtoAnalytics = () =>
  "Analytics has three parts:\n• Live occupancy: the share of reporting curbs that are occupied, with a new point every few seconds.\n• Average occupancy by day and hour: a heatmap, darker for emptier and brighter red for fuller. Show as table gives the numbers.\n• Busiest day and Peak hour, worked out from that week.\nBelow them is the latency card.";

export const explainLatency = () =>
  "The latency card on Analytics times each step a reading takes, in milliseconds:\n• Event age: how old the curb's event was when the Receiver handled it.\n• Receiver to Firebase: from the Receiver getting it to its database write.\n• Firebase to dashboard: measured in your browser when a curb's reading changes; not stored.\nPick a step with the chips above the chart.";

export const howtoThresholds = (ctx) => {
  const a = alertsOf(ctx);
  return `Open Settings, then Alert thresholds. Set Low battery alert below (now ${a.lowBattery}%) and, if you want it, Flag curbs that stop reporting after a number of minutes (now ${a.staleEnabled ? `${a.staleMinutes} minutes` : "off"}). Press Save thresholds. They're shared by everyone and decide what shows under Needs attention.` + needManager(ctx, "change alert thresholds");
};

export const howtoTheme = (ctx) =>
  "Open Settings, then Appearance, and pick a theme. It changes everyone's dashboard. Curb status colours stay the same in every theme." + needManager(ctx, "change the theme");

export const howtoPassword = () =>
  "Open Settings and use Change password under Account: enter your current password, then the new one twice. If you've forgotten it, ask a manager or Smart Wheel Stop for help; the dashboard can't reset it for you yet.";

export const howtoAssignCurb = (ctx) =>
  "Curbs go into lots in Setup, on the Connect curbs step: it lists curbs that have reported but aren't in a lot, and you pick the lot each one is installed in. Open it from Settings, Reopen setup." + needManager(ctx, "put curbs in lots");

export const howtoFindCurb = () =>
  "Open Curb units and type the curb or lot in Search by unit or lot. The filters narrow it to Needs attention, Offline, Low battery or Free spots. You can also ask me, for example \"status of C-012\".";

export const howtoLotSign = (ctx) =>
  `Open lot sign, at the bottom of the sidebar, opens the entrance sign in a new tab. It runs signed out, so it can stay up on a TV, and shows the free spots in each lot.${ctx.mode === "sim" ? " From Simulation it opens the simulated version." : ""}`;

export const howtoRunSimulation = (ctx) =>
  "In Simulation, the Simulation page in the sidebar has Start simulation and Stop simulation, scenarios (Rush hour in Lot 6, Take a curb offline, Bring all curbs online, Install 3 new curbs) and Load fresh simulated data to start over. Real curbs are never touched." +
  (ctx.mode === "sim" ? "" : " Switch to Simulation first, under Data source.") +
  (canOperate(ctx) ? "" : `\n\nViewers can watch the simulation; operators and managers control it. ${ASK_MANAGER}`);

export const howtoSignOut = () =>
  "Use the sign-out button next to your email at the bottom of the sidebar. On a phone, open the menu first.";

export const howtoModules = () =>
  "Modules depend on the facility type chosen in Setup, for example permit tiers for a campus or event mode for a stadium. The ones that are on appear in the sidebar. None is built yet: each opens a page that says what it will do.";

export const howtoAddLot = () =>
  "Lots are added by Smart Wheel Stop when your curbs are installed, so there's no button for it here. Contact them with the lot's name, size and location. Once a lot exists, a manager can put curbs in it in Setup, on the Connect curbs step.";

// ---------- Explain ----------

export const explainStatusColors = () =>
  "The curb colours are the same in every theme:\n• Lime green: free\n• Red-orange: occupied\n• Amber ring: needs attention, such as a low battery\n• Dark grey with an X: offline, so the spot isn't counted";

const ROLE_LINES = {
  viewer: "Viewer: sees occupancy, battery and status, and can watch the simulation.",
  operator: "Operator: everything a viewer can, plus changing LED zone colours, panel text and brightness, and running the simulation.",
  manager: "Manager: everything an operator can, plus inviting people, changing roles, running Setup, putting curbs in lots, and changing alert thresholds and the theme.",
};

export const explainRoles = (ctx) =>
  `There are three roles:\n• ${ROLE_LINES.viewer}\n• ${ROLE_LINES.operator}\n• ${ROLE_LINES.manager}\n\nYou're ${roleText(ctx)}. Users & roles has the full table.`;

const MY_ROLE = {
  viewer: "You can see occupancy, battery and status, and watch the simulation, but not change LEDs, people or settings. If you need more, ask a manager: Users & roles lists who they are.",
  operator: "You can change LED zone colours, panel text and brightness, and run the simulation. Inviting people, roles, Setup and settings are for managers: Users & roles lists who they are.",
  manager: "You can do everything here: LEDs, the simulation, inviting people and changing roles, Setup, putting curbs in lots, alert thresholds and the theme.",
};

export const explainMyRole = (ctx) =>
  MY_ROLE[ctx.role] ? `You're ${roleText(ctx)}. ${MY_ROLE[ctx.role]}` : `I can't tell your role yet. ${ASK_MANAGER}`;

export const explainAttention = (ctx) => {
  const a = alertsOf(ctx);
  return `A curb needs attention when it's offline, when its battery is below ${a.lowBattery}%, or, if a manager turned it on, when it hasn't reported for ${a.staleMinutes} minutes (now ${a.staleEnabled ? "on" : "off"}). Overview lists them under Needs attention, and Curb units has a Needs attention filter.`;
};

export const explainOffline = () =>
  "Offline means the Receiver isn't hearing from the curb, so its spot isn't counted as free or occupied. It's usually power, a flat battery or something blocking the signal. Ask me \"which curbs are offline\" to see them.";

export const explainLowBattery = (ctx) =>
  `A curb counts as low on battery below ${alertsOf(ctx).lowBattery}%. That threshold is shared by everyone; managers change it in Settings, under Alert thresholds. Curbs that don't report a battery level are shown as Not measured and never count as low.`;

export const explainStale = (ctx) => {
  const a = alertsOf(ctx);
  return `A stale curb is online but hasn't sent a reading for longer than the threshold (${a.staleMinutes} minutes). It's ${a.staleEnabled ? "on" : "off"} right now: curbs only report when their spot changes, so a quiet curb on a quiet spot isn't necessarily broken.`;
};

export const explainOccupied = () =>
  "Each curb has a sensor that notices a car over the spot. The curb tells the Receiver, which writes \"occupied\" to the database, and the dashboard shows it within a moment or two.";

export const explainSimulation = (ctx) =>
  `Simulation is a separate set of fake curbs and lots for demos and testing. It lives apart from the real data, so nothing you do there touches the real site. ${ctx.mode === "sim" ? "You're in Simulation now." : "You're on Live now; switch under Data source at the bottom of the sidebar."}`;

export const explainReceiver = () =>
  "The Receiver is the hardware gateway at the site. It hears every curb over radio and writes their readings (occupied, battery, last update) to the database the dashboard reads.";

export const explainFree = () =>
  "A free spot is one whose curb is online and doesn't detect a car. Offline curbs don't count as free or occupied, because the dashboard can't tell.";

// ---------- Small talk and help ----------

function partOfDay(now) {
  const h = new Date(now).getHours();
  if (h < 5) return "Hello";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export const greeting = (ctx) =>
  `${partOfDay(ctx.now)}! Ask me about free spots, curbs that need attention, or how to do something in the dashboard.`;

export const thanks = () => "You're welcome. Anything else?";

export const whoAreYou = () =>
  "I'm the Smart Wheel Stop assistant. I answer from the dashboard's own data using fixed rules, not an AI service, and I can't change anything: I only read.";

export const capabilities = () =>
  "I can tell you how many spots are free, which lot is busiest, which curbs are offline or low on battery, and the status of any curb. I can also explain how to do things in the dashboard, what the colours and roles mean, and what Analytics shows. I only read data; I never change it.";

export const goodbye = () => "Bye for now.";

export const howAreYou = () => "All good, thanks. Want to know how the lots are doing?";

export const okay = () => "Okay. Ask me anything else about the lots or the dashboard.";

export const help = () =>
  "Here's what I can answer:\n• Status: free spots (total or in a lot), busiest lot, offline curbs, low batteries, what needs attention, the latest reading, the status of a curb such as C-012\n• How-to: LED colour, text and brightness, inviting people and changing roles, Setup, switching Live and Simulation, alert thresholds, the theme\n• Explain: status colours, roles, what attention, offline and stale mean, Analytics and the latency card\n\nTap a suggestion below to try one.";

export const fallback = () =>
  "Sorry, I didn't catch that. I answer questions about the lots and curbs, and how to use this dashboard. Try one of these:";

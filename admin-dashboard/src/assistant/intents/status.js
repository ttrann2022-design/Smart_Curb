// Status intents: answers from the live (or simulated) lots and units, and from
// recorded history. Each `say` returns 3-5 variants of the same facts.
import { batteryText, cleanText, formatAgo, hasBattery, isLowBattery, isStale, lotsWithCapacity, unitIssues } from "../../unitStatus.js";
import { curbEntries, curbsWithoutLot, hasMore, listCurbs, lotName, lotViews, sourceLine } from "../data.js";
import { alertsOf, canOperate, needOperator, noData, plural, sourced, vary } from "../common.js";
import { DAY_NAMES, HOURS_LONG, dayAverage, dayKey, historySource, hourSlot, liveSeries, pct, weekOf, weekStats } from "../history.js";

const spots = (n) => plural(n, "free spot");
// One lot's line in a site-wide answer: "3 of 4" free (capacity is the curbs that
// report, as lotCounts), its offline curbs, or why it has no count yet.
const lotLine = (l) => (!l.curbCount ? "no curbs yet" : !l.total ? "no curbs reporting" : `${l.open} of ${l.total}${l.offline ? ` (${l.offline} offline)` : ""}`);
const ISSUE_TEXT = { offline: "offline", stale: "stopped reporting", lowBattery: "low battery" };
const STATE = (u) => (!u.online ? "offline" : u.occupied ? "occupied" : "free");

// The curbs a question is about: one lot's, or all of them.
function scope(ctx, ent) {
  const all = curbEntries(ctx.units);
  if (!ent.lotId || !ctx.lots?.[ent.lotId]) return { entries: all, where: "", lotId: null };
  return { entries: all.filter(([, u]) => u.lot === ent.lotId), where: ` in ${lotName(ctx.lots, ent.lotId)}`, lotId: ent.lotId };
}

// Which curb? Offers real IDs as chips.
function askCurb(ctx, verb) {
  const ids = curbEntries(ctx.units).slice(0, 3).map(([id]) => id);
  const eg = ids[0] || "C-012";
  return {
    variants: [`Which curb should I ${verb}? Give its ID, like ${eg}.`, `Sure, which curb? Something like ${eg} works.`, `Happy to ${verb} one. Which curb ID, for example ${eg}?`],
    chips: ids.map((id) => `Status of ${id}`),
  };
}
const missingCurb = (ctx, id) => {
  const where = ctx.mode === "sim" ? "simulated" : "live";
  return [
    `I can't find a curb called ${id} in the ${where} data. Curb units lists every curb.`,
    `Hmm, there's no ${id} in the ${where} data. Double-check the ID on Curb units?`,
    `${id} doesn't show up in the ${where} data. Maybe a different number?`,
  ];
};
const curbOf = (ctx, ent) => ctx.units?.[ent.curbId];

// A status answer about one curb: ask for an ID, say it's missing, or run `fn`.
const forCurb = (verb, fn) => (ctx, ent) => {
  if (!ent.curbId) return askCurb(ctx, verb);
  const u = curbOf(ctx, ent);
  return u ? fn(ctx, ent, u) : missingCurb(ctx, ent.curbId);
};

// A status answer that needs data: the "no data" variants, or `fn`.
const withData = (fn) => (ctx, ent) => noData(ctx) || fn(ctx, ent);

// A list of curbs with paging for "show me more".
function curbList(ctx, ent, entries, openers, emptyVariants, detail) {
  if (!entries.length) return sourced(ctx, emptyVariants, entries);
  const page = ent.page || 0;
  if (page * 8 >= entries.length) return sourced(ctx, ["That's the whole list.", "Nothing more to show: that was all of them.", "That's everything on that list."], entries);
  const body = `\n${listCurbs(ctx, entries, detail, page)}`;
  return { variants: sourced(ctx, vary(page ? ["Here are the next ones:", "More of them:", "Continuing the list:"] : openers, body)), more: hasMore(entries, page) };
}

// History is recorded for every customer together, so a dashboard scoped to one
// customer doesn't get it (ctx.historyHidden, from the page).
const HISTORY_NOT_SCOPED = [
  "History is recorded for all customers together, so I can't give it for yours yet. Ask me about right now instead?",
  "I don't have history for just your lots: it's kept for every customer combined. I can tell you how things look right now.",
  "Recorded history isn't kept per customer yet, so I can't compare times for your lots. Ask me about free spots, offline curbs or batteries right now.",
];
const HISTORY_EMPTY = (ctx) => ctx.historyHidden ? HISTORY_NOT_SCOPED : [
  `There's no recorded history yet${ctx.mode === "sim" ? " in the simulation. Loading fresh simulated data adds a week of it" : " for the live site. Analytics fills in as readings are recorded"}.`,
  `I don't have any recorded history to go on yet${ctx.mode === "sim" ? "; load fresh simulated data to create some" : ""}.`,
  "No history has been recorded yet, so I can't compare times. Ask me about right now instead?",
];
const withWeek = (fn) => (ctx, ent) => {
  const week = weekOf(ctx);
  return week ? fn(ctx, ent, week, weekStats(week)) : HISTORY_EMPTY(ctx);
};
const fromHistory = (ctx, variants) => variants.map((v) => `${v}\n\n${historySource(ctx)}`);

export const STATUS_INTENTS = [
  {
    id: "free_total", group: "status", lot: -3, curb: -3, lotIntent: "free_lot",
    keys: [["free", 2], ["spot", 1], ["how many", 1], ["how much", 1], ["total", 1.5], ["overall", 1.5], ["left", 1.5], ["park", 0.5], ["anywhere", 1], ["empty", 1.5], ["right now", 0.5], ["count", 1], ["spot count", 3], ["what count", -3], ["but", -2], ["fewest", -3], ["exact", -2], ["good time", -3], ["tv", -2], ["sign", -2], ["which spot", -2], ["when", -2]],
    next: ["Free spots in each lot", "Where should I park?", "Which lot is busiest?"],
    say: withData((ctx) => {
      const lots = lotViews(ctx);
      const open = lots.reduce((s, l) => s + l.open, 0);
      const total = lots.reduce((s, l) => s + l.total, 0);
      // "across N lots" counts only lots with capacity (lotsWithCapacity).
      const withCapacity = lotsWithCapacity(lots.map((l) => l.curbs.map(([, u]) => u)));
      const body = `\n${lots.map((l) => `• ${l.name}: ${lotLine(l)}`).join("\n")}`;
      return sourced(ctx, vary([
        `${open} of ${total} spots are free across ${plural(withCapacity, "lot")}:`,
        `Right now there are ${spots(open)} out of ${total}:`,
        `Good question! ${open} of ${total} spots are open at the moment:`,
        `I count ${spots(open)} across the site (${total} in total):`,
      ], body));
    }),
  },
  {
    id: "free_lot", group: "status", lot: 3.5, usesLot: true,
    keys: [["free", 2], ["spot", 1], ["how many", 1], ["left", 1], ["full", 1], ["busy", 1], ["room", 1], ["availability", 2.5], ["which spot", -2], ["which space", -2]],
    next: ["Which lot is busiest?", "Free spots in each lot", "What needs attention?"],
    say: withData((ctx, ent) => {
      const lot = lotViews(ctx).find((l) => l.id === ent.lotId);
      if (!lot) return STATUS_BY_ID.free_by_lot.say(ctx, ent);
      if (lot.curbCount === 0) return sourced(ctx, [`${lot.name} has no curbs yet, so it has no spots to count.`, `No curbs yet in ${lot.name}, so there's nothing to count.`, `${lot.name} has no curbs yet: its spots come from its curbs.`], lot.curbs);
      if (lot.total === 0) return sourced(ctx, [`None of ${lot.name}'s ${plural(lot.curbCount, "curb")} ${lot.curbCount === 1 ? "is" : "are"} reporting, so I can't count its spots.`, `${lot.name}'s curbs are all offline right now, so I can't tell.`, `I can't count ${lot.name}'s spots: none of its curbs is reporting.`], lot.curbs);
      const off = lot.offline ? ` (${lot.offline} offline)` : "";
      if (lot.open === 0) return sourced(ctx, [`${lot.name} is full: none of its ${lot.total} spots are free${off}.`, `No luck in ${lot.name}, it's full right now${off}.`, `${lot.name} has no free spots at the moment${off}.`], lot.curbs);
      return sourced(ctx, [
        `${lot.name} has ${spots(lot.open)} out of ${lot.total}${off}.`,
        `In ${lot.name}, ${lot.open} of ${lot.total} spots are free${off}.`,
        `${lot.name}: ${spots(lot.open)} right now${off}.`,
        `Yes, ${lot.name} has room: ${spots(lot.open)} of ${lot.total}${off}.`,
      ], lot.curbs);
    }),
  },
  {
    id: "free_by_lot", group: "status", lotIntent: "free_lot",
    keys: [["free", 1.5], ["spot", 0.5], ["each", 2], ["per", 2], ["every lot", 2], ["by lot", 2], ["breakdown", 2.5], ["all lots", 1.5], ["lot by lot", 2]],
    next: ["Where should I park?", "Which lot is busiest?", "How full is the site?"],
    say: withData((ctx) => {
      const body = `\n${lotViews(ctx).map((l) => `• ${l.name}: ${l.curbCount ? `${l.open} free, ${l.occupied} occupied${l.offline ? `, ${l.offline} offline` : ""}` : "no curbs yet"}`).join("\n")}`;
      return sourced(ctx, vary(["Free spots in each lot:", "Here's the lot-by-lot picture:", "Lot by lot, right now:", "Here's how each lot looks:"], body));
    }),
  },
  {
    id: "best_lot", group: "status", lotIntent: "free_lot",
    keys: [["where should", 2], ["park", 2], ["best", 2], ["most free", 2], ["most spot", 2], ["most room", 3], ["emptiest", 3], ["least busy", 4.5], ["least full", 4], ["quietest", 3], ["recommend", 3], ["suggest", 2.5], ["where is most", 3], ["should i", 1.5], ["which lot should", 3], ["would you park", 3], ["movie", -3], ["time", -3], ["hour", -3], ["when", -2], ["day", -3]],
    next: ["Free spots in each lot", "Which lot is busiest?", "Which lots are full?"],
    say: withData((ctx) => {
      const best = [...lotViews(ctx)].sort((a, b) => b.open - a.open)[0];
      if (!best || best.open === 0) return sourced(ctx, ["Every lot is full right now: there are no free spots anywhere.", "Sorry, there's nowhere free at the moment. Every lot is full.", "No free spots anywhere right now. Try again in a few minutes?"]);
      return sourced(ctx, [
        `${best.name} has the most room, with ${spots(best.open)} out of ${best.total}.`,
        `I'd head to ${best.name}: ${spots(best.open)} there right now.`,
        `Your best bet is ${best.name}, with ${best.open} of ${best.total} free.`,
        `Try ${best.name}. It has the most space (${spots(best.open)}).`,
      ], best.curbs);
    }),
  },
  {
    id: "busiest_lot", group: "status", lotIntent: "free_lot",
    keys: [["busy", 3], ["most occupied", 3], ["most full", 3], ["fill up", 3], ["fewest", 2.5], ["least free", 3], ["fewest free", 3.5], ["how busy", -2], ["weekday", -3], ["weekend", -3], ["unusual", -3], ["unusually", -3], ["least", -3], ["day", -3], ["hour", -3], ["time", -3], ["when", -2], ["usual", -3], ["lot", 0.5]],
    next: ["Where should I park?", "Which lots are full?", "How full is the site?"],
    say: withData((ctx) => {
      const lots = lotViews(ctx).filter((l) => l.pctFull !== null).sort((a, b) => b.pctFull - a.pctFull);
      if (!lots.length) return sourced(ctx, ["No lot has a curb reporting right now, so I can't tell which is busiest.", "I can't rank the lots: none has a curb reporting.", "Nothing's reporting, so there's no busiest lot to name yet."]);
      const [top] = lots;
      return sourced(ctx, [
        `${top.name} is the busiest at ${top.pctFull}% full, with ${spots(top.open)} left.`,
        `The busiest lot is ${top.name}: ${top.pctFull}% full right now.`,
        `${top.name} is the one filling up, at ${top.pctFull}% (${spots(top.open)} left).`,
        `Busiest right now: ${top.name}, ${top.pctFull}% full.`,
      ], top.curbs);
    }),
  },
  {
    id: "full_lots", group: "status", lot: -2, lotIntent: "free_lot",
    keys: [["full", 2.5], ["any lot", 1], ["which lot", 0.5], ["no free", 3.5], ["completely", 1], ["customer", -3], ["how full", -3], ["least", -3], ["is lot", -2]],
    next: ["Where should I park?", "Which lot is busiest?", "Free spots in each lot"],
    say: withData((ctx) => {
      const full = lotViews(ctx).filter((l) => l.total > 0 && l.open === 0);
      if (!full.length) return sourced(ctx, ["No lot is full. Every lot with curbs has at least one free spot.", "Good news: none of the lots is full.", "Nothing's full right now; every lot still has room."]);
      const body = `\n${full.map((l) => `• ${l.name} (${l.total} spots)`).join("\n")}`;
      return sourced(ctx, vary([`${plural(full.length, "lot is", "lots are")} full right now:`, "These lots are full:", `Full at the moment (${full.length}):`], body));
    }),
  },
  {
    id: "occupancy_rate", group: "status", lotIntent: "free_lot",
    keys: [["occupancy", 3], ["how full", 3], ["how busy", 3], ["typical", -3], ["going up", -3], ["going down", -3], ["overall", 1], ["percent", 2.5], ["percentage", 2.5], ["rate", 1], ["utilisation", 3], ["utilization", 3], ["capacity", 2], ["site", 0.5], ["analytics", -2], ["average", -2], ["usual", -3], ["yesterday", -3], ["history", -3]],
    next: ["Which lot is busiest?", "How many spots are occupied?", "Is it busier than usual?"],
    say: withData((ctx) => {
      const lots = lotViews(ctx);
      const reporting = lots.reduce((s, l) => s + l.open + l.occupied, 0);
      const occupied = lots.reduce((s, l) => s + l.occupied, 0);
      if (!reporting) return sourced(ctx, ["No curb is reporting right now, so I can't work out how full the site is.", "I can't tell how full it is: no curb is reporting.", "Nothing is reporting, so there's no occupancy to give."]);
      const p = Math.round((occupied / reporting) * 100);
      const body = `\n${lots.filter((l) => l.pctFull !== null).map((l) => `• ${l.name}: ${l.pctFull}%`).join("\n")}`;
      return sourced(ctx, vary([
        `The site is ${p}% full: ${occupied} of ${reporting} reporting curbs are occupied.`,
        `Occupancy is ${p}% right now (${occupied} of ${reporting}).`,
        `We're at ${p}% across the site.`,
      ], body));
    }),
  },
  {
    id: "occupied_count", group: "status", lotIntent: "free_lot",
    keys: [["occupied", 2.5], ["how many", 1], ["car", 1.5], ["parked", 1.5], ["but", -2], ["wrong", -3], ["access", -3], ["percent", -2], ["percentage", -2], ["know", -2], ["detect", -2], ["mean", -2], ["which spot", -2]],
    next: ["How many spots are free?", "How full is the site?", "Which lot is busiest?"],
    say: withData((ctx) => {
      const lots = lotViews(ctx);
      const occupied = lots.reduce((s, l) => s + l.occupied, 0);
      const body = `\n${lots.map((l) => `• ${l.name}: ${l.occupied}`).join("\n")}`;
      return sourced(ctx, vary([`${plural(occupied, "spot is", "spots are")} occupied:`, `There are ${plural(occupied, "car")} parked right now:`, `${occupied} occupied, lot by lot:`], body));
    }),
  },
  {
    id: "offline_curbs", group: "status", curb: -3, usesLot: true,
    keys: [["offline", 3], ["not reporting", 3], ["lost connection", 3], ["down", 2.5], ["dead", 2.5], ["not talking", 3.5], ["no signal", 3], ["unresponsive", 3], ["battery", -2], ["curb", 0.5], ["mean", -3], ["why", -1.5], ["explain", -3], ["fix", -2], ["keep", -2], ["email", -3], ["notify", -3]],
    next: ["Show low batteries", "Which lot is busiest?", "Why is a curb offline?"],
    say: withData((ctx, ent) => {
      const { entries, where } = scope(ctx, ent);
      const off = entries.filter(([, u]) => !u.online);
      return curbList(ctx, ent, off,
        [`${plural(off.length, "curb is", "curbs are")} offline${where}:`, `I found ${plural(off.length, "offline curb")}${where}:`, `Offline right now${where} (${off.length}):`],
        [`Every curb${where} is online and reporting.`, `Nothing's offline${where}. All good!`, `All curbs${where} are reporting. Nice.`],
        (u) => (typeof u.lastUpdated === "number" ? `last heard ${formatAgo(u.lastUpdated, ctx.now)}` : ""));
    }),
  },
  {
    id: "online_count", group: "status", curb: -3, usesLot: true,
    keys: [["online", 3], ["reporting", 2], ["connected", 2], ["how many", 0.5], ["curb", 0.5], ["working", 2.5], ["why", -2], ["not working", -3]],
    next: ["Which curbs are offline?", "When was the last update?", "What needs attention?"],
    say: withData((ctx, ent) => {
      const { entries, where } = scope(ctx, ent);
      const on = entries.filter(([, u]) => u.online).length;
      const rest = on < entries.length ? `; ${entries.length - on} offline` : "";
      return sourced(ctx, [
        `${on} of ${plural(entries.length, "curb")}${where} ${on === 1 ? "is" : "are"} online and reporting${rest}.`,
        `${on} curbs${where} are online right now, out of ${entries.length}${rest}.`,
        `Online${where}: ${on} of ${entries.length}${rest}.`,
      ]);
    }),
  },
  {
    id: "low_battery", group: "status", curb: -3, usesLot: true,
    keys: [["battery", 2], ["low", 2], ["below", 1.5], ["new battery", 2], ["dead", 1], ["replace", 1], ["need charge", 1.5], ["swap", 1.5], ["swapping", 1.5], ["count as low", -3], ["what percent", -3], ["threshold", -3], ["change", -2], ["mean", -2], ["what count", -2], ["average", -2], ["consider", -2], ["why", -2], ["drain", -2]],
    next: ["Which curbs are offline?", "What needs attention?", "How are the batteries overall?"],
    say: withData((ctx, ent) => {
      const alerts = alertsOf(ctx);
      const { entries, where } = scope(ctx, ent);
      const low = entries.filter(([, u]) => isLowBattery(u, alerts)).sort(([, a], [, b]) => a.battery - b.battery);
      return curbList(ctx, ent, low,
        [`${plural(low.length, "curb is", "curbs are")} below ${alerts.lowBattery}% battery${where}:`, `These need a battery soon${where}:`, `Low batteries${where} (under ${alerts.lowBattery}%):`],
        [`No curb${where} is low on battery. Every measured one is at ${alerts.lowBattery}% or above.`, `Batteries look fine${where}: nothing under ${alerts.lowBattery}%.`, `All good${where}, no batteries below ${alerts.lowBattery}%.`],
        (u) => `${u.battery}%`);
    }),
  },
  {
    id: "battery_overview", group: "status", curb: -3, usesLot: true,
    keys: [["battery", 2], ["level", 1.5], ["average", 2], ["overall", 1.5], ["health", 1.5], ["how are", 1], ["low", -2], ["threshold", -3], ["why", -2], ["drain", -2]],
    next: ["Show low batteries", "What needs attention?", "Which curbs are offline?"],
    say: withData((ctx, ent) => {
      const alerts = alertsOf(ctx);
      const { entries, where } = scope(ctx, ent);
      const measured = entries.filter(([, u]) => hasBattery(u));
      if (!measured.length) return sourced(ctx, [`None of the curbs${where} report a battery level yet.`, `No battery readings${where} yet.`, `I don't have any battery levels${where} to go on.`]);
      const avg = Math.round(measured.reduce((s, [, u]) => s + u.battery, 0) / measured.length);
      const [lowestId, lowest] = [...measured].sort(([, a], [, b]) => a.battery - b.battery)[0];
      const low = measured.filter(([, u]) => isLowBattery(u, alerts)).length;
      const tail = ` Lowest: ${lowestId} at ${lowest.battery}%. ${low ? `${plural(low, "curb is", "curbs are")} below the ${alerts.lowBattery}% alert.` : `None is below the ${alerts.lowBattery}% alert.`}`;
      return sourced(ctx, vary([
        `Average battery${where} is ${avg}% across ${plural(measured.length, "measured curb")}.`,
        `Batteries${where} average ${avg}%.`,
        `Overall battery health${where}: ${avg}% on average.`,
      ], tail));
    }),
  },
  {
    id: "attention", group: "status", usesLot: true,
    keys: [["attention", 3], ["what makes", -3], ["waiting", -3], ["level", -2], ["anything", 0.5], ["need", 0.5], ["any", 0.5], ["fix", 2.5], ["deal with", 2.5], ["wrong", 1.5], ["anything wrong", 3], ["whats wrong", 3], ["fix offline", -3], ["sms", -3], ["look at", 2], ["should", 0.5], ["mean", -3], ["what count", -3], ["why", -2], ["most attention", -3]],
    next: ["Which curbs are offline?", "Show low batteries", "What does attention mean?"],
    say: withData((ctx, ent) => {
      const alerts = alertsOf(ctx);
      const { entries, where } = scope(ctx, ent);
      const flagged = entries.filter(([, u]) => unitIssues(u, alerts, ctx.now).length);
      return curbList(ctx, ent, flagged,
        [`${plural(flagged.length, "curb needs", "curbs need")} attention${where}:`, `Here's what needs a look${where}:`, `On the to-do list${where} (${flagged.length}):`],
        [`Nothing needs attention${where}: every curb is online with a healthy battery.`, `All clear${where}! Nothing needs attention.`, `Nothing to fix${where} right now.`],
        (u) => unitIssues(u, alerts, ctx.now).map((i) => (i === "lowBattery" ? `battery ${u.battery}%` : ISSUE_TEXT[i])).join(", "));
    }),
  },
  {
    id: "last_update", group: "status", usesLot: true,
    keys: [["fresh", 3], ["last update", 3], ["last reading", 3], ["last heard", 3], ["when", 1], ["how old", 2], ["up to date", 3], ["data", 0.5], ["last", 1], ["simulation", -1.5], ["not updating", -3], ["stuck", -3]],
    next: ["Which curbs are offline?", "How many spots are free?", "Is this live data?"],
    say: withData((ctx, ent) => {
      const { entries } = scope(ctx, ent);
      const timed = entries.filter(([, u]) => typeof u.lastUpdated === "number").sort(([, a], [, b]) => b.lastUpdated - a.lastUpdated);
      if (!timed.length) return sourced(ctx, ["No curb has sent a reading time yet.", "I don't have any reading times yet.", "Nothing has reported a time so far."]);
      const [id, u] = timed[0];
      const ago = formatAgo(u.lastUpdated, ctx.now);
      const oldest = timed[timed.length - 1];
      const tail = timed.length > 1 ? `\nThe longest quiet is ${oldest[0]}, last heard ${formatAgo(oldest[1].lastUpdated, ctx.now)}. Curbs only send a reading when their spot changes.` : "";
      return sourced(ctx, vary([
        `The latest reading came from ${id} in ${lotName(ctx.lots, u.lot)}, ${ago}.`,
        `Freshest data: ${id}, ${ago}.`,
        `${id} reported most recently, ${ago}.`,
      ], tail), entries);
    }),
  },
  {
    id: "curb_status", group: "status", curb: 4, usesCurb: true,
    keys: [["status", 1], ["curb status", 4], ["status of curb", 4], ["how is", 1], ["check", 1], ["what about", 1], ["tell me about", 1.5], ["change", -3], ["offline", 0.5], ["battery", 0.5], ["occupied", 0.5], ["free", 0.5], ["why", -1]],
    next: ["Which curbs are offline?", "Show low batteries", "What needs attention?"],
    say: forCurb("check", (ctx, ent, u) => {
      const alerts = alertsOf(ctx);
      const color = cleanText(u.ledColor);
      const body = [
        `\nStatus: ${STATE(u)}${isStale(u, alerts, ctx.now) ? " (stopped reporting)" : ""}`,
        `Battery: ${batteryText(u)}${isLowBattery(u, alerts) ? ` (below the ${alerts.lowBattery}% alert)` : ""}`,
        `LED: ${color ? `${color}${u.panelText ? `, showing "${u.panelText}"` : ""}` : "not set"}`,
      ].join("\n");
      const where = ctx.lots?.[u.lot] ? lotName(ctx.lots, u.lot) : "no lot yet";
      // "Is C-041 free?": the answer first, then the details.
      if (ent.occupancy) {
        const state = u.online ? STATE(u) : "offline, so I can't tell whether it's free";
        const lot = ctx.lots?.[u.lot] ? `in ${where}` : "not in a lot yet";
        return sourced(ctx, vary([`${ent.curbId} is ${state} right now. It's ${lot}.`, `Right now ${ent.curbId} (${lot}) is ${state}.`, `${ent.curbId} is ${state}: it's ${lot}.`], body), [[ent.curbId, u]]);
      }
      return sourced(ctx, vary([`${ent.curbId} is in ${where}.`, `Here's ${ent.curbId} (${where}):`, `${ent.curbId}, in ${where}:`], body), [[ent.curbId, u]]);
    }),
  },
  {
    id: "curb_battery", group: "status", curb: 4, usesCurb: true,
    keys: [["battery", 2], ["charge", 1], ["level", 1], ["how much", 0.5], ["low", -1], ["which", -1], ["all", -2]],
    next: ["Show low batteries", "How are the batteries overall?", "What needs attention?"],
    say: forCurb("check the battery of", (ctx, ent, u) => {
      const alerts = alertsOf(ctx);
      if (!hasBattery(u)) return sourced(ctx, [`${ent.curbId} doesn't report a battery level.`, `No battery reading for ${ent.curbId}; it shows as Not measured.`, `${ent.curbId} hasn't sent a battery level.`], [[ent.curbId, u]]);
      const low = isLowBattery(u, alerts) ? ` That's below the ${alerts.lowBattery}% alert, so it's worth replacing soon.` : "";
      return sourced(ctx, [`${ent.curbId}'s battery is at ${u.battery}%.${low}`, `${ent.curbId} has ${u.battery}% battery left.${low}`, `Battery for ${ent.curbId}: ${u.battery}%.${low}`], [[ent.curbId, u]]);
    }),
  },
  {
    id: "curb_last_seen", group: "status", curb: 4, usesCurb: true,
    keys: [["last seen", 3], ["last heard", 2.5], ["last report", 2.5], ["when", 1.5], ["last", 1], ["reported", 1.5]],
    next: ["Which curbs are offline?", "When was the last update?", "What does stale mean?"],
    say: forCurb("check", (ctx, ent, u) => {
      if (typeof u.lastUpdated !== "number") return sourced(ctx, [`${ent.curbId} hasn't sent a reading time yet.`, `No reading time for ${ent.curbId} so far.`, `I don't know when ${ent.curbId} last reported.`], [[ent.curbId, u]]);
      const ago = formatAgo(u.lastUpdated, ctx.now);
      return sourced(ctx, [`${ent.curbId} last reported ${ago}.`, `We last heard from ${ent.curbId} ${ago}.`, `${ent.curbId}'s latest reading was ${ago}, and it's ${STATE(u)}.`], [[ent.curbId, u]]);
    }),
  },
  {
    id: "curb_location", group: "status", curb: 4, usesCurb: true,
    keys: [["where is", 2], ["which lot", 1.5], ["what lot", 2], ["located", 2], ["location", 2], ["find", 1], ["curb", 0.3], ["change", -3], ["how", -1]],
    next: ["Free spots in each lot", "Which curbs are offline?", "What needs attention?"],
    say: forCurb("find", (ctx, ent, u) => {
      if (!ctx.lots?.[u.lot]) return sourced(ctx, [`${ent.curbId} isn't in a lot yet. A manager can put it in one in Setup, on the Connect curbs step.`, `${ent.curbId} hasn't been put in a lot yet (Setup, Connect curbs).`, `No lot for ${ent.curbId} yet.`], [[ent.curbId, u]]);
      const name = lotName(ctx.lots, u.lot);
      return sourced(ctx, [`${ent.curbId} is in ${name}. Parking lots shows it on the lot's plan.`, `You'll find ${ent.curbId} in ${name}.`, `${ent.curbId} lives in ${name}.`], [[ent.curbId, u]]);
    }),
  },
  {
    id: "curb_led", group: "status", curb: 4, usesCurb: true,
    keys: [["led", 2], ["panel", 2], ["showing", 1.5], ["display", 1], ["color", 1], ["text", 0.5], ["change", -3], ["how", -1], ["why", -2], ["all", -2]],
    next: ["How do I change an LED colour?", "What needs attention?", "Which curbs are offline?"],
    say: forCurb("check the LED of", (ctx, ent, u) => {
      const color = cleanText(u.ledColor);
      const how = canOperate(ctx) ? " Change it under Parking lots, LED panel control." : needOperator(ctx, "it");
      if (!color) return sourced(ctx, [`${ent.curbId}'s LED hasn't been set yet.${how}`, `No LED colour on ${ent.curbId} so far.${how}`, `${ent.curbId} has no LED setting yet.${how}`], [[ent.curbId, u]]);
      const text = u.panelText ? `, showing "${u.panelText}"` : " with no panel text";
      const bright = typeof u.ledBrightness === "number" ? `, at ${u.ledBrightness}% brightness` : "";
      return sourced(ctx, [`${ent.curbId}'s LED is ${color}${text}${bright}.${how}`, `${ent.curbId} is lit ${color}${text}${bright}.${how}`, `On ${ent.curbId}: ${color}${text}${bright}.${how}`], [[ent.curbId, u]]);
    }),
  },
  {
    id: "lot_details", group: "status", lot: 4, usesLot: true,
    keys: [["tell me about", 3], ["everything about", 2.5], ["details", 2.5], ["info", 2], ["information", 2], ["how is", 1.5], ["how is lot", 2], ["status", 1], ["overview", 1], ["doing", 1], ["free", -2], ["spot", -1], ["curb", -1], ["offline", -2], ["battery", -2]],
    next: ["Which curbs are in that lot?", "Which lot is busiest?", "What needs attention?"],
    say: withData((ctx, ent) => {
      const lot = lotViews(ctx).find((l) => l.id === ent.lotId);
      if (!lot) return { variants: ["Which lot? Say its name, like Lot 6.", "Sure, which lot are you asking about?", "Tell me the lot's name and I'll pull it up."], chips: lotViews(ctx).slice(0, 3).map((l) => `Tell me about ${l.name}`) };
      const alerts = alertsOf(ctx);
      const low = lot.curbs.filter(([, u]) => isLowBattery(u, alerts)).length;
      const body = `\n• ${plural(lot.curbCount, "curb")}: ${lot.open} free, ${lot.occupied} occupied, ${lot.offline} offline\n• ${lot.pctFull === null ? "No occupancy yet" : `${lot.pctFull}% full`}\n• ${plural(low, "low battery", "low batteries")}`;
      return sourced(ctx, vary([`Here's ${lot.name}:`, `${lot.name} at a glance:`, `The rundown on ${lot.name}:`], body), lot.curbs);
    }),
  },
  {
    id: "lot_curbs", group: "status", lot: 3, usesLot: true,
    keys: [["which curb", 2], ["list curb", 2.5], ["curbs in", 2.5], ["what curb", 2], ["curb", 1], ["offline", -3], ["battery", -3], ["how many", -1], ["not in", -3], ["without", -3], ["free", -2], ["put", -3], ["how", -1.5]],
    next: ["Tell me about that lot", "Which curbs are offline?", "Show low batteries"],
    say: withData((ctx, ent) => {
      const lot = lotViews(ctx).find((l) => l.id === ent.lotId);
      if (!lot) return { variants: ["Which lot's curbs should I list?", "Sure, which lot?", "Name a lot and I'll list its curbs."], chips: lotViews(ctx).slice(0, 3).map((l) => `Curbs in ${l.name}`) };
      return curbList(ctx, ent, lot.curbs,
        [`${lot.name} has ${plural(lot.curbCount, "curb")}:`, `Curbs in ${lot.name}:`, `Here are ${lot.name}'s curbs:`],
        [`${lot.name} has no curbs yet.`, `No curbs report into ${lot.name} yet.`, `${lot.name} is empty of curbs for now.`],
        (u) => STATE(u));
    }),
  },
  {
    id: "free_spots_list", group: "status", usesLot: true,
    keys: [["which spot", 3], ["which curb free", 3], ["which space", 3], ["free", 1], ["list", 1.5], ["exactly", 2], ["exact", 2], ["which", 0.5]],
    next: ["How many spots are free?", "Where should I park?", "Which lot is busiest?"],
    say: withData((ctx, ent) => {
      const { entries, where } = scope(ctx, ent);
      const free = entries.filter(([, u]) => u.online && !u.occupied);
      return curbList(ctx, ent, free,
        [`These ${plural(free.length, "spot is", "spots are")} free${where}:`, `Free right now${where}:`, `Open spots${where}, by curb:`],
        [`No spots are free${where} right now.`, `Nothing free${where} at the moment.`, `Every spot${where} is taken or offline.`], () => "");
    }),
  },
  {
    id: "led_summary", group: "status", curb: -3, usesLot: true,
    keys: [["all led", 3], ["all panel", 3], ["panel showing", 2.5], ["update", -2], ["at once", -3], ["led color", 1.5], ["what color", 1.5], ["what are led", 2.5], ["set to", 2], ["led setting", 2.5], ["led", 1], ["zone", 0.5], ["how", -2], ["change", -3], ["mean", -3]],
    next: ["How do I change an LED colour?", "What are zone presets?", "What do the status colours mean?"],
    say: withData((ctx, ent) => {
      const { entries, where } = scope(ctx, ent);
      const counts = {};
      entries.forEach(([, u]) => { const c = cleanText(u.ledColor) || "not set"; counts[c] = (counts[c] || 0) + 1; });
      const body = `\n${Object.entries(counts).sort(([, a], [, b]) => b - a).map(([c, n]) => `• ${c}: ${n}`).join("\n")}`;
      return sourced(ctx, vary([`LED colours${where}:`, `Here's how the LEDs are set${where}:`, `The LED zones${where} look like this:`], body), entries);
    }),
  },
  {
    id: "site_summary", group: "status",
    keys: [["summary", 3], ["status report", 3.5], ["quick overview", 3.5], ["overview of everything", 4], ["everything", 1.5], ["how are things", 3.5], ["how is everything", 3.5], ["everything ok", 3], ["briefing", 3], ["rundown", 3], ["sitrep", 3], ["overview", 1.5], ["what is happening", 3], ["catch me up", 3.5], ["update me", 3]],
    next: ["What needs attention?", "Which lot is busiest?", "Is it busier than usual?"],
    say: withData((ctx) => {
      const alerts = alertsOf(ctx);
      const lots = lotViews(ctx);
      const all = curbEntries(ctx.units);
      const open = lots.reduce((s, l) => s + l.open, 0);
      const total = lots.reduce((s, l) => s + l.total, 0);
      const off = all.filter(([, u]) => !u.online).length;
      const low = all.filter(([, u]) => isLowBattery(u, alerts)).length;
      const busiest = lots.filter((l) => l.pctFull !== null).sort((a, b) => b.pctFull - a.pctFull)[0];
      const body = `\n• ${open} of ${total} spots free\n• ${off} offline, ${plural(low, "low battery", "low batteries")}${busiest ? `\n• Busiest: ${busiest.name} at ${busiest.pctFull}%` : ""}`;
      return sourced(ctx, vary(["Here's your quick summary:", "The short version:", "Catching you up:", "Here's where things stand:"], body));
    }),
  },
  {
    id: "lot_problems", group: "status",
    keys: [["most attention", 3], ["worst lot", 3.5], ["most offline", 3], ["most issue", 3], ["lot", 0.5], ["which lot", 1], ["problem lot", 3]],
    next: ["What needs attention?", "Which curbs are offline?", "Show low batteries"],
    say: withData((ctx) => {
      const alerts = alertsOf(ctx);
      const ranked = lotViews(ctx).map((l) => ({ ...l, issues: l.curbs.filter(([, u]) => unitIssues(u, alerts, ctx.now).length).length })).sort((a, b) => b.issues - a.issues);
      const top = ranked[0];
      if (!top || !top.issues) return sourced(ctx, ["No lot has anything needing attention. Nice and quiet.", "All lots are healthy right now.", "None of the lots has a problem at the moment."]);
      return sourced(ctx, [`${top.name} needs the most attention, with ${plural(top.issues, "curb")} flagged.`, `Most issues: ${top.name} (${top.issues}).`, `I'd start with ${top.name}: ${plural(top.issues, "curb needs", "curbs need")} a look.`], top.curbs);
    }),
  },
  {
    id: "recent_changes", group: "status", usesLot: true,
    keys: [["recent", 1], ["what changed", 3.5], ["changes", 2], ["recent changes", 4], ["nothing", -2], ["latest activity", 3.5], ["activity", 2.5], ["just happened", 3.5], ["what happened", 2.5], ["recently", 1.5], ["feed", 2]],
    next: ["When was the last update?", "Which curbs are offline?", "How many spots are free?"],
    say: withData((ctx, ent) => {
      const { entries, where } = scope(ctx, ent);
      const recent = entries.filter(([, u]) => typeof u.lastUpdated === "number").sort(([, a], [, b]) => b.lastUpdated - a.lastUpdated).slice(0, 5);
      if (!recent.length) return sourced(ctx, ["No curb has reported a change yet.", "Nothing to report: no readings with times yet.", "No recent activity to show."]);
      const body = `\n${recent.map(([id, u]) => `• ${id} is ${STATE(u)}, ${formatAgo(u.lastUpdated, ctx.now)}`).join("\n")}`;
      return sourced(ctx, vary([`The latest changes${where}:`, `Most recent activity${where}:`, `Here's what changed lately${where}:`], body), entries);
    }),
  },
  {
    id: "unassigned_curbs", group: "status",
    keys: [["unassigned", 3], ["no lot assigned", 4], ["customer", -3], ["not assigned", 3.5], ["not in lot", 3], ["arent in lot", 3], ["isnt in lot", 3], ["without lot", 3], ["no lot", 2.5], ["new curb", 2], ["curb", 0.5], ["how", -1]],
    next: ["How do I put a curb in a lot?", "How many curbs are there?", "Which curbs are offline?"],
    say: withData((ctx, ent) => {
      const loose = curbsWithoutLot(ctx);
      const r = curbList(ctx, ent, loose,
        [`${plural(loose.length, "curb isn't", "curbs aren't")} in a lot yet:`, "These curbs still need a lot:", `Not in a lot yet (${loose.length}):`],
        ["Every curb that has reported is in a lot.", "All curbs are in lots. Tidy!", "No loose curbs: they're all assigned."], () => "");
      const v = Array.isArray(r) ? r : r.variants;
      const out = loose.length ? v.map((t) => t.replace(/\n\n(From )/, "\n\nManagers put them in lots in Setup, on the Connect curbs step.\n\n$1")) : v;
      return Array.isArray(r) ? out : { ...r, variants: out };
    }),
  },
  {
    id: "stale_curbs", group: "status", usesLot: true,
    keys: [["stale", 3], ["quiet curb", 3], ["silent", 2.5], ["stopped reporting", 3], ["havent reported", 3], ["not reported", 3], ["not heard", 3], ["curb", 0.5], ["mean", -3], ["what is", -1.5], ["what does", -1.5]],
    next: ["Which curbs are offline?", "What does stale mean?", "When was the last update?"],
    say: withData((ctx, ent) => {
      const alerts = alertsOf(ctx);
      if (!alerts.staleEnabled) {
        return sourced(ctx, [
          "Flagging curbs that stop reporting is turned off, because curbs only send a reading when their spot changes. A manager can turn it on in Settings, under Alert thresholds. Ask me which curbs are offline instead.",
          "That check is switched off: a quiet curb on a quiet spot isn't necessarily broken. Managers can turn it on in Settings, Alert thresholds.",
          "Stale checks are off right now. If you'd like them, a manager can enable them in Settings, under Alert thresholds.",
        ]);
      }
      const { entries, where } = scope(ctx, ent);
      const stale = entries.filter(([, u]) => isStale(u, alerts, ctx.now));
      return curbList(ctx, ent, stale,
        [`${plural(stale.length, "curb hasn't", "curbs haven't")} reported for over ${alerts.staleMinutes} minutes${where}:`, `Gone quiet${where}:`, `These have been silent for ${alerts.staleMinutes}+ minutes${where}:`],
        [`No online curb${where} has been quiet for more than ${alerts.staleMinutes} minutes.`, `Nobody's gone quiet${where}.`, `All curbs${where} have reported within ${alerts.staleMinutes} minutes.`],
        (u) => `last heard ${formatAgo(u.lastUpdated, ctx.now)}`);
    }),
  },
  {
    id: "lot_list", group: "status", lot: -2,
    keys: [["what lot", 3], ["which lot", 1.5], ["list", 2], ["how many lot", 3.5], ["all lot", 2], ["lot name", 3], ["lot no curb", 5], ["lot without curb", 5], ["lot with no curb", 5], ["customer", -3], ["lot", 1], ["have", 0.5], ["free", -2], ["busy", -2], ["full", -2], ["should", -2], ["problem", -2], ["attention", -2], ["change", -3], ["rename", -3]],
    next: ["Free spots in each lot", "How many curbs are there?", "Which lot is busiest?"],
    say: withData((ctx) => {
      const lots = lotViews(ctx);
      if (!lots.length) return sourced(ctx, ["There are no lots yet.", "No lots so far.", "I don't see any lots yet."]);
      const body = `\n${lots.map((l) => `• ${l.name}: ${plural(l.curbCount, "curb")}`).join("\n")}`;
      return sourced(ctx, vary([`There ${lots.length === 1 ? "is 1 lot" : `are ${lots.length} lots`}:`, "Here are the lots:", `The site has ${plural(lots.length, "lot")}:`], body));
    }),
  },
  {
    id: "curb_count", group: "status", usesLot: true,
    keys: [["how many curb", 3.5], ["number of curb", 3.5], ["curb", 1], ["installed", 2], ["count", 1], ["total", 0.5], ["offline", -2], ["online", -2], ["free", -2], ["working", -2], ["which", -1]],
    next: ["Which curbs are offline?", "Which curbs aren't in a lot?", "What needs attention?"],
    say: withData((ctx, ent) => {
      const { entries, where } = scope(ctx, ent);
      const loose = where ? 0 : curbsWithoutLot(ctx).length;
      const tail = loose ? `, and ${loose} of them ${loose === 1 ? "isn't" : "aren't"} in a lot yet` : "";
      return sourced(ctx, [`There are ${plural(entries.length, "curb")}${where || ` across ${plural(lotViews(ctx).length, "lot")}`}${tail}.`, `${plural(entries.length, "curb")}${where} in total${tail}.`, `I count ${plural(entries.length, "curb")}${where}${tail}.`]);
    }),
  },
  {
    id: "data_mode_now", group: "status",
    keys: [["which mode", 3], ["what mode", 3], ["mode", 1], ["data source", 3], ["come from", 2.5], ["is this live", 3.5], ["live data", 2], ["is this simulation", 3.5], ["am i", 1], ["switch", -2.5], ["how", -1], ["back", -2]],
    next: ["How do I switch to Simulation?", "What is Simulation?", "When was the last update?"],
    say: (ctx) => (ctx.mode === "sim"
      ? ["You're looking at Simulation: simulated curbs and lots kept apart from the real ones. Nothing you see here is the real site. Switch to Live with Data source at the bottom of the sidebar.", "This is Simulation, so everything here is practice data. The real site is under Live, in Data source at the bottom of the sidebar.", "Simulated data right now. Flip Data source to Live for the real curbs."]
      : ["You're looking at Live data: the real curbs, as the hardware Receiver reports them. Simulation, under Data source at the bottom of the sidebar, shows a separate set of simulated curbs.", "This is Live: real curbs, reported by the Receiver.", "Live data, straight from the site. Simulation is a separate practice set under Data source."]),
  },

  // ---------- History (from history/week and history/live) ----------
  {
    id: "history_busiest_hour", group: "status",
    keys: [["busiest hour", 3.5], ["what hour", 3], ["which hour", 3], ["busy", 1], ["peak hour", 3.5], ["busiest time", 3.5], ["peak time", 3.5], ["rush hour", 2.5], ["when is it busiest", 4], ["when busy", 3], ["what time", 1], ["hour", 1], ["scenario", -4], ["simulation", -2]],
    next: ["When is the best time to park?", "What's the busiest day?", "Is it busier than usual?"],
    say: withWeek((ctx, ent, week, s) => fromHistory(ctx, [
      `The busiest hour is ${HOURS_LONG[s.peakHour]}, averaging ${pct(s.hourAvg[s.peakHour])} full across the week.`,
      `Peak time is around ${HOURS_LONG[s.peakHour]} (${pct(s.hourAvg[s.peakHour])} full on average).`,
      `Things are busiest at ${HOURS_LONG[s.peakHour]}, typically ${pct(s.hourAvg[s.peakHour])} full.`,
    ])),
  },
  {
    id: "history_quietest_hour", group: "status",
    keys: [["quietest hour", 3.5], ["get quiet", 3], ["quiet", 1.5], ["least busy", 1], ["time of day", 2], ["quietest time", 3.5], ["least busy hour", 4], ["least busy time", 4], ["least busy", 2.5], ["emptiest hour", 3.5], ["quiet", 1], ["hour", 1], ["time", 0.5]],
    next: ["When is it busiest?", "When is the best time to park?", "What's the quietest day?"],
    say: withWeek((ctx, ent, week, s) => fromHistory(ctx, [
      `The quietest hour is ${HOURS_LONG[s.quietHour]}, at ${pct(s.hourAvg[s.quietHour])} full on average.`,
      `It's calmest around ${HOURS_LONG[s.quietHour]} (${pct(s.hourAvg[s.quietHour])}).`,
      `${HOURS_LONG[s.quietHour]} is the quietest time, averaging ${pct(s.hourAvg[s.quietHour])} full.`,
    ])),
  },
  {
    id: "history_busiest_day", group: "status",
    keys: [["busiest day", 4], ["which day", 2.5], ["weekday is", 3], ["slowest", -6], ["least busy", -6], ["day of week", 1.5], ["day", 1], ["busy", 0.5], ["quiet", -3], ["least", -6]],
    next: ["What's the quietest day?", "When is it busiest?", "Weekends vs weekdays?"],
    say: withWeek((ctx, ent, week, s) => {
      const d = DAY_NAMES[["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][s.busyDay]];
      return fromHistory(ctx, [`${d} is the busiest day, averaging ${pct(s.dayAvg[s.busyDay])} full.`, `The busiest day of the week is ${d} (${pct(s.dayAvg[s.busyDay])} on average).`, `${d}s are the fullest, at ${pct(s.dayAvg[s.busyDay])}.`]);
    }),
  },
  {
    id: "history_quietest_day", group: "status",
    keys: [["quietest day", 4], ["slowest day", 4.5], ["slowest", 2], ["least busy", 1.5], ["least busy day", 4.5], ["emptiest day", 4], ["quiet day", 3], ["day", 1], ["quiet", 1]],
    next: ["What's the busiest day?", "When is the best time to park?", "Weekends vs weekdays?"],
    say: withWeek((ctx, ent, week, s) => {
      const d = DAY_NAMES[["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][s.quietDay]];
      return fromHistory(ctx, [`${d} is the quietest day, averaging ${pct(s.dayAvg[s.quietDay])} full.`, `The calmest day is ${d} (${pct(s.dayAvg[s.quietDay])}).`, `${d}s are the emptiest, at ${pct(s.dayAvg[s.quietDay])} on average.`]);
    }),
  },
  {
    id: "history_today_vs_yesterday", group: "status",
    keys: [["yesterday", 3], ["today vs", 2], ["compared to yesterday", 3.5], ["than yesterday", 3], ["today", 1], ["compare", 1.5]],
    next: ["Is it busier than usual?", "What's the busiest day?", "When is it busiest?"],
    say: withWeek((ctx, ent, week) => {
      const today = dayKey(ctx.now);
      const yesterday = dayKey(ctx.now, 1);
      const t = dayAverage(week, today);
      const y = dayAverage(week, yesterday);
      const diff = Math.round(t - y);
      const cmp = diff === 0 ? "about the same as" : diff > 0 ? `${diff} points busier than` : `${-diff} points quieter than`;
      // History holds typical days of the week, not actual dates, so never say "yesterday".
      const [T, Y] = [DAY_NAMES[today], DAY_NAMES[yesterday]];
      return fromHistory(ctx, [
        `A typical ${T} vs a typical ${Y}, from recorded history: ${pct(t)} vs ${pct(y)} full on average, so ${cmp} a typical ${Y}.`,
        `Comparing a typical ${T} with a typical ${Y} from recorded history: ${T}s average ${pct(t)} full, ${cmp} ${Y}s (${pct(y)}).`,
        `From recorded history, a typical ${T} runs ${pct(t)} full and a typical ${Y} ${pct(y)}.`,
      ]);
    }),
  },
  {
    id: "history_now_vs_usual", group: "status",
    keys: [["usual", 3], ["today normal", 3], ["unusually", 3], ["unusual", 3], ["than normal", 3], ["is this normal", 3], ["normal", 2], ["typical", 2.5], ["busier than", 2], ["quieter than", 2], ["unusual", 3]],
    next: ["When is it busiest?", "How full is the site?", "Today vs yesterday?"],
    say: withWeek((ctx, ent, week) => {
      const slot = hourSlot(ctx.now);
      const lots = lotViews(ctx);
      const reporting = lots.reduce((s, l) => s + l.open + l.occupied, 0);
      if (slot < 0 || !reporting) return fromHistory(ctx, ["History covers 7 AM to 8 PM, and I need curbs reporting to compare. Try again during the day.", "I can only compare between 7 AM and 8 PM, with curbs reporting.", "Not something I can compare right now: history covers 7 AM to 8 PM."]);
      const now = (lots.reduce((s, l) => s + l.occupied, 0) / reporting) * 100;
      const usual = week[dayKey(ctx.now)][slot];
      const d = Math.round(now - usual);
      const verdict = Math.abs(d) < 5 ? "about normal" : d > 0 ? `busier than usual by ${d} points` : `quieter than usual by ${-d} points`;
      return [
        `Right now the site is ${pct(now)} full; a typical ${DAY_NAMES[dayKey(ctx.now)]} at ${HOURS_LONG[slot]} is ${pct(usual)}. So it's ${verdict}.\n\n${sourceLine(ctx)} ${historySource(ctx)}`,
        `It's ${verdict}: ${pct(now)} now vs ${pct(usual)} on a usual ${DAY_NAMES[dayKey(ctx.now)]} at this hour.\n\n${sourceLine(ctx)} ${historySource(ctx)}`,
        `Compared with recorded history, today is ${verdict} (${pct(now)} vs ${pct(usual)}).\n\n${sourceLine(ctx)} ${historySource(ctx)}`,
      ];
    }),
  },
  {
    id: "history_average", group: "status",
    keys: [["average occupancy", 3.5], ["typical occupancy", 4], ["on average", 3], ["weekly average", 3.5], ["average", 1.5], ["this week", 1.5], ["typically", 2], ["battery", -3]],
    next: ["When is it busiest?", "What's the busiest day?", "Weekends vs weekdays?"],
    say: withWeek((ctx, ent, week, s) => fromHistory(ctx, [`Across the recorded week, the site averages ${pct(s.overall)} full.`, `Average occupancy is ${pct(s.overall)} over the week.`, `On average the lots are ${pct(s.overall)} full.`])),
  },
  {
    id: "history_weekend", group: "status",
    keys: [["weekend", 3], ["weekday", 3], ["saturday", 3], ["sunday", 3]],
    next: ["What's the busiest day?", "When is it busiest?", "When is the best time to park?"],
    say: withWeek((ctx, ent, week, s) => fromHistory(ctx, [
      `Weekdays average ${pct(s.weekday)} full and weekends ${pct(s.weekend)}.`,
      `Weekends run at ${pct(s.weekend)} on average, against ${pct(s.weekday)} on weekdays.`,
      `${s.weekend < s.weekday ? "Weekends are quieter" : "Weekends are busier"}: ${pct(s.weekend)} vs ${pct(s.weekday)} on weekdays.`,
    ])),
  },
  {
    id: "history_trend", group: "status",
    keys: [["getting busier", 4], ["getting quieter", 4], ["occupancy going", 3], ["filling up", 3.5], ["emptying", 3.5], ["last hour", 2.5], ["lately", 2], ["going up", 3], ["going down", 3], ["direction", 2]],
    next: ["How full is the site?", "Is it busier than usual?", "When is it busiest?"],
    say: (ctx) => {
      if (ctx.historyHidden) return HISTORY_NOT_SCOPED;
      const series = liveSeries(ctx).filter((p) => ctx.now - p.t < 3600000);
      if (series.length < 2) return [`There aren't enough recent readings to see a trend${ctx.mode === "sim" ? ". Start the simulation and give it a minute" : ""}.`, "I need a few recent readings to spot a trend, and there aren't enough yet.", "Not enough recent history to tell which way it's going."];
      const a = series[0];
      const b = series[series.length - 1];
      const mins = Math.max(1, Math.round((b.t - a.t) / 60000));
      const d = Math.round(b.pct - a.pct);
      const dir = Math.abs(d) < 3 ? "holding steady" : d > 0 ? "getting busier" : "getting quieter";
      return fromHistory(ctx, [`It's ${dir}: from ${pct(a.pct)} to ${pct(b.pct)} over the last ${mins} min.`, `Over ${mins} minutes, occupancy went from ${pct(a.pct)} to ${pct(b.pct)}, so ${dir}.`, `Trend: ${dir} (${pct(a.pct)} → ${pct(b.pct)} in ${mins} min).`]);
    },
  },
  {
    id: "best_time_to_park", group: "status",
    keys: [["best time", 3.5], ["good time", 3.5], ["when should i", 3], ["when to park", 3.5], ["when is it quiet", 3.5], ["avoid", 2], ["easiest", 2], ["time", 0.5], ["when", 1]],
    next: ["When is it busiest?", "Where should I park?", "What's the quietest day?"],
    say: withWeek((ctx, ent, week) => {
      const today = dayKey(ctx.now);
      const row = week[today];
      const q = row.indexOf(Math.min(...row));
      const p = row.indexOf(Math.max(...row));
      return fromHistory(ctx, [
        `On a typical ${DAY_NAMES[today]}, ${HOURS_LONG[q]} is easiest (${pct(row[q])} full). Avoid ${HOURS_LONG[p]} (${pct(row[p])}).`,
        `Best bet today: around ${HOURS_LONG[q]}. ${HOURS_LONG[p]} is usually the busiest.`,
        `For a ${DAY_NAMES[today]}, aim for ${HOURS_LONG[q]} and skip ${HOURS_LONG[p]}.`,
      ]);
    }),
  },
];

const STATUS_BY_ID = Object.fromEntries(STATUS_INTENTS.map((i) => [i.id, i]));

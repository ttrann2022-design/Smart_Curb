// Lot, curb and deployment intents (lots/, units/): counts, lots without a customer,
// a size or a location, one lot's details and curbs, offline curbs and low
// batteries by customer, and one curb's status.
import { batteryText, freeText } from "../../../unitStatus.js";
import { ago, curbEntries, customerViews, isLow, isOnline, lotViews, plural, sourced, sourceLine, vary } from "../data.js";
import { askLot, listing, poss, withData } from "../common.js";

const oneLot = (ctx, ent) => lotViews(ctx).find((l) => l.id === ent.lotId);
const forLot = (verb, chip, fn) => withData((ctx, ent) => {
  const l = ent.lotId && oneLot(ctx, ent);
  return l ? fn(ctx, ent, l) : askLot(ctx, verb, chip);
});
const STATE = (u) => (!isOnline(u) ? "offline" : u.occupied ? "occupied" : "free");
const lotOf = (ctx, u) => lotViews(ctx).find((l) => l.id === u.lot);

export const LOT_INTENTS = [
  {
    id: "lot_count", group: "status", lot: -3, customer: -3, lotIntent: "lot_details",
    keys: [["how many lot", 4.5], ["number of lot", 4], ["lot count", 4], ["lot", 1], ["how many", 1], ["total", 1], ["without", -3], ["unassigned", -3], ["curb", -1.5], ["customer", -1], ["most", -3], ["add", -3], ["import", -3]],
    next: ["Lots without a customer", "Lots without coordinates", "Total curbs online"],
    say: withData((ctx) => {
      const lots = lotViews(ctx);
      const free = lots.filter((l) => !l.siteId).length;
      const tail = free ? `, ${free} of them without a customer` : ", all with a customer";
      return sourced(ctx, [`There ${lots.length === 1 ? "is 1 lot" : `are ${lots.length} lots`}${tail}.`, `${plural(lots.length, "lot")} in total${tail}.`, `I count ${plural(lots.length, "lot")}${tail}.`]);
    }),
  },
  {
    id: "lots_unassigned", group: "status", lot: -3, customer: -3,
    keys: [["lot without customer", 5], ["unassigned lot", 5], ["unassigned", 3], ["no customer", 3.5], ["not assigned", 4], ["orphan", 3.5], ["without customer", 4], ["free lot", 2], ["how do i", -4], ["customer without", -5]],
    next: ["How do I assign a lot?", "How many lots are there?", "Customers without lots"],
    say: withData((ctx, ent) => listing(ctx, ent, lotViews(ctx).filter((l) => !l.siteId).map((l) => `${l.name}: ${l.curbs.length ? plural(l.curbs.length, "curb") : "no curbs"}`),
      ["Lots without a customer:", "These lots aren't assigned to anyone:", "Unassigned lots:"],
      ["Every lot has a customer.", "No unassigned lots.", "All lots are assigned."])),
  },
  {
    id: "lots_no_coords", group: "status", lot: -3,
    keys: [["without location", 5], ["no location", 5], ["missing location", 5], ["location", 2], ["without", 1], ["not on map", 4], ["where is", -2], ["how do i", -3]],
    next: ["Lots with no capacity", "How do I edit a lot?", "How many lots are there?"],
    say: withData((ctx, ent) => listing(ctx, ent, lotViews(ctx).filter((l) => !l.hasLocation).map((l) => `${l.name}${l.customer ? ` (${l.customer})` : ""}`),
      ["Lots with no coordinates:", "These have no latitude and longitude:", "Missing a location:"],
      ["Every lot has coordinates.", "No lot is missing a location.", "All lots have a latitude and longitude."])),
  },
  {
    id: "lots_no_size", group: "status", lot: -3,
    keys: [["without size", 5], ["no size", 5], ["missing size", 5], ["size", 2], ["without", 1], ["unknown size", 4], ["how do i", -3], ["biggest", -3], ["most", -3]],
    next: ["Lots without coordinates", "How do I edit a lot?", "How do I import lots?"],
    // A lot's size is its capacity, the curbs that report into it, so "no size" means no curbs yet.
    say: withData((ctx, ent) => listing(ctx, ent, lotViews(ctx).filter((l) => !l.curbs.length).map((l) => `${l.name}${l.customer ? ` (${l.customer})` : ""}`),
      ["Capacity comes from the curbs, so these lots have none yet (no curbs):", "No curbs yet, so no capacity:", "Lots without curbs (their size comes from the curbs):"],
      ["Every lot has curbs, so every lot has a capacity.", "No lot is without curbs.", "All lots have curbs reporting into them."])),
  },
  {
    id: "lot_details", group: "status", lot: 4, usesLot: true,
    keys: [["details", 2], ["tell me about", 2], ["info", 2], ["about", 0.5], ["what about", 1], ["lot", 0.5], ["details of this lot", 4], ["lot details", 3.5], ["how do i", -3]],
    next: ["Which curbs are in it?", "Which customer owns it?", "Lots without coordinates"],
    say: forLot("look up", (n) => `Tell me about ${n}`, (ctx, ent, l) => {
      const body = [
        `\nCustomer: ${l.customer || "none (unassigned)"}`,
        `Capacity: ${freeText({ curbs: l.curbs.length, capacity: l.capacity, free: l.free })} (from its curbs) · Location: ${l.hasLocation ? `${l.latitude}, ${l.longitude}` : "not set"}`,
        `Curbs: ${l.curbs.length ? `${l.curbs.length}, ${l.online} online${l.offline ? `, ${l.offline} offline` : ""}` : "none reporting yet"}`,
        `ID: ${l.id}`,
      ].join("\n");
      return sourced(ctx, vary([`${l.name}:`, `Here's ${l.name}:`, `${l.name}, at a glance:`], body));
    }),
  },
  {
    id: "lot_owner", group: "status", lot: 4, usesLot: true,
    keys: [["who own", 4], ["which customer", 3], ["whose", 3.5], ["belong", 3.5], ["owner", 3.5], ["assigned to", 3], ["owns", 4]],
    next: ["Which curbs are in it?", "Details of this lot", "Lots without a customer"],
    say: forLot("check the owner of", (n) => `Who owns ${n}?`, (ctx, ent, l) => (l.customer
      ? sourced(ctx, [`${l.name} belongs to ${l.customer}.`, `${poss(l.customer)} lot: ${l.name}.`, `It's assigned to ${l.customer}.`])
      : sourced(ctx, [`${l.name} has no customer yet.`, `Nobody owns ${l.name} right now: it's unassigned.`, `${l.name} isn't assigned. Assign it on a customer's page.`]))),
  },
  {
    id: "lot_curbs", group: "status", lot: 4, usesLot: true,
    keys: [["curb in", 3.5], ["which curb", 2.5], ["curb", 1.5], ["sensor", 1], ["installed", 1.5], ["how many curb", 2]],
    next: ["Which customer owns it?", "Which curbs are offline?", "Details of this lot"],
    say: forLot("list the curbs of", (n) => `Curbs in ${n}`, (ctx, ent, l) => {
      if (!l.curbs.length) return sourced(ctx, [`No curbs report into ${l.name} yet.`, `${l.name} has no curbs so far.`, `Zero curbs in ${l.name}.`]);
      return listing(ctx, ent, l.curbs.map(([id, u]) => `${id}: ${STATE(u)}, battery ${batteryText(u)}`),
        [`${l.name} has ${plural(l.curbs.length, "curb")}:`, `Curbs in ${l.name}:`, `Here are ${poss(l.name)} curbs:`], []);
    }),
  },
  {
    id: "curb_total", group: "status", lot: -2, customer: -3, curb: -3,
    keys: [["how many curb", 4], ["total curb", 4.5], ["curb online", 4], ["online", 2], ["curb", 1], ["how many", 0.5], ["total", 1], ["offline", -1.5], ["low", -2], ["customer", -1], ["most", -3]],
    next: ["Which curbs are offline?", "Show low batteries", "Which customers have real curbs?"],
    say: withData((ctx) => {
      const all = curbEntries(ctx);
      const on = all.filter(([, u]) => isOnline(u)).length;
      return sourced(ctx, [`${plural(all.length, "curb")} in total, ${on} online and ${all.length - on} offline.`, `${on} of ${plural(all.length, "curb")} are online.`, `Curbs: ${all.length}. Online: ${on}. Offline: ${all.length - on}.`]);
    }),
  },
  {
    id: "curbs_offline", group: "status", curb: -3, customer: -4,
    keys: [["which curb offline", 5], ["offline curb", 4.5], ["offline", 2.5], ["down", 1.5], ["not reporting", 3.5], ["dead", 2], ["by customer", -3], ["per customer", -3], ["most", -3], ["mean", -3], ["low", -1.5]],
    next: ["Offline curbs by customer", "Show low batteries", "What does offline mean?"],
    say: withData((ctx, ent) => listing(ctx, ent, curbEntries(ctx).filter(([, u]) => !isOnline(u)).map(([id, u]) => {
      const l = lotOf(ctx, u);
      return `${id} in ${l ? `${l.name}${l.customer ? ` (${l.customer})` : ""}` : "no lot"}, last heard ${ago(ctx, u.lastUpdated)}`;
    }), ["Offline curbs:", "These curbs are offline:", "Not reporting right now:"], ["Every curb is online.", "No curb is offline.", "All curbs are reporting."])),
  },
  {
    id: "offline_by_customer", group: "status", customer: -3,
    keys: [["offline by customer", 5], ["offline per customer", 5], ["offline each customer", 5], ["by customer", 3], ["per customer", 3], ["each customer", 2.5], ["offline", 1.5], ["low", -2], ["battery", -2]],
    next: ["Low batteries by customer", "Which customer has the most offline curbs?", "Which curbs are offline?"],
    say: withData((ctx) => {
      const rows = customerViews(ctx).filter((c) => c.curbs.length);
      if (!rows.length) return sourced(ctx, ["No customer has curbs yet.", "There are no customer curbs to check.", "None of the customers have curbs reporting."]);
      const body = `\n${rows.map((c) => `• ${c.name}: ${c.offline} offline of ${c.curbs.length}`).join("\n")}`;
      return sourced(ctx, vary(["Offline curbs by customer:", "Per customer:", "Here's each customer's offline count:"], body));
    }),
  },
  {
    id: "low_battery", group: "status", curb: -3, customer: -4,
    keys: [["low battery", 5], ["battery", 2.5], ["low", 1.5], ["replace", 1.5], ["by customer", -3], ["per customer", -3], ["each customer", -3], ["mean", -3], ["what is", -2.5], ["threshold", -4], ["counts as", -4]],
    next: ["Low batteries by customer", "Which curbs are offline?", "What counts as a low battery?"],
    say: withData((ctx, ent) => listing(ctx, ent, curbEntries(ctx).filter(([, u]) => isLow(u)).sort(([, a], [, b]) => a.battery - b.battery).map(([id, u]) => {
      const l = lotOf(ctx, u);
      return `${id}: ${u.battery}%, ${l ? `${l.name}${l.customer ? ` (${l.customer})` : ""}` : "no lot"}`;
    }), ["Low batteries, lowest first:", "These batteries are low:", "Below the low-battery mark:"], ["No battery is low.", "Every battery is fine.", "Nothing below the low-battery mark."])),
  },
  {
    id: "low_battery_by_customer", group: "status", customer: -3,
    keys: [["low battery by customer", 5.5], ["battery by customer", 5], ["battery per customer", 5], ["by customer", 3], ["per customer", 3], ["each customer", 3], ["for each", 2], ["battery", 1], ["low", 1], ["offline", -2]],
    next: ["Offline curbs by customer", "Show low batteries", "Which customer has the most offline curbs?"],
    say: withData((ctx) => {
      const rows = customerViews(ctx).filter((c) => c.curbs.length);
      if (!rows.length) return sourced(ctx, ["No customer has curbs yet.", "There are no customer curbs to check.", "None of the customers have curbs reporting."]);
      const body = `\n${rows.map((c) => `• ${c.name}: ${c.low} low of ${c.curbs.length}`).join("\n")}`;
      return sourced(ctx, vary(["Low batteries by customer:", "Per customer:", "Each customer's low-battery count:"], body));
    }),
  },
  {
    id: "sites_real_curbs", group: "status", customer: -3,
    keys: [["real curb", 5], ["have curb", 4], ["no curb", 4], ["curb vs none", 5], ["which customer curb", 4], ["hardware installed", 4], ["any curb", 3], ["actually", 1], ["customer", 0.5], ["curb", 0.5]],
    next: ["Customers without lots", "Total curbs online", "Which customer has the most curbs?"],
    say: withData((ctx) => {
      const all = customerViews(ctx);
      const withCurbs = all.filter((c) => c.curbs.length);
      const without = all.filter((c) => !c.curbs.length);
      const body = `\nWith curbs: ${withCurbs.length ? withCurbs.map((c) => `${c.name} (${c.curbs.length})`).join(", ") : "none"}\nNo curbs yet: ${without.length ? without.map((c) => c.name).join(", ") : "none"}`;
      return sourced(ctx, vary(["Which customers have curbs:", "Curbs vs none:", "Here's who has hardware reporting:"], body));
    }),
  },
  {
    id: "curb_status", group: "status", curb: 4, usesCurb: true,
    keys: [["status", 1], ["curb status", 4], ["status of curb", 4], ["how is", 1], ["check", 1], ["what about", 1], ["tell me about", 1.5], ["free", 0.5], ["occupied", 0.5], ["where is", 1.5], ["which lot", 1]],
    next: ["Which curbs are offline?", "Show low batteries", "Total curbs online"],
    say: withData((ctx, ent) => {
      if (!ent.curbId) {
        const ids = curbEntries(ctx).slice(0, 3).map(([id]) => id);
        return { variants: [`Which curb? Give its ID, like ${ids[0] || "C-012"}.`, "Sure, which curb ID?", `Name the curb, for example ${ids[0] || "C-012"}.`], chips: ids.map((id) => `Status of ${id}`) };
      }
      const u = ctx.units?.[ent.curbId];
      if (!u || typeof u !== "object") {
        const where = ctx.mode === "sim" ? "simulated" : "live";
        return [`There's no curb called ${ent.curbId} in the ${where} data.`, `I can't find ${ent.curbId} in the ${where} data. Deployments lists every curb.`, `${ent.curbId} doesn't exist in the ${where} data.`];
      }
      const l = lotOf(ctx, u);
      const where = l ? `in ${l.name}${l.customer ? ` (${l.customer})` : ", which has no customer"}` : "not in a lot yet";
      const body = `\nStatus: ${STATE(u)} · Battery: ${batteryText(u)} · Last heard ${ago(ctx, u.lastUpdated)}`;
      const state = isOnline(u) ? STATE(u) : "offline, so I can't tell whether it's free";
      if (ent.occupancy) return [`${ent.curbId} is ${state} right now. It's ${where}.${body}\n\n${sourceLine(ctx)}`, `Right now ${ent.curbId} is ${state}, ${where}.${body}\n\n${sourceLine(ctx)}`, `${ent.curbId}: ${state}. It's ${where}.${body}\n\n${sourceLine(ctx)}`];
      return sourced(ctx, vary([`${ent.curbId} is ${where}.`, `Here's ${ent.curbId}, ${where}:`, `${ent.curbId} (${where}):`], body));
    }),
  },
  {
    id: "curbs_unplaced", group: "status", curb: -3,
    keys: [["curb not in lot", 5], ["curb without lot", 5], ["loose curb", 4], ["unplaced", 4], ["no lot", 2.5], ["not in a lot", 4], ["customer", -2]],
    next: ["Lots without a customer", "Total curbs online", "Which curbs are offline?"],
    say: withData((ctx, ent) => {
      const lots = lotViews(ctx).map((l) => l.id);
      return listing(ctx, ent, curbEntries(ctx).filter(([, u]) => !lots.includes(u.lot)).map(([id, u]) => `${id}: ${STATE(u)}`),
        ["Curbs that aren't in a lot:", "These curbs report in but have no lot:", "Not placed in a lot yet:"],
        ["Every curb is in a lot.", "No loose curbs.", "All curbs belong to a lot."]);
    }),
  },
  {
    id: "lot_biggest", group: "status", lot: -3,
    keys: [["biggest lot", 5], ["largest lot", 5], ["most spots", 4.5], ["most", 1], ["size", 1], ["customer", -3], ["curb", -2], ["smallest", -2]],
    next: ["Lots with no capacity", "How many lots are there?", "Total spots across all lots"],
    say: withData((ctx) => {
      // Size is capacity: the curbs that report into the lot (offline ones don't count).
      const sized = lotViews(ctx).filter((l) => l.capacity).sort((a, b) => b.capacity - a.capacity);
      if (!sized.length) return sourced(ctx, ["No lot has a curb reporting yet, so none has a capacity.", "I can't tell: capacity comes from the curbs, and none is reporting.", "None of the lots has capacity yet: no curbs are reporting."]);
      const l = sized[0];
      return sourced(ctx, [`The biggest lot is ${l.name}, with ${plural(l.capacity, "spot")} of capacity from its curbs${l.customer ? ` (${l.customer})` : ""}.`, `${l.name} is largest: ${plural(l.capacity, "reporting curb")}.`, `Most capacity: ${l.name}, ${l.capacity} spots.`]);
    }),
  },
  {
    id: "spots_total", group: "status", lot: -3,
    keys: [["total spots", 5], ["how many spots", 4], ["spots", 2], ["all lots", 1.5], ["size", 1.5], ["total", 1], ["biggest", -3], ["without", -3]],
    next: ["Biggest lot", "Lots with no capacity", "How many lots are there?"],
    say: withData((ctx) => {
      const lots = lotViews(ctx);
      // Capacity is the reporting curbs (lotCounts); offline curbs and lots with no curbs add nothing.
      const sum = lots.reduce((s, l) => s + l.capacity, 0);
      const free = lots.reduce((s, l) => s + l.free, 0);
      const offline = lots.reduce((s, l) => s + l.offline, 0);
      const empty = lots.filter((l) => !l.curbs.length).length;
      const notes = [offline && `${plural(offline, "offline curb")} not counted`, empty && `${plural(empty, "lot")} with no curbs yet`].filter(Boolean);
      const tail = notes.length ? ` (${notes.join("; ")})` : "";
      return sourced(ctx, [
        `${plural(sum, "spot")} of capacity across ${plural(lots.length, "lot")}, ${free.toLocaleString()} free right now${tail}.`,
        `All lots together: ${free.toLocaleString()} free of ${sum.toLocaleString()}${tail}.`,
        `Total capacity is ${plural(sum, "spot")} from the reporting curbs, ${free.toLocaleString()} of them free${tail}.`,
      ]);
    }),
  },
  {
    id: "data_freshness", group: "status",
    keys: [["how fresh", 4], ["last update", 4], ["updated", 2], ["recent reading", 4], ["when did data", 3.5], ["how old", 3], ["up to date", 3.5], ["stale", 1]],
    next: ["Which curbs are offline?", "Am I in Live or Simulation?", "Total curbs online"],
    say: withData((ctx) => {
      const line = sourceLine(ctx).replace(/\.$/, "");
      return [`The console reads the database in real time, so these numbers are current. ${line}.`, `Everything I say is read just now. ${line}.`, `Fresh: I read the data as you ask. ${line}.`];
    }),
  },
  {
    id: "data_mode_now", group: "status",
    keys: [["which mode", 4], ["what mode", 4], ["is this live", 4], ["is this simulation", 4], ["am i in", 3], ["live or simulation", 4.5], ["mode", 1.5], ["how do i", -4], ["switch", -3], ["mean", -2], ["difference", -3]],
    next: ["How do I switch Live/Simulation?", "What does Live vs Simulation show?", "Summary"],
    say: (ctx) => (ctx.mode === "sim"
      ? ["You're in Simulation: demo customers, fake requests and simulated curbs, kept apart from the real ones.", "Simulation. Nothing here is a real customer.", "This is Simulation mode; flip Data source to Live for the real data."]
      : ["You're in Live: real customers, real quote requests and the real hardware.", "Live data, straight from the database.", "This is Live. Simulation is a separate practice set under Data source."]),
  },
  {
    id: "site_summary", group: "status",
    keys: [["summary", 4], ["overview", 4], ["big picture", 4], ["how are we doing", 3.5], ["status report", 4], ["sum up", 3.5], ["everything", 2], ["dashboard", 1], ["of", -1]],
    next: ["How many new requests?", "Which curbs are offline?", "List customers"],
    say: withData((ctx) => {
      const cs = customerViews(ctx);
      const lots = lotViews(ctx);
      const curbs = curbEntries(ctx);
      const on = curbs.filter(([, u]) => isOnline(u)).length;
      const fresh = (ctx.leads ? Object.values(ctx.leads) : []).filter((l) => l?.status === "new").length;
      const body = [
        `\n• Customers: ${cs.length} (${cs.filter((c) => c.status === "active").length} active)`,
        `• Requests: ${fresh} new`,
        `• Lots: ${lots.length} (${lots.filter((l) => !l.siteId).length} unassigned)`,
        `• Curbs: ${on} of ${curbs.length} online, ${curbs.filter(([, u]) => isLow(u)).length} low battery`,
      ].join("\n");
      return sourced(ctx, vary(["Here's the big picture:", "Summary:", "Where things stand:", "The console at a glance:"], body));
    }),
  },
];

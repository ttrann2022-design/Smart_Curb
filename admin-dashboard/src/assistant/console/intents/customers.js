// Customer intents (sites/): counts, lists, one customer's details, lots, curbs and
// contact, and rankings. Each `say` returns 3-5 variants of the same facts.
import { STATUS_LABEL, TYPE_LABEL, ago, customerViews, isLow, leadName, leadViews, plural, sourced, vary } from "../data.js";
import { askCustomer, listing, poss, withData } from "../common.js";

const STATUSES = ["active", "prospect", "paused"];
const one = (ctx, ent) => customerViews(ctx).find((c) => c.id === ent.customerId);
const curbLine = (c) => (c.curbs.length ? `${plural(c.curbs.length, "curb")}, ${c.online} online` : "no curbs yet");
const lotLine = (c) => (c.lots.length ? plural(c.lots.length, "lot") : "no lots");

// An answer about one named customer: asks which, or `fn` with its view.
const forCustomer = (verb, chip, fn) => withData((ctx, ent) => {
  if (!ent.customerId) return askCustomer(ctx, verb, chip);
  const c = one(ctx, ent);
  return c ? fn(ctx, ent, c) : askCustomer(ctx, verb, chip);
});

export const CUSTOMER_INTENTS = [
  {
    id: "customer_count", group: "status", customer: -3, customerIntent: "customer_details",
    keys: [["how many customer", 4], ["number of customer", 4], ["customer count", 4], ["customer", 1], ["count", 1], ["total", 1], ["how many", 1],
      ["lot", -2], ["curb", -2], ["request", -2], ["most", -2], ["without", -2], ["add", -3], ["remove", -3], ["recent", -1.5], ["type", -1.5], ["active", -0.5], ["prospect", -0.5], ["paused", -0.5]],
    next: ["Active vs prospect vs paused", "List customers", "Newest customer"],
    say: withData((ctx) => {
      const all = customerViews(ctx);
      const by = Object.fromEntries(STATUSES.map((s) => [s, all.filter((c) => c.status === s).length]));
      const tail = ` (${by.active} active, ${by.prospect} prospect, ${by.paused} paused)`;
      return sourced(ctx, [
        `There ${all.length === 1 ? "is 1 customer" : `are ${all.length} customers`}${tail}.`,
        `${plural(all.length, "customer")} in total${tail}.`,
        `I count ${plural(all.length, "customer")}${tail}.`,
        `You have ${plural(all.length, "customer")} on the books${tail}.`,
      ]);
    }),
  },
  {
    id: "customer_by_status", group: "status", customer: -3,
    keys: [["active vs prospect", 5], ["by status", 3.5], ["status breakdown", 4], ["active", 1.5], ["prospect", 1.5], ["paused", 1.5], ["vs", 1], ["breakdown", 2], ["split", 1.5],
      ["customer status", 2.5], ["which", -1], ["list", -1], ["request", -3], ["mean", -3], ["change", -3]],
    next: ["Which customers are prospects?", "Which customers are paused?", "List customers"],
    say: withData((ctx) => {
      const all = customerViews(ctx);
      const body = `\n${STATUSES.map((s) => { const n = all.filter((c) => c.status === s); return `• ${s[0].toUpperCase()}${s.slice(1)}: ${n.length}${n.length ? ` (${n.map((c) => c.name).join(", ")})` : ""}`; }).join("\n")}`;
      return sourced(ctx, vary(["Customers by status:", "Here's the split:", `Of ${plural(all.length, "customer")}:`, "Active, prospect and paused:"], body));
    }),
  },
  {
    id: "customer_active", group: "status", customer: -3,
    keys: [["active customer", 4.5], ["which active", 3], ["active", 2], ["live customer", 3], ["paying", 2.5], ["prospect", -2], ["paused", -2], ["vs", -2], ["mean", -3]],
    next: ["Which customers are prospects?", "Which customer has the most curbs?", "List customers"],
    say: withData((ctx, ent) => listing(ctx, ent, customerViews(ctx).filter((c) => c.status === "active").map((c) => `${c.name}: ${lotLine(c)}, ${curbLine(c)}`),
      ["Active customers:", "These are active:", "Customers marked active:"],
      ["No customer is marked active yet.", "None are active right now.", "There aren't any active customers yet."])),
  },
  {
    id: "customer_prospects", group: "status", customer: -3,
    keys: [["prospect", 3.5], ["which prospect", 4], ["prospective", 3], ["not signed", 2.5], ["pipeline", 2.5], ["active", -2], ["paused", -2], ["vs", -2], ["mean", -3], ["request", -1.5]],
    next: ["Which customers are active?", "How many new requests?", "List customers"],
    say: withData((ctx, ent) => listing(ctx, ent, customerViews(ctx).filter((c) => c.status === "prospect").map((c) => `${c.name} (${TYPE_LABEL[c.type] || "other"}), added ${ago(ctx, c.createdAt)}`),
      ["Prospects:", "Customers still at prospect:", "These are prospects:"],
      ["No prospects right now.", "There are no customers at prospect.", "Nobody is a prospect at the moment."])),
  },
  {
    id: "customer_paused", group: "status", customer: -3,
    keys: [["paused", 3.5], ["on hold", 3.5], ["inactive", 3], ["suspended", 3], ["active", -1.5], ["prospect", -2], ["vs", -2], ["mean", -3]],
    next: ["Which customers are active?", "What does paused mean?", "List customers"],
    say: withData((ctx, ent) => listing(ctx, ent, customerViews(ctx).filter((c) => c.status === "paused").map((c) => `${c.name}: ${lotLine(c)}`),
      ["Paused customers:", "These are paused:", "On hold:"],
      ["No customer is paused.", "Nobody's paused right now.", "There are no paused customers."])),
  },
  {
    id: "customer_list", group: "status", customer: -3, customerIntent: "customer_details",
    keys: [["list customer", 4.5], ["all customer", 4], ["show customer", 4], ["customer list", 4.5], ["who are our customer", 4.5], ["customer name", 3], ["customer", 1], ["list", 1.5], ["all", 0.5],
      ["how many", -2], ["most", -2], ["without", -2.5], ["active", -1.5], ["prospect", -1.5], ["paused", -1.5], ["add", -3], ["recent", -2], ["lot", -1]],
    next: ["Active vs prospect vs paused", "Which customer has the most lots?", "Customers without lots"],
    say: withData((ctx, ent) => listing(ctx, ent, customerViews(ctx).map((c) => `${c.name}: ${STATUS_LABEL[c.status] || "no status"}, ${lotLine(c)}`),
      ["Here are the customers:", "Your customers:", "All customers, A to Z:", "The customer list:"],
      ["There are no customers yet.", "The customer list is empty.", "No customers so far."])),
  },
  {
    id: "customer_details", group: "status", customer: 4, usesCustomer: true,
    keys: [["details", 2.5], ["tell me about", 2.5], ["tell me about customer", 3.5], ["info", 2], ["information", 2], ["about", 0.5], ["overview of", 2], ["profile", 2.5], ["who is", 1], ["what about", 1], ["summary of", 2],
      ["contact", -1], ["lot", -0.5], ["curb", -0.5], ["how many", -1], ["add", -3], ["remove", -3]],
    next: ["What about its lots?", "Who's the contact?", "Any offline curbs there?"],
    say: forCustomer("look up", (n) => `Tell me about ${n}`, (ctx, ent, c) => {
      const lead = c.fromLeadId ? leadViews(ctx).find((l) => l.id === c.fromLeadId) : null;
      const body = [
        `\nType: ${TYPE_LABEL[c.type] || "other"} · Status: ${STATUS_LABEL[c.status] || "not set"}`,
        `Contact: ${c.contactName || "none given"}${c.contactEmail ? `, ${c.contactEmail}` : ""}`,
        `Lots: ${c.lots.length ? c.lots.map((l) => l.name).join(", ") : "none yet"}`,
        `Curbs: ${c.curbs.length ? `${c.curbs.length}, ${c.online} online${c.offline ? `, ${c.offline} offline` : ""}${c.low ? `, ${c.low} low battery` : ""}` : "none yet"}`,
        `Added: ${ago(ctx, c.createdAt)}${lead ? ` · From ${poss(lead.name || "a")} request` : ""}`,
      ].join("\n");
      return sourced(ctx, vary([`${c.name}:`, `Here's ${c.name}:`, `${c.name}, at a glance:`, `What I know about ${c.name}:`], body));
    }),
  },
  {
    id: "customer_contact", group: "status", customer: 4, usesCustomer: true,
    keys: [["contact", 3], ["who is contact", 4], ["email", 1], ["who do i talk to", 3.5], ["reach", 1], ["contact person", 4], ["contact for", 3], ["phone", 1.5], ["request", -2], ["how do i", -2]],
    next: ["Tell me about its lots", "What's its status?", "List customers"],
    say: forCustomer("find the contact for", (n) => `Who is the contact for ${n}?`, (ctx, ent, c) => {
      if (!c.contactName && !c.contactEmail) return sourced(ctx, [`${c.name} has no contact saved. Edit the customer to add one.`, `No contact on file for ${c.name} yet.`, `There's no contact for ${c.name}. Its page has an Edit button to add one.`]);
      const who = `${c.contactName || "No name given"}${c.contactEmail ? ` (${c.contactEmail})` : ", no email saved"}`;
      return sourced(ctx, [`${poss(c.name)} contact is ${who}.`, `For ${c.name}, talk to ${who}.`, `Contact at ${c.name}: ${who}.`]);
    }),
  },
  {
    id: "customer_status_one", group: "status", customer: 4, usesCustomer: true,
    keys: [["status", 2], ["is active", 2.5], ["is prospect", 2.5], ["is paused", 2.5], ["what status", 3], ["active", 0.5], ["change", -3], ["how do i", -3], ["vs", -2]],
    next: ["What does each status mean?", "Tell me about its lots", "Active vs prospect vs paused"],
    say: forCustomer("check the status of", (n) => `What status is ${n}?`, (ctx, ent, c) => {
      const s = STATUS_LABEL[c.status] || "not set";
      return sourced(ctx, [`${c.name} is ${s}.`, `${poss(c.name)} status: ${s}.`, `Right now ${c.name} is marked ${s}.`]);
    }),
  },
  {
    id: "customer_type_one", group: "status", customer: 4, usesCustomer: true,
    keys: [["what type", 3], ["type of", 2.5], ["kind of", 2.5], ["type", 1.5], ["campus", 1], ["mall", 1], ["hotel", 1], ["breakdown", -3], ["by type", -3], ["split", -3]],
    next: ["Tell me about its lots", "Customers by type", "List customers"],
    say: forCustomer("check the type of", (n) => `What type is ${n}?`, (ctx, ent, c) => {
      const t = TYPE_LABEL[c.type] || "other";
      return sourced(ctx, [`${c.name} is a ${t} customer.`, `${poss(c.name)} type: ${t}.`, `It's set up as ${/^[aeiou]/.test(t) ? "an" : "a"} ${t}.`]);
    }),
  },
  {
    id: "customer_lots", group: "status", customer: 4, usesCustomer: true,
    keys: [["lots of", 2.5], ["lot", 1.5], ["its lot", 3.5], ["their lot", 3.5], ["which lot", 2], ["what lot", 2], ["how many lot", 2], ["lot do", 1.5], ["have", 0.5],
      ["curb", -1], ["offline", -2], ["assign", -2], ["add", -2.5], ["without", -3], ["most", -3], ["unassign", -3]],
    next: ["Any offline curbs there?", "Who's the contact?", "Lots without a customer"],
    say: forCustomer("list the lots of", (n) => `Lots of ${n}`, (ctx, ent, c) => {
      if (!c.lots.length) return sourced(ctx, [`${c.name} has no lots yet. Assign one on its page.`, `No lots point to ${c.name} yet.`, `${c.name} doesn't have any lots so far.`]);
      const body = `\n${c.lots.map((l) => `• ${l.name}: ${l.curbs.length ? `${plural(l.curbs.length, "curb")}, ${l.online} online` : "no curbs yet"}${l.totalSpots ? ` · ${l.totalSpots} spots` : ""}`).join("\n")}`;
      return sourced(ctx, vary([`${c.name} has ${plural(c.lots.length, "lot")}:`, `${poss(c.name)} lots:`, `Lots belonging to ${c.name}:`], body));
    }),
  },
  {
    id: "customer_curbs", group: "status", customer: 4, usesCustomer: true,
    keys: [["curb", 2], ["how many curb", 3], ["its curb", 3.5], ["their curb", 3.5], ["online", 1], ["hardware", 1], ["installed", 2], ["offline", -1], ["low", -2], ["battery", -2], ["most", -3]],
    next: ["Any offline curbs there?", "Tell me about its lots", "Total curbs online"],
    say: forCustomer("count the curbs of", (n) => `How many curbs does ${n} have?`, (ctx, ent, c) => {
      if (!c.curbs.length) return sourced(ctx, [`${c.name} has no curbs reporting yet${c.lots.length ? `, though it has ${plural(c.lots.length, "lot")}` : ""}.`, `No curbs report into ${poss(c.name)} lots yet.`, `${c.name}: zero curbs so far.`]);
      const tail = c.offline ? `, ${c.offline} offline` : ", none offline";
      return sourced(ctx, [`${c.name} has ${plural(c.curbs.length, "curb")}: ${c.online} online${tail}.`, `${plural(c.curbs.length, "curb")} across ${poss(c.name)} ${plural(c.lots.length, "lot")}; ${c.online} online${tail}.`, `${poss(c.name)} curbs: ${c.curbs.length} in total, ${c.online} online${tail}.`]);
    }),
  },
  {
    id: "customer_offline", group: "status", customer: 4, usesCustomer: true,
    keys: [["offline", 2.5], ["low", 1.5], ["battery", 1.5], ["problem", 2], ["down", 1.5], ["any offline", 3], ["attention", 2], ["which customer", -2], ["most", -3], ["by customer", -3], ["per customer", -3], ["each customer", -3]],
    next: ["Which customer has the most offline curbs?", "Low batteries by customer", "Tell me about its lots"],
    say: forCustomer("check", (n) => `Offline curbs at ${n}`, (ctx, ent, c) => {
      const off = c.curbs.filter(([, u]) => u.online !== true).map(([id]) => id);
      const low = c.curbs.filter(([, u]) => isLow(u)).map(([id, u]) => `${id} (${u.battery}%)`);
      if (!c.curbs.length) return sourced(ctx, [`${c.name} has no curbs yet, so nothing can be offline.`, `No curbs at ${c.name} yet.`, `${c.name} hasn't got any curbs reporting.`]);
      if (!off.length && !low.length) return sourced(ctx, [`All ${plural(c.curbs.length, "curb")} at ${c.name} are online, and no battery is low.`, `${c.name} looks healthy: nothing offline, no low batteries.`, `Nothing to worry about at ${c.name}.`]);
      const body = [off.length ? `\nOffline: ${off.join(", ")}` : "\nOffline: none", `Low battery: ${low.length ? low.join(", ") : "none"}`].join("\n");
      return sourced(ctx, vary([`${c.name}:`, `Problems at ${c.name}:`, `Here's what needs a look at ${c.name}:`], body));
    }),
  },
  {
    id: "most_lots_customer", group: "status", customer: -3,
    keys: [["most lot", 5], ["customer most lot", 5], ["which customer most", 2], ["most", 1.5], ["lot", 0.5], ["curb", -2], ["offline", -3], ["request", -3]],
    next: ["Which customer has the most curbs?", "Customers without lots", "List customers"],
    say: withData((ctx) => {
      const top = [...customerViews(ctx)].sort((a, b) => b.lots.length - a.lots.length);
      if (!top.length || !top[0].lots.length) return sourced(ctx, ["No customer has any lots yet.", "None of the customers have lots so far.", "Nobody has a lot assigned yet."]);
      const tied = top.filter((c) => c.lots.length === top[0].lots.length).map((c) => c.name);
      const who = tied.length > 1 ? `${tied.join(" and ")} (tied)` : tied[0];
      return sourced(ctx, [`${who} ${tied.length > 1 ? "have" : "has"} the most lots: ${top[0].lots.length}.`, `Most lots: ${who}, with ${top[0].lots.length}.`, `${who} lead${tied.length > 1 ? "" : "s"} on lots, at ${top[0].lots.length}.`]);
    }),
  },
  {
    id: "most_curbs_customer", group: "status", customer: -3,
    keys: [["most curb", 5], ["customer most curb", 5], ["biggest customer", 4], ["largest customer", 4], ["most", 1.5], ["curb", 0.5], ["offline", -3], ["down", -3], ["lot", -1.5], ["request", -3]],
    next: ["Which customer has the most offline curbs?", "Which customer has the most lots?", "Total curbs online"],
    say: withData((ctx) => {
      const top = [...customerViews(ctx)].sort((a, b) => b.curbs.length - a.curbs.length);
      if (!top.length || !top[0].curbs.length) return sourced(ctx, ["No customer has curbs reporting yet.", "None of the customers have curbs so far.", "Zero curbs across all customers right now."]);
      const t = top[0];
      return sourced(ctx, [`${t.name} has the most curbs: ${t.curbs.length} (${t.online} online).`, `Most curbs: ${t.name}, with ${t.curbs.length}.`, `${t.name} is the biggest by curbs, at ${t.curbs.length}.`]);
    }),
  },
  {
    id: "most_offline_customer", group: "status", customer: -3,
    keys: [["most offline", 5], ["customer most offline", 5], ["worst", 3], ["most problem", 4], ["most", 1], ["offline", 1.5], ["by customer", 1], ["down", 2], ["most curb down", 4], ["low", -2]],
    next: ["Offline curbs by customer", "Low batteries by customer", "Which curbs are offline?"],
    say: withData((ctx) => {
      const top = [...customerViews(ctx)].sort((a, b) => b.offline - a.offline);
      if (!top.length || !top[0].offline) return sourced(ctx, ["No customer has an offline curb right now.", "Every customer's curbs are online.", "Nobody has offline curbs at the moment."]);
      const t = top[0];
      return sourced(ctx, [`${t.name} has the most offline curbs: ${t.offline} of ${t.curbs.length}.`, `Most offline: ${t.name} (${t.offline}).`, `${t.name} needs the most attention, with ${plural(t.offline, "curb")} offline.`]);
    }),
  },
  {
    id: "customers_without_lots", group: "status", customer: -3,
    keys: [["without lot", 5], ["no lot", 5], ["customer without", 4], ["have no lot", 5], ["without", 2], ["empty customer", 3], ["lot", 0.5], ["lot without", -5], ["unassigned", -3]],
    next: ["How do I assign a lot?", "Lots without a customer", "List customers"],
    say: withData((ctx, ent) => listing(ctx, ent, customerViews(ctx).filter((c) => !c.lots.length).map((c) => `${c.name} (${STATUS_LABEL[c.status] || "no status"})`),
      ["Customers with no lots yet:", "These have no lots:", "No lots point to these customers:"],
      ["Every customer has at least one lot.", "No customer is without a lot.", "All customers have lots."])),
  },
  {
    id: "newest_customer", group: "status", customer: -3,
    keys: [["recent customer", 5], ["new customer", 3], ["last customer", 4], ["most recent customer", 5], ["latest", 1], ["added", 1.5], ["customer", 0.5], ["recent", 1], ["how do i", -4], ["add", -1], ["request", -3], ["oldest", -3]],
    next: ["List customers", "Newest requests", "Tell me about the newest customer"],
    say: withData((ctx) => {
      const all = customerViews(ctx).filter((c) => typeof c.createdAt === "number").sort((a, b) => b.createdAt - a.createdAt);
      if (!all.length) return sourced(ctx, ["I can't tell: no customer has an added date.", "No customer has a creation time, so I can't say which is newest.", "There's no date to sort customers by yet."]);
      const c = all[0];
      return sourced(ctx, [`The newest customer is ${c.name}, added ${ago(ctx, c.createdAt)}.`, `${c.name} was added most recently (${ago(ctx, c.createdAt)}).`, `Most recent: ${c.name}, ${ago(ctx, c.createdAt)}.`]);
    }),
  },
  {
    id: "customer_by_type", group: "status", customer: -3,
    keys: [["by type", 4.5], ["customer type", 3.5], ["types of customer", 4], ["how many campus", 4], ["how many mall", 4], ["how many hotel", 4], ["type", 1], ["breakdown", 1], ["split", 2], ["campus mall", 3], ["request", -3]],
    next: ["Active vs prospect vs paused", "List customers", "Who asked for what type of site?"],
    say: withData((ctx) => {
      const all = customerViews(ctx);
      const counts = Object.keys(TYPE_LABEL).map((t) => [t, all.filter((c) => (c.type || "other") === t).length]).filter(([, n]) => n);
      if (!counts.length) return sourced(ctx, ["No customers yet.", "There are no customers to sort by type.", "The customer list is empty."]);
      const body = `\n${counts.map(([t, n]) => `• ${t[0].toUpperCase()}${t.slice(1)}: ${n}`).join("\n")}`;
      return sourced(ctx, vary(["Customers by type:", "By type:", "Here's the mix:"], body));
    }),
  },
  {
    id: "customer_from_request", group: "status", customer: 4, usesCustomer: true,
    keys: [["came from", 3.5], ["which request", 3], ["from request", 3.5], ["originally", 2], ["where did", 2], ["converted from", 4], ["source", 2]],
    next: ["Was it converted?", "Tell me about its lots", "Newest requests"],
    say: forCustomer("trace", (n) => `Which request did ${n} come from?`, (ctx, ent, c) => {
      const lead = c.fromLeadId ? leadViews(ctx).find((l) => l.id === c.fromLeadId) : null;
      if (!c.fromLeadId) return sourced(ctx, [`${c.name} was added by hand, not converted from a request.`, `No request behind ${c.name}: it was created directly.`, `${c.name} didn't come from a quote request.`]);
      if (!lead) return sourced(ctx, [`${c.name} came from a request that has since been deleted.`, `Its request no longer exists.`, `${c.name} was converted from a request, but that request is gone now.`]);
      return sourced(ctx, [`${c.name} came from ${poss(leadName(lead))} request, sent ${ago(ctx, lead.createdAt)}.`, `It was converted from the request by ${leadName(lead)}.`, `Source: ${leadName(lead)}, ${ago(ctx, lead.createdAt)}.`]);
    }),
  },
  {
    id: "customer_created", group: "status", customer: 4, usesCustomer: true,
    keys: [["when was", 2.5], ["when did", 2], ["added", 2], ["created", 2.5], ["since when", 3], ["how long", 2], ["join", 2]],
    next: ["Newest customer", "Tell me about its lots", "List customers"],
    say: forCustomer("check", (n) => `When was ${n} added?`, (ctx, ent, c) => {
      if (typeof c.createdAt !== "number") return sourced(ctx, [`${c.name} has no added date saved.`, `I don't know when ${c.name} was added.`, `There's no creation time for ${c.name}.`]);
      const d = new Date(c.createdAt).toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" });
      return sourced(ctx, [`${c.name} was added on ${d} (${ago(ctx, c.createdAt)}).`, `Added ${ago(ctx, c.createdAt)}, on ${d}.`, `${c.name}: created ${d}.`]);
    }),
  },
];

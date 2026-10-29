// Quote request intents (leads/): counts, newest, by status, waiting too long, by
// site type, and whether one was converted. Only what's recorded on each request.
import { DAY, ago, customerViews, facilityText, leadName, leadViews, plural, sourced, vary } from "../data.js";
import { askLead, listing, poss, withData } from "../common.js";

const STATUS_WORD = { new: "new", contacted: "contacted", closed: "closed", won: "won (converted)" };
const statusOf = (l) => (l.won ? "won" : l.status || "new");
const line = (ctx, l) => `${leadName(l)}: ${facilityText(l.facilityType)}, ${ago(ctx, l.createdAt)}, ${STATUS_WORD[statusOf(l)] || statusOf(l)}`;
const oneLead = (ctx, ent) => leadViews(ctx).find((l) => l.id === ent.leadId);

const forLead = (verb, chip, fn) => withData((ctx, ent) => {
  const l = ent.leadId && oneLead(ctx, ent);
  return l ? fn(ctx, ent, l) : askLead(ctx, verb, chip);
});

export const REQUEST_INTENTS = [
  {
    id: "request_count", group: "status", lead: -3,
    keys: [["how many request", 4], ["number of request", 4], ["request count", 4], ["request", 1.5], ["total", 1], ["how many", 1], ["recent", -2], ["by status", -2], ["type", -2], ["old", -2], ["customer", -1.5], ["how do i", -3], ["this week", -3], ["today", -2], ["7 days", -3], ["24 hours", -3]],
    next: ["How many new requests?", "Newest requests", "Requests by status"],
    say: withData((ctx) => {
      const all = leadViews(ctx);
      const fresh = all.filter((l) => statusOf(l) === "new").length;
      return sourced(ctx, [
        `There ${all.length === 1 ? "is 1 quote request" : `are ${all.length} quote requests`}, ${fresh} still new.`,
        `${plural(all.length, "request")} in total; ${fresh} ${fresh === 1 ? "hasn't" : "haven't"} been handled yet.`,
        `I count ${plural(all.length, "quote request")} (${fresh} new).`,
      ]);
    }),
  },
  {
    id: "request_new_count", group: "status", lead: -3,
    keys: [["new request", 4.5], ["how many new", 4], ["unread", 3], ["unhandled", 3.5], ["waiting", 2], ["new", 1.5], ["request", 0.5], ["recent", -1], ["customer", -2], ["2days", -3], ["older", -2], ["fake", -3], ["send", -3]],
    next: ["Newest requests", "Requests older than 2 days with no contact", "Requests by status"],
    say: withData((ctx) => {
      const fresh = leadViews(ctx).filter((l) => statusOf(l) === "new");
      if (!fresh.length) return sourced(ctx, ["No new requests: everything's been looked at.", "Zero new requests right now.", "The inbox is clear: no new requests."]);
      const newest = fresh[0];
      return sourced(ctx, [
        `${plural(fresh.length, "new request")}. The newest is from ${leadName(newest)}, ${ago(ctx, newest.createdAt)}.`,
        `You have ${plural(fresh.length, "request")} marked new; latest: ${leadName(newest)}.`,
        `${fresh.length} new, the most recent ${ago(ctx, newest.createdAt)} from ${leadName(newest)}.`,
      ]);
    }),
  },
  {
    id: "request_newest", group: "status", lead: -3,
    keys: [["recent request", 4.5], ["new request", 1.5], ["last request", 4], ["recent", 1.5], ["request", 1], ["came in", 2.5], ["inbox", 2.5], ["show request", 3], ["list request", 3],
      ["how many", -2], ["customer", -2.5], ["status", -1], ["type", -2], ["2days", -3], ["oldest", -3], ["fake", -3], ["how do i", -3]],
    next: ["Requests older than 2 days with no contact", "Requests by status", "Who asked for what type of site?"],
    say: withData((ctx, ent) => listing(ctx, ent, leadViews(ctx).map((l) => line(ctx, l)),
      ["Newest requests first:", "The latest quote requests:", "Most recent requests:", "Here's the inbox, newest first:"],
      ["No quote requests have come in yet.", "The request list is empty.", "Nothing in the inbox yet."])),
  },
  {
    id: "request_by_status", group: "status", lead: -3,
    keys: [["request by status", 5], ["request status", 3.5], ["by status", 2.5], ["contacted", 1.5], ["closed", 1.5], ["won", 1], ["breakdown", 2], ["split", 1.5], ["request", 0.5], ["customer", -3], ["mean", -3], ["how do i", -3]],
    next: ["Which requests were converted?", "Requests older than 2 days with no contact", "Newest requests"],
    say: withData((ctx) => {
      const all = leadViews(ctx);
      const body = `\n${["new", "contacted", "closed", "won"].map((s) => `• ${s[0].toUpperCase()}${s.slice(1)}: ${all.filter((l) => statusOf(l) === s).length}`).join("\n")}`;
      return sourced(ctx, vary(["Requests by status:", `All ${plural(all.length, "request")}, by status:`, "Here's where the requests stand:"], body));
    }),
  },
  {
    id: "request_stale", group: "status", lead: -3,
    keys: [["2days", 4], ["no contact", 4], ["not contacted", 4.5], ["waiting", 2.5], ["overdue", 4], ["older than", 3], ["old", 1.5], ["stale", 4], ["ignored", 3.5], ["forgotten", 3], ["follow up", 3], ["slipped", 3], ["nobody", 1.5]],
    next: ["How do I mark a request contacted?", "Newest requests", "Requests by status"],
    say: withData((ctx, ent) => {
      const old = leadViews(ctx).filter((l) => statusOf(l) === "new" && typeof l.createdAt === "number" && ctx.now - l.createdAt > 2 * DAY).reverse();
      return listing(ctx, ent, old.map((l) => line(ctx, l)),
        ["Still new after more than 2 days (oldest first):", "These have waited over 2 days without contact:", "Over 2 days old and still marked new:"],
        ["No request has waited more than 2 days without contact.", "Nothing overdue: every request older than 2 days has been handled.", "All clear: no new request is older than 2 days."]);
    }),
  },
  {
    id: "request_by_type", group: "status", lead: -3,
    keys: [["what type", 2], ["type of site", 4], ["who asked", 4], ["asked for", 3], ["facility", 3], ["kind of site", 3.5], ["what kind", 2], ["by type", 2], ["airport", 2], ["hospital", 2], ["stadium", 2], ["university", 1.5], ["request", 0.5], ["customer", -2]],
    next: ["Newest requests", "Requests by status", "How many new requests?"],
    say: withData((ctx, ent) => listing(ctx, ent, leadViews(ctx).map((l) => `${leadName(l)} asked about ${facilityText(l.facilityType)}`),
      ["Who asked for what:", "Requests by the kind of site:", "Here's what each request was about:"],
      ["No requests yet, so nobody has asked for anything.", "The inbox is empty.", "No quote requests to sort."])),
  },
  {
    id: "request_converted", group: "status", lead: 4, usesLead: true,
    keys: [["converted", 3.5], ["convert", 1.5], ["won", 2.5], ["became customer", 4], ["turned into", 3], ["did we", 1], ["was", 0.5], ["how do i", -4], ["which request", -2], ["fail", -3], ["will not", -3]],
    next: ["Which requests were converted?", "Newest requests", "What does won mean?"],
    say: forLead("check", (n) => `Was ${poss(n)} request converted?`, (ctx, ent, l) => {
      if (!l.won) return sourced(ctx, [`No, ${poss(leadName(l))} request hasn't been converted. It's ${STATUS_WORD[statusOf(l)]}.`, `Not converted yet: ${leadName(l)} is still ${STATUS_WORD[statusOf(l)]}.`, `${poss(leadName(l))} request is ${STATUS_WORD[statusOf(l)]}, not a customer yet.`]);
      const c = customerViews(ctx).find((x) => x.id === l.siteId);
      const to = c ? ` It became ${c.name}.` : "";
      return sourced(ctx, [`Yes, ${poss(leadName(l))} request was converted.${to}`, `Converted: ${leadName(l)} is marked won.${to}`, `That one's won.${to}`]);
    }),
  },
  {
    id: "request_won_list", group: "status", lead: -3,
    keys: [["which request converted", 5], ["converted request", 4.5], ["won request", 4.5], ["which won", 3.5], ["became customer", 2], ["won", 1.5], ["converted", 1.5], ["request", 0.5], ["how do i", -4], ["mean", -3], ["what is", -4]],
    next: ["What does won mean?", "Requests by status", "Newest customer"],
    say: withData((ctx, ent) => {
      const customers = customerViews(ctx);
      return listing(ctx, ent, leadViews(ctx).filter((l) => l.won).map((l) => `${leadName(l)} → ${customers.find((c) => c.id === l.siteId)?.name || "a customer since deleted"}`),
        ["Converted requests:", "These became customers:", "Won requests and the customer each became:"],
        ["No request has been converted yet.", "None have been won so far.", "No conversions yet."]);
    }),
  },
  {
    id: "request_details", group: "status", lead: 4, usesLead: true,
    keys: [["request from", 3.5], ["what did", 2], ["message", 2.5], ["what does want", 3], ["what want", 3], ["details", 1.5], ["tell me about", 1], ["asked", 1.5], ["converted", -2], ["how do i", -3]],
    next: ["Was it converted?", "Newest requests", "How do I convert a request?"],
    say: forLead("look up", (n) => `What did ${n} ask for?`, (ctx, ent, l) => {
      const body = [
        `\nAbout: ${facilityText(l.facilityType)} · Sent: ${ago(ctx, l.createdAt)} · Status: ${STATUS_WORD[statusOf(l)]}`,
        `Message: ${l.message ? `"${l.message}"` : "none"}`,
        `Email: ${l.email || "none"}`,
      ].join("\n");
      return sourced(ctx, vary([`${leadName(l)}:`, `The request from ${leadName(l)}:`, `Here's ${poss(leadName(l))} request:`], body));
    }),
  },
  {
    id: "request_oldest_open", group: "status", lead: -3,
    keys: [["oldest request", 5], ["oldest", 2.5], ["longest waiting", 4.5], ["waited longest", 4.5], ["request", 0.5], ["customer", -3]],
    next: ["Requests older than 2 days with no contact", "Newest requests", "Requests by status"],
    say: withData((ctx) => {
      const open = leadViews(ctx).filter((l) => statusOf(l) === "new" && typeof l.createdAt === "number");
      if (!open.length) return sourced(ctx, ["No request is waiting: none are marked new.", "Nothing's waiting right now.", "Every request has been handled."]);
      const l = open[open.length - 1];
      return sourced(ctx, [`The longest-waiting new request is from ${leadName(l)}, ${ago(ctx, l.createdAt)}.`, `Oldest still new: ${leadName(l)} (${ago(ctx, l.createdAt)}).`, `${leadName(l)} has waited longest, since ${ago(ctx, l.createdAt)}.`]);
    }),
  },
  {
    id: "request_this_week", group: "status", lead: -3,
    keys: [["this week", 4], ["last 7 days", 4], ["past week", 4], ["today", 2], ["last 24 hours", 4], ["request", 1], ["how many", 0.5], ["customer", -2]],
    next: ["Newest requests", "How many new requests?", "Requests by status"],
    say: withData((ctx) => {
      const all = leadViews(ctx).filter((l) => typeof l.createdAt === "number");
      const day = all.filter((l) => ctx.now - l.createdAt <= DAY).length;
      const week = all.filter((l) => ctx.now - l.createdAt <= 7 * DAY).length;
      return sourced(ctx, [`${plural(day, "request")} in the last 24 hours, ${week} in the last 7 days.`, `Last 7 days: ${week}. Last 24 hours: ${day}.`, `This week brought ${plural(week, "request")}; ${day} of them in the past day.`]);
    }),
  },
  {
    id: "request_conversion_rate", group: "status", lead: -3,
    keys: [["conversion rate", 5], ["win rate", 5], ["how many won", 4], ["percent", 2], ["rate", 2], ["ratio", 2.5], ["success", 2]],
    next: ["Which requests were converted?", "Requests by status", "How many customers?"],
    say: withData((ctx) => {
      const all = leadViews(ctx);
      const won = all.filter((l) => l.won).length;
      if (!all.length) return sourced(ctx, ["No requests yet, so there's no rate to work out.", "Nothing to measure: no requests.", "Zero requests so far."]);
      const pct = Math.round((won / all.length) * 100);
      return sourced(ctx, [`${won} of ${plural(all.length, "request")} became customers: ${pct}%.`, `Conversion so far: ${pct}% (${won} of ${all.length}).`, `${pct}% of requests have been won.`]);
    }),
  },
];

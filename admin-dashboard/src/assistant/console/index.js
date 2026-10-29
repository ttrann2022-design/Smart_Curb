// The Smart Wheel Stop Console Assistant: the shared rule-based engine (../engine/)
// with the company console's own intents, words, examples and data. No AI service
// and no network; it only reads the data it's given.
//   ctx:   { sites, leads, lots, units, now, mode: "live" | "sim", firstName, random }
//   state: what the last turns were about (intent, customer, lot, curb, request,
//          recent variants, paged list)
import { createSimilarity } from "../engine/similarity.js";
import { createMatcher } from "../engine/matcher.js";
import { fallbackReply, pickReply, respondParts } from "../engine/conversation.js";
import { parseMath } from "../engine/math.js";
import { numberWords } from "../engine/names.js";
import * as text from "./text.js";
import { CUSTOMER_INTENTS } from "./intents/customers.js";
import { REQUEST_INTENTS } from "./intents/requests.js";
import { LOT_INTENTS } from "./intents/lots.js";
import { EXPLAIN_INTENTS, HOWTO_INTENTS, TROUBLESHOOT_INTENTS } from "./intents/guide.js";
import { TALK_INTENTS, partOfDay } from "./intents/talk.js";
import { EXAMPLES } from "./examples.js";
import { findCurb, findCustomer, findLead, findLot, nameIn, pointsBack, pointsToCurb, pointsToCustomer, pointsToLead, pointsToLot } from "./entities.js";
import { customerViews, leadName, leadViews, lotViews } from "./data.js";

export const ASSISTANT_NAME = "Smart Wheel Stop Console Assistant";
export const INTENTS = [...CUSTOMER_INTENTS, ...REQUEST_INTENTS, ...LOT_INTENTS, ...HOWTO_INTENTS, ...TROUBLESHOOT_INTENTS, ...EXPLAIN_INTENTS, ...TALK_INTENTS];
export const INTENT_BY_ID = Object.fromEntries(INTENTS.map((i) => [i.id, i]));
export const SOMETHING_ELSE = "Something else";

// The topic menu: shown at the start, after "Something else", and with the fallback.
export const menuChips = (ctx = {}) => [
  "Summary", "New requests", "List customers", "Offline curbs", "Lots without a customer", "How do I import lots?", "Add a platform admin",
  ctx.mode === "sim" ? "Switch to Live" : "Switch to Simulation",
];

const SLOTS = [
  { ent: "customerId", ref: "customerRef", weight: "customer", uses: "usesCustomer", missing: 2 },
  { ent: "lotId", ref: "lotRef", weight: "lot", uses: "usesLot", missing: 2 },
  { ent: "curbId", ref: "curbRef", weight: "curb", uses: "usesCurb", missing: 2 },
  { ent: "leadId", ref: "leadRef", weight: "lead", uses: "usesLead", missing: 2 },
];
const findAll = (raw, data) => ({
  customerId: findCustomer(raw, data.sites), lotId: findLot(raw, data.lots), curbId: findCurb(raw, data.units), leadId: findLead(raw, data.leads),
});

const sim = createSimilarity(EXAMPLES, text.tokens);
export const { rank, match } = createMatcher({ intents: INTENTS, text, sim, slots: SLOTS, findEntities: findAll });

const FALLBACK = [
  "Hmm, I didn't catch that. I'm best with customers, quote requests, lots, curbs and how the console works. Here's where I can help:",
  "Sorry, that one's beyond me. Try one of these:",
  "I'm not sure what you mean. Could you put it another way, or pick a topic?",
  "That didn't match anything I know about the console. Choose a topic below:",
];
// Content intents where "more" or "another" means another of the same.
const REPEATABLE = new Set(["joke", "fun_fact", "story"]);
// Groups whose answers set the topic that follow-ups refer to.
const TOPICAL = new Set(["status", "howto", "explain"]);
const KINDS = [
  ["customer", "customerId", "lastCustomerId", "usesCustomer", "customer"],
  ["lot", "lotId", "lastLotId", "usesLot", "lot"],
  ["curb", "curbId", "lastCurbId", "usesCurb", "curb"],
  ["lead", "leadId", "lastLeadId", "usesLead", "lead"],
];

const FOLLOW_UP = /^\s*(and|what about|how about|and what about|same for|also|then|ok and|so)\b/i;
// Asking whether one curb is free or taken, and words that make it a question about many.
const OCCUPANCY = /\b(free|available|open|empty|vacant|occupied|taken|in use|busy)\b/i;
const LIST_WORDS = /\b(how many|which|all|each|every|list|curbs|spots|lots|count|how to|how do|what does|mean)\b/i;
const FILLER = new Set(["and", "about", "how", "the", "for", "same", "then", "with", "in", "at", "is", "it", "its", "of", "ok", "so", "also", "please", "one",
  "there", "that", "this", "what", "lot", "curb", "c", "unit", "sensor", "garage", "level", "customer", "client", "site", "request", "from"]);

// Only a name was given ("and Demo Mall?", "C-042", "lot 99"): no other words left.
function nameOnly(raw, nameText) {
  const own = numberWords(text.normalize(nameText)).split(" ");
  const words = numberWords(text.normalize(raw.replace(FOLLOW_UP, " "))).split(" ").filter(Boolean);
  return words.length > 0 && words.every((w) => FILLER.has(w) || /^\d+$/.test(w) || own.includes(w) || own.some((o) => o.startsWith(w) && w.length >= 3));
}
const entityName = (ctx, ent) => {
  if (ent.customerId) return ctx.sites?.[ent.customerId]?.name || "";
  if (ent.lotId) return `${ctx.lots?.[ent.lotId]?.name || ""} ${ent.lotId}`;
  if (ent.curbId) return ent.curbId;
  if (ent.leadId) return `${ctx.leads?.[ent.leadId]?.name || ""} ${ctx.leads?.[ent.leadId]?.organization || ""}`;
  return "";
};

function finish(intent, out, ctx, state, ent) {
  const { text: said, chips, reply, recent } = pickReply(intent, out, ctx, state, { menuChips, somethingElse: SOMETHING_ELSE });
  const next = { ...state, recent, lastText: said, lastChips: chips };
  if (TOPICAL.has(intent.group)) next.lastIntentId = intent.id;
  if (REPEATABLE.has(intent.id)) next.lastFunId = intent.id;
  for (const [kind, key, last, uses, weight] of KINDS) {
    if (ent[key] && (intent[uses] || intent[weight] > 0)) { next[last] = ent[key]; next.lastKind = kind; }
  }
  next.lastPaged = reply.more ? { intentId: intent.id, ent: { ...ent, only: false }, page: ent.page || 0 } : null;
  const fallback = intent.group === "offtopic";
  return { intent: intent.id, group: intent.group, text: said, chips: fallback ? menuChips(ctx) : chips, state: next, fallback, entities: ent };
}

const run = (intent, ctx, state, ent) => finish(intent, intent.say instanceof Function ? intent.say(ctx, ent) : intent.say, ctx, state, ent);

// The intent to carry a named thing into, from the conversation so far.
function followIntent(state, kind) {
  const last = INTENT_BY_ID[state.lastIntentId];
  if (kind === "customer") return last?.usesCustomer ? last : INTENT_BY_ID[last?.customerIntent] || INTENT_BY_ID.customer_details;
  if (kind === "lot") return last?.usesLot ? last : INTENT_BY_ID[last?.lotIntent] || INTENT_BY_ID.lot_details;
  if (kind === "lead") return last?.usesLead ? last : INTENT_BY_ID.request_details;
  return last?.usesCurb ? last : INTENT_BY_ID.curb_status;
}

// A name that matches nothing: say so and list the real ones, never a total instead.
const NOT_FOUND = { id: "not_found", group: "status", next: [] };
function notFound(given, kind, ctx, state, ent, topic) {
  const where = ctx.mode === "sim" ? "in the simulation" : "in live data";
  const list = (names, none) => (names.length ? `\n${names.slice(0, 12).map((n) => `• ${n}`).join("\n")}${names.length > 12 ? `\n…and ${names.length - 12} more.` : ""}` : ` ${none}`);
  let variants;
  let chips;
  if (kind === "lot") {
    const names = lotViews(ctx).map((l) => l.name);
    const body = `Lots ${where}:${list(names, "There are none yet.")}`;
    variants = [`I couldn't find a lot called ${given}. ${body}`, `There's no lot called ${given}. ${body}`, `${given} isn't one of the lots. ${body}`];
    chips = ["How many lots are there?", "Lots without a customer", ...names.slice(0, 1).map((n) => `Tell me about ${n}`)];
  } else if (kind === "lead") {
    const names = leadViews(ctx).map(leadName);
    const body = `Requests ${where}, newest first:${list(names, "There are none yet.")}`;
    variants = [`I couldn't find a request from ${given}. ${body}`, `No request comes from ${given}. ${body}`, `${given} hasn't sent a request that I can see. ${body}`];
    chips = ["Newest requests", "Requests by status"];
  } else {
    const names = customerViews(ctx).map((c) => c.name);
    const body = `Customers ${where}:${list(names, "There are none yet.")}`;
    variants = [`I couldn't find a customer called ${given}. ${body}`, `There's no customer called ${given}. ${body}`, `${given} isn't one of the customers. ${body}`];
    chips = ["List customers", ...names.slice(0, 2).map((n) => `Tell me about ${n}`)];
  }
  const r = finish({ ...NOT_FOUND, next: chips }, variants, ctx, state, ent);
  r.state.lastIntentId = topic && TOPICAL.has(topic.group) ? topic.id : state.lastIntentId;
  return r;
}
// What kind of thing a name that matched nothing was meant to be.
const REQUEST_WORDS = /\b(request|lead|quote|enquir|inquir|asked|ask for|message|convert|won)/i;
const kindFor = (given, intent, raw) => {
  if (given.kind === "lot" || intent?.usesLot || intent?.lot > 0) return "lot";
  // "Bruce Wayne's request", "the request from Bruce Wayne"
  if (/['’]s (request|lead|quote|enquiry|inquiry)|\b(request|lead|quote) from\b/i.test(raw)) return "lead";
  if ((intent?.usesLead || intent?.lead > 0) && REQUEST_WORDS.test(raw)) return "lead";
  return "customer";
};

function respondOne(raw, ctx, state) {
  const math = parseMath(raw);
  if (math) return run(INTENT_BY_ID.calculator, ctx, state, { math });

  const ent = findAll(raw, ctx);
  const named = ent.customerId || ent.lotId || ent.curbId || ent.leadId;
  const given = named ? null : nameIn(raw);
  const follow = FOLLOW_UP.test(raw);
  // "its lots", "that customer", "and the contact?": carry the last thing over.
  if (!named && !given) {
    const points = { customer: pointsToCustomer(raw), lot: pointsToLot(raw), curb: pointsToCurb(raw), lead: pointsToLead(raw) };
    const back = pointsBack(raw) || follow;
    for (const [kind, key, last] of [KINDS[2], KINDS[1], KINDS[0], KINDS[3]]) {
      if (state[last] && (points[kind] || (back && state.lastKind === kind))) { ent[key] = state[last]; break; }
    }
  }
  ent.customerRef = pointsToCustomer(raw);
  ent.lotRef = pointsToLot(raw);
  ent.curbRef = pointsToCurb(raw);
  ent.leadRef = pointsToLead(raw);
  ent.only = !!named && nameOnly(raw, entityName(ctx, ent));

  if (ent.only) {
    const kind = ent.curbId ? "curb" : ent.lotId ? "lot" : ent.customerId ? "customer" : "lead";
    return run(followIntent(state, kind), ctx, state, ent);
  }
  // "Is C-041 free?" asks about that curb, never the site total.
  if (ent.curbId && OCCUPANCY.test(raw) && !LIST_WORDS.test(raw)) return run(INTENT_BY_ID.curb_status, ctx, state, { ...ent, occupancy: true });

  const { intent } = match(raw, ctx, ent);
  if (given && (!intent || intent.group === "status" || nameOnly(raw, given.text))) {
    const topic = intent || INTENT_BY_ID[state.lastIntentId];
    return notFound(given.text, kindFor(given, topic, raw), ctx, state, ent, topic);
  }
  if (intent?.id === "more") {
    if (state.lastPaged) return run(INTENT_BY_ID[state.lastPaged.intentId], ctx, state, { ...state.lastPaged.ent, page: state.lastPaged.page + 1 });
    if (state.lastFunId) return run(INTENT_BY_ID[state.lastFunId], ctx, state, ent);
  }
  if (intent?.id === "repeat" && state.lastText) {
    return { intent: "repeat", group: "help", text: state.lastText, chips: state.lastChips || menuChips(ctx), state, fallback: false, entities: ent };
  }
  // A question about one customer, lot, curb or request that names none ("who's the
  // contact?") is about the one we're already talking about.
  if (intent) {
    for (const [, key, last, , weight] of KINDS) {
      if (intent[weight] > 0 && !ent[key] && !named && !given && state[last]) ent[key] = state[last];
    }
    return run(intent, ctx, state, ent);
  }

  // Nothing matched, but something was named or pointed at: follow the last topic.
  for (const [kind, key] of KINDS) if (ent[key]) return run(followIntent(state, kind), ctx, state, ent);

  const fb = fallbackReply(FALLBACK, ctx, state);
  return { intent: "fallback", group: null, text: fb.text, chips: menuChips(ctx), state: fb.state, fallback: true, entities: ent };
}

// "New requests and offline curbs": parts that each match get their own answer, unless
// the whole question is close to one known phrasing ("how do sites, lots and curbs link").
const WHOLE = 0.9;
export function respond(raw, ctx, state = {}) {
  if (Object.values(sim.similarities(raw)).some((s) => s >= WHOLE)) return respondOne(raw, ctx, state);
  return respondParts(raw, ctx, state, { respondOne, entityKeys: ["customerId", "lotId", "curbId", "leadId"], simTokens: sim.simTokens, isMath: parseMath });
}

// The opening message: greeting by time of day and name, and the topic menu.
export function welcome(ctx) {
  const name = ctx.firstName ? `, ${ctx.firstName}` : "";
  const source = ctx.mode === "sim" ? "the simulated customers, requests and lots" : "your customers, quote requests, lots and curbs";
  return {
    text: `${partOfDay(ctx.now)}${name}! I'm the ${ASSISTANT_NAME}. Ask me about ${source}, or how to do something in the console. I only read data; I never change it. Where shall we start?`,
    chips: menuChips(ctx),
  };
}

// The rule-based assistant: no AI service and no network. respond() matches a
// message to an intent and returns a reply, follow-up chips and the conversation
// state to pass back next time. It only reads the data it's given.
//   ctx:   { lots, units, alerts, history, now, mode: "live" | "sim", role, firstName, random }
//   state: what the last turns were about (intent, lot, curb, recent variants, paged list)
import { INTENT_BY_ID, SOMETHING_ELSE, menuChips } from "./intents.js";
import { match } from "./matcher.js";
import { findCurb, findLot, missingLot, numberWords, pointsBack, pointsToCurb, pointsToLot } from "./entities.js";
import { lotViews } from "./data.js";
import { parseMath } from "./engine/math.js";
import { normalize } from "./text.js";
import { simTokens } from "./similarity.js";
import { fallbackReply, pickReply, respondParts } from "./engine/conversation.js";

export { INTENTS, GROUPS, INTENT_BY_ID, menuChips, SOMETHING_ELSE } from "./intents.js";
export { match, rank, THRESHOLD } from "./matcher.js";

const FALLBACK = [
  "Hmm, I didn't quite catch that. I'm best with questions about the lots, curbs and this dashboard. Here's what I can help with:",
  "Sorry, that one's beyond me! Try one of these topics:",
  "I'm not sure what you mean. Could you put it another way, or pick a topic?",
  "That didn't match anything I know. I talk parking, curbs and dashboard: choose a topic below.",
];
// Content intents where "more" or "another" means another of the same.
const REPEATABLE = new Set(["joke", "fun_fact", "story", "riddle", "tip_general", "compliment_me"]);
// Groups whose answers set the topic that follow-ups refer to.
const TOPICAL = new Set(["status", "howto", "explain"]);

const FOLLOW_UP = /^\s*(and|what about|how about|and what about|same for|also|then|ok and|so)\b/i;
// Asking whether one curb is free or taken, and words that make it a question about many.
const OCCUPANCY = /\b(free|available|open|empty|vacant|occupied|taken|in use|busy)\b/i;
const LIST_WORDS = /\b(how many|which|all|each|every|list|curbs|spots|lots|count|how to|how do|what does|mean)\b/i;
const FILLER = new Set(["and", "about", "how", "the", "for", "same", "then", "with", "in", "at", "is", "it", "its", "of", "ok", "so", "also", "please", "one", "there", "that", "this", "lot", "curb", "c", "unit", "sensor", "garage", "level"]);

// Only the curb or lot was named ("and Lot 6?", "C-042", "lot 99"): no other words left.
function entityOnly(raw, ent, ctx) {
  const lotText = ent.lotId ? `${ctx.lots?.[ent.lotId]?.name || ""} ${ent.lotId}` : ent.missingLot || "";
  const lot = lotText ? numberWords(normalize(lotText)).split(" ") : [];
  const words = numberWords(normalize(raw.replace(FOLLOW_UP, " "))).split(" ").filter(Boolean);
  return words.every((w) => FILLER.has(w) || /^\d+$/.test(w) || lot.includes(w) || lot.some((l) => l.startsWith(w) && w.length >= 3));
}

function finish(intent, out, ctx, state, ent) {
  const { text, chips, reply, recent } = pickReply(intent, out, ctx, state, { menuChips, somethingElse: SOMETHING_ELSE });
  const next = { ...state, recent, lastText: text, lastChips: chips };
  if (TOPICAL.has(intent.group)) next.lastIntentId = intent.id;
  if (REPEATABLE.has(intent.id)) next.lastFunId = intent.id;
  if (ent.curbId && (intent.usesCurb || intent.curb > 0)) { next.lastCurbId = ent.curbId; next.lastKind = "curb"; }
  if (ent.lotId && ctx.lots?.[ent.lotId] && (intent.usesLot || intent.lot > 0)) { next.lastLotId = ent.lotId; next.lastKind = "lot"; }
  next.lastPaged = reply.more ? { intentId: intent.id, ent: { ...ent, only: false }, page: ent.page || 0 } : null;
  const fallback = intent.group === "offtopic";
  return { intent: intent.id, group: intent.group, text, chips: fallback ? menuChips(ctx) : chips, state: next, fallback, entities: ent };
}

// A lot was named that isn't on the site: say so and list the real ones, instead of
// answering for the whole site. The topic stays, so "and Lot 6?" carries it on.
const LOT_NOT_FOUND = { id: "lot_not_found", group: "status", next: ["What lots are there?", "Free spots in each lot"] };
function lotNotFound(name, ctx, state, ent, topic) {
  const names = lotViews(ctx).map((l) => l.name);
  const where = ctx.mode === "sim" ? "in the simulation" : "on this site";
  const list = names.length ? `Lots ${where}:\n${names.map((n) => `• ${n}`).join("\n")}` : `There are no lots ${where} yet.`;
  const r = finish(LOT_NOT_FOUND, [
    `I couldn't find a lot called ${name}. ${list}`,
    `There's no lot called ${name}. ${list}`,
    `Hmm, ${name} isn't one of the lots I know. ${list}`,
  ], ctx, state, ent);
  r.state.lastIntentId = topic && TOPICAL.has(topic.group) ? topic.id : state.lastIntentId;
  return r;
}

const run = (intent, ctx, state, ent) => finish(intent, intent.say instanceof Function ? intent.say(ctx, ent) : intent.say, ctx, state, ent);

// The intent to carry a named lot or curb into, from the conversation so far.
function followIntent(state, kind) {
  const last = INTENT_BY_ID[state.lastIntentId];
  if (kind === "lot") return last?.usesLot ? last : INTENT_BY_ID[last?.lotIntent] || INTENT_BY_ID.free_lot;
  return last?.usesCurb ? last : INTENT_BY_ID.curb_status;
}

function respondOne(raw, ctx, state) {
  const math = parseMath(raw);
  if (math) return run(INTENT_BY_ID.calculator, ctx, state, { math });

  const ent = { curbId: findCurb(raw, ctx.units), lotId: findLot(raw, ctx.lots) };
  const follow = FOLLOW_UP.test(raw);
  let missing = ent.curbId ? null : missingLot(raw, ctx.lots);
  // A lot outside this dashboard's customer scope (ctx.hiddenLots, names only) is
  // answered exactly like a lot that doesn't exist: "couldn't find" and our own lots.
  if (!missing && !ent.lotId && !ent.curbId && ctx.hiddenLots) {
    const hidden = findLot(raw, ctx.hiddenLots);
    if (hidden) missing = ctx.hiddenLots[hidden].name;
  }
  if (missing) ent.missingLot = missing;
  // "its battery", "that lot", "and the battery?": carry the last curb or lot over.
  if (!ent.curbId && !ent.lotId && !missing) {
    if (state.lastCurbId && (pointsToCurb(raw) || ((pointsBack(raw) || follow) && state.lastKind === "curb"))) ent.curbId = state.lastCurbId;
    else if (state.lastLotId && (pointsToLot(raw) || ((pointsBack(raw) || follow) && state.lastKind === "lot"))) ent.lotId = state.lastLotId;
  }
  ent.curbRef = pointsToCurb(raw);
  ent.lotRef = pointsToLot(raw);
  const named = findCurb(raw, ctx.units) || findLot(raw, ctx.lots);
  ent.only = !!named && entityOnly(raw, ent, ctx);

  if (ent.only) return run(followIntent(state, ent.curbId ? "curb" : "lot"), ctx, state, ent);
  // "Is C-041 free?" asks about that curb, never the site total.
  if (ent.curbId && OCCUPANCY.test(raw) && !LIST_WORDS.test(raw)) return run(INTENT_BY_ID.curb_status, ctx, state, { ...ent, occupancy: true });

  const { intent } = match(raw, ctx, ent);
  if (missing && (!intent || intent.group === "status" || entityOnly(raw, ent, ctx))) return lotNotFound(missing, ctx, state, ent, intent || INTENT_BY_ID[state.lastIntentId]);
  if (intent?.id === "more") {
    if (state.lastPaged) return run(INTENT_BY_ID[state.lastPaged.intentId], ctx, state, { ...state.lastPaged.ent, page: state.lastPaged.page + 1 });
    if (state.lastFunId) return run(INTENT_BY_ID[state.lastFunId], ctx, state, ent);
  }
  if (intent?.id === "repeat" && state.lastText) {
    return { intent: "repeat", group: "help", text: state.lastText, chips: state.lastChips || menuChips(ctx), state, fallback: false, entities: ent };
  }
  if (intent) return run(intent, ctx, state, ent);

  // Nothing matched, but a lot or curb was named or pointed at: follow the last topic,
  // or give that lot's free spots or that curb's status.
  if (ent.curbId || ent.lotId) return run(followIntent(state, ent.curbId ? "curb" : "lot"), ctx, state, ent);

  const fb = fallbackReply(FALLBACK, ctx, state);
  return { intent: "fallback", group: null, text: fb.text, chips: menuChips(ctx), state: fb.state, fallback: true, entities: ent };
}

// "Offline curbs and low batteries": parts that each match get their own answer.
export const respond = (raw, ctx, state = {}) => respondParts(raw, ctx, state, {
  respondOne, entityKeys: ["lotId", "curbId"], simTokens, isMath: parseMath,
});

// The opening message: greeting by time of day and name, and the topic menu.
export function welcome(ctx) {
  const h = new Date(ctx.now).getHours();
  const part = h < 5 ? "Hello" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const name = ctx.firstName ? `, ${ctx.firstName}` : "";
  const source = ctx.mode === "sim" ? "the simulated lots" : "your lots";
  return {
    text: `${part}${name}! I'm the Smart Wheel Stop Assistant. Ask me anything about ${source}, the curbs, or how to use this dashboard. I only read data; I never change it. Where shall we start?`,
    chips: menuChips(ctx),
  };
}

export { findCurb, findLot };

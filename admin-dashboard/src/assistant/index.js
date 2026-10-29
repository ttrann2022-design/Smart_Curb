// The rule-based assistant: no AI service and no network. respond() matches a
// message to an intent and returns a reply, follow-up chips and the conversation
// state to pass back next time. It only reads the data it's given.
//   ctx:   { lots, units, alerts, history, now, mode: "live" | "sim", role, firstName, random }
//   state: what the last turns were about (intent, lot, curb, recent variants, paged list)
import { INTENT_BY_ID, SOMETHING_ELSE, menuChips } from "./intents.js";
import { match } from "./matcher.js";
import { findCurb, findLot, missingLot, numberWords, pointsBack, pointsToCurb, pointsToLot } from "./entities.js";
import { lotViews } from "./data.js";
import { parseMath } from "./math.js";
import { normalize } from "./text.js";
import { simTokens } from "./similarity.js";

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
const FILLER = new Set(["and", "about", "how", "the", "for", "same", "then", "with", "in", "at", "is", "it", "its", "of", "ok", "so", "also", "please", "one", "there", "that", "this", "lot", "curb", "c", "unit", "sensor", "garage", "level"]);

// Only the curb or lot was named ("and Lot 6?", "C-042", "lot 99"): no other words left.
function entityOnly(raw, ent, ctx) {
  const lotText = ent.lotId ? `${ctx.lots?.[ent.lotId]?.name || ""} ${ent.lotId}` : ent.missingLot || "";
  const lot = lotText ? numberWords(normalize(lotText)).split(" ") : [];
  const words = numberWords(normalize(raw.replace(FOLLOW_UP, " "))).split(" ").filter(Boolean);
  return words.every((w) => FILLER.has(w) || /^\d+$/.test(w) || lot.includes(w) || lot.some((l) => l.startsWith(w) && w.length >= 3));
}

// Picks a variant, avoiding the most recent ones for this intent (never the last one).
function choose(variants, recent = [], random = Math.random) {
  const avoid = recent.slice(-Math.min(variants.length - 1, Math.max(1, Math.floor(variants.length / 2))));
  const open = variants.map((_, i) => i).filter((i) => !avoid.includes(i));
  const pool = open.length ? open : variants.map((_, i) => i);
  return pool[Math.floor(random() * pool.length) % pool.length];
}

function finish(intent, out, ctx, state, ent) {
  const reply = Array.isArray(out) ? { variants: out } : typeof out === "string" ? { variants: [out] } : out;
  const index = choose(reply.variants, state.recent?.[intent.id], ctx.random);
  const text = reply.variants[index];
  let chips = reply.chips || intent.next;
  if (intent.id === "menu" || !chips?.length) chips = menuChips(ctx);
  else if (!chips.includes(SOMETHING_ELSE)) chips = [...chips, SOMETHING_ELSE];
  const recent = { ...(state.recent || {}), [intent.id]: [...(state.recent?.[intent.id] || []), index].slice(-25) };
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
  const missing = ent.curbId ? null : missingLot(raw, ctx.lots);
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

  const index = choose(FALLBACK, state.recent?.fallback, ctx.random);
  const recent = { ...(state.recent || {}), fallback: [...(state.recent?.fallback || []), index].slice(-25) };
  return { intent: "fallback", group: null, text: FALLBACK[index], chips: menuChips(ctx), state: { ...state, recent }, fallback: true, entities: ent };
}

// "Offline curbs and low batteries": parts that each match get their own answer.
const SPLIT = /\s+(?:and also|and then|and|also|plus|as well as)\s+|\s*[;&]\s*|\?\s+(?=\S)/i;

// Joined answers share one source line, at the end, when they all have the same one.
const SOURCE = /\n\n(From [^\n]*)$/;
function joinAnswers(texts) {
  const sources = texts.map((t) => t.match(SOURCE)?.[1]);
  if (!sources[0] || sources.some((x) => x !== sources[0])) return texts.join("\n\n");
  return `${texts.map((t) => t.replace(SOURCE, "")).join("\n\n")}\n\n${sources[0]}`;
}

export function respond(raw, ctx, state = {}) {
  const parts = String(raw || "").split(SPLIT).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1 && !parseMath(raw)) {
    let st = state;
    const answers = [];
    for (const p of parts) {
      const r = respondOne(p, ctx, st);
      st = r.state;
      // A part needs two telling words of its own ("manager" alone isn't a question),
      // unless it names a lot or curb or is small talk ("thanks").
      const enough = simTokens(p).length >= 2 || r.entities?.lotId || r.entities?.curbId || r.group === "smalltalk";
      if (!r.fallback && enough) answers.push(r);
    }
    const distinct = new Set(answers.map((a) => `${a.intent}|${a.entities?.lotId || ""}|${a.entities?.curbId || ""}`));
    if (answers.length >= 2 && distinct.size >= 2) {
      const last = answers[answers.length - 1];
      return { ...last, intent: answers.map((a) => a.intent).join("+"), intents: answers.map((a) => a.intent), text: joinAnswers(answers.map((a) => a.text)), state: st };
    }
  }
  return respondOne(raw, ctx, state);
}

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

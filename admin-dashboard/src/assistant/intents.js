// Everything the assistant understands, from the group files in intents/. Each intent has:
//   keys   [word or phrase, weight]: plain words, folded through the same synonyms
//          as the question (so "space" also matches "spot"). Negative weights push
//          a question away from this intent.
//   curb / lot  extra weight when the question names a curb (C-041) or a lot;
//          negative to step aside for an intent that uses it.
//   usesCurb / usesLot  follow-ups ("and Lot 6?", "its battery") can carry that entity
//          over; lotIntent names the lot-specific intent to switch to instead.
//   maxWords    only for short messages ("ok", "thanks").
//   next   follow-up suggestion chips, worded so they match an intent.
//   say    3-5 variants (strings), or (ctx, entities) => variants or { variants, chips, more }.
import { STATUS_INTENTS } from "./intents/status.js";
import { HOWTO_INTENTS } from "./intents/howto.js";
import { EXPLAIN_INTENTS } from "./intents/explain.js";
import { TALK_INTENTS } from "./intents/talk.js";

export const GROUPS = { status: "Status", howto: "How-to and fixes", explain: "Explain, glossary and tips", smalltalk: "Small talk", help: "Help", fun: "Fun", offtopic: "Off-topic" };

export const INTENTS = [...STATUS_INTENTS, ...HOWTO_INTENTS, ...EXPLAIN_INTENTS, ...TALK_INTENTS];
export const INTENT_BY_ID = Object.fromEntries(INTENTS.map((i) => [i.id, i]));

// The topic menu: shown at the start, after "Something else", and with the fallback.
export const menuChips = (ctx = {}) => [
  "Open spots", "Offline curbs", "Low batteries", "LED help", "Users & roles", "Analytics", "What colours mean",
  ctx.mode === "sim" ? "Switch to Live" : "Switch to Simulation",
];
export const SOMETHING_ELSE = "Something else";

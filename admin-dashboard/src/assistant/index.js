// The rule-based assistant: no AI service and no network. respond() matches a
// question to an intent and returns its reply and follow-up chips. It only reads
// the data it's given and never writes to the database.
//   ctx: { lots, units, alerts, now, mode: "live" | "sim", role }
import { FALLBACK_CHIPS, START_CHIPS } from "./intents.js";
import { match } from "./matcher.js";
import { fallback } from "./answers.js";

export { INTENTS, GROUPS, START_CHIPS, FALLBACK_CHIPS } from "./intents.js";
export { match, rank, THRESHOLD } from "./matcher.js";

export function respond(raw, ctx) {
  const { intent, score, entities } = match(raw, ctx);
  if (!intent) return { intent: "fallback", group: null, score, text: fallback(ctx), chips: FALLBACK_CHIPS };
  const out = intent.answer(ctx, entities);
  const reply = typeof out === "string" ? { text: out } : out;
  return { intent: intent.id, group: intent.group, score, text: reply.text, chips: reply.chips || intent.next || START_CHIPS };
}

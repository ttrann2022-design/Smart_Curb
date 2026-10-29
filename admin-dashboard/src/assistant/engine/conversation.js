// Conversation helpers shared by every assistant: picking a variant that wasn't
// used recently, shaping a reply with its chips and memory, and splitting a
// multi-part question into answers. Pure JS.

// Picks a variant, avoiding the most recent ones for this intent (never the last one).
export function choose(variants, recent = [], random = Math.random) {
  const avoid = recent.slice(-Math.min(variants.length - 1, Math.max(1, Math.floor(variants.length / 2))));
  const open = variants.map((_, i) => i).filter((i) => !avoid.includes(i));
  const pool = open.length ? open : variants.map((_, i) => i);
  return pool[Math.floor(random() * pool.length) % pool.length];
}

// An intent's `say` output as { variants, chips?, more? }.
export const asReply = (out) => (Array.isArray(out) ? { variants: out } : typeof out === "string" ? { variants: [out] } : out);

// Picks the variant, adds "Something else" (or the topic menu) to the chips (the
// reply's own, else the intent's `next`), and records the variant in the
// conversation's memory. Returns { text, chips, reply, recent }.
export function pickReply(intent, out, ctx, state, { menuChips, somethingElse, menuIntent = "menu" }) {
  const reply = asReply(out);
  const index = choose(reply.variants, state.recent?.[intent.id], ctx.random);
  const text = reply.variants[index];
  let chips = reply.chips || intent.next;
  if (intent.id === menuIntent || !chips?.length) chips = menuChips(ctx);
  else if (!chips.includes(somethingElse)) chips = [...chips, somethingElse];
  const recent = { ...(state.recent || {}), [intent.id]: [...(state.recent?.[intent.id] || []), index].slice(-25) };
  return { text, chips, reply, recent };
}

// The fallback reply, rotating its variants like any other.
export function fallbackReply(variants, ctx, state) {
  const index = choose(variants, state.recent?.fallback, ctx.random);
  const recent = { ...(state.recent || {}), fallback: [...(state.recent?.fallback || []), index].slice(-25) };
  return { text: variants[index], state: { ...state, recent } };
}

// "Offline curbs and low batteries": parts that each match get their own answer.
export const SPLIT = /\s+(?:and also|and then|and|also|plus|as well as)\s+|\s*[;&]\s*|\?\s+(?=\S)/i;

// Joined answers share one source line, at the end, when they all have the same one.
const SOURCE = /\n\n(From [^\n]*)$/;
export function joinAnswers(texts) {
  const sources = texts.map((t) => t.match(SOURCE)?.[1]);
  if (!sources[0] || sources.some((x) => x !== sources[0])) return texts.join("\n\n");
  return `${texts.map((t) => t.replace(SOURCE, "")).join("\n\n")}\n\n${sources[0]}`;
}

// Answers every part of a multi-part question, or the whole question when it isn't one.
//   respondOne(raw, ctx, state)  one answer: { intent, group, text, state, fallback, entities }
//   entityKeys  the entities that make two answers to the same intent different
//   simTokens   telling words, so a part needs two of its own ("manager" alone isn't a question)
//   isMath      a sum ("3 + 4 and 5") is never split
export function respondParts(raw, ctx, state, { respondOne, entityKeys, simTokens, isMath }) {
  const parts = String(raw || "").split(SPLIT).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1 && !isMath(raw)) {
    let st = state;
    const answers = [];
    for (const p of parts) {
      const r = respondOne(p, ctx, st);
      st = r.state;
      // A part needs two telling words of its own, unless it names something or is small talk ("thanks").
      const enough = simTokens(p).length >= 2 || entityKeys.some((k) => r.entities?.[k]) || r.group === "smalltalk";
      if (!r.fallback && enough) answers.push(r);
    }
    const distinct = new Set(answers.map((a) => [a.intent, ...entityKeys.map((k) => a.entities?.[k] || "")].join("|")));
    if (answers.length >= 2 && distinct.size >= 2) {
      const last = answers[answers.length - 1];
      return { ...last, intent: answers.map((a) => a.intent).join("+"), intents: answers.map((a) => a.intent), text: joinAnswers(answers.map((a) => a.text)), state: st };
    }
  }
  return respondOne(raw, ctx, state);
}

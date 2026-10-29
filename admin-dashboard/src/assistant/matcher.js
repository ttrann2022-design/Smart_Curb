// Picks the intent a question means: canonical tokens (synonyms and typos folded
// in by text.js) are scored against each intent's weighted keywords and phrases,
// plus its similarity to the intent's example phrasings (similarity.js), plus the
// curb or lot the question names. The best score wins if it reaches THRESHOLD;
// otherwise there's no match and the assistant falls back.
import { INTENTS } from "./intents.js";
import { findCurb, findLot } from "./entities.js";
import { addVocabulary, canonicalPhrase, normalize, tokens } from "./text.js";
import { exampleWords, similarities } from "./similarity.js";

export const THRESHOLD = 2.5;
// How much a perfect match with an example phrasing is worth; weaker overlaps count
// in proportion, and below SIM_FLOOR not at all.
const SIM_WEIGHT = 5;
const SIM_FLOOR = 0.3;
const EXACT = 0.95;
const EXACT_BONUS = 3;

// How a question is asked hints at the kind of answer: something not working wants
// troubleshooting, "what does X mean" wants an explanation, "how do I" wants steps.
const CUES = [
  { re: / (not|never|broken|stuck|frozen|blank|failed|fails|error|wrong|invalid) /, boost: (i) => (i.id.startsWith("ts_") ? 1.5 : 0) },
  { re: /( mean | meaning | define | definition | explain |^ what does .* do | how does .* work )/, boost: (i) => (i.group === "explain" ? 1 : i.group === "status" ? -1 : 0) },
  { re: /^ (how do i|how can i|how to|how do you|where do i|where can i|where are|where is the) /, boost: (i) => (i.group === "howto" && !i.id.startsWith("ts_") ? 1 : i.group === "status" ? -1 : 0) },
];

// Keyword words become vocabulary, so typos are corrected towards them.
addVocabulary(INTENTS.flatMap((i) => i.keys.flatMap(([t]) => normalize(t).split(" "))));
addVocabulary(exampleWords());

// Keywords that fold into the same phrase ("quietest" and "least busy") count once, at the higher weight.
function compile(keys) {
  const best = new Map();
  for (const [t, w] of keys) {
    const term = ` ${canonicalPhrase(t)} `;
    if (!best.has(term) || Math.abs(w) > Math.abs(best.get(term))) best.set(term, w);
  }
  return [...best];
}
const COMPILED = INTENTS.map((intent) => ({ intent, terms: compile(intent.keys) }));

export { findCurb, findLot };

// Every intent's score for a question, best first. `entities` may carry a curb or
// lot from earlier in the conversation; otherwise they're found in the question.
export function rank(raw, data = {}, entities = null) {
  const toks = tokens(raw);
  const text = ` ${toks.join(" ")} `;
  const ent = entities || { curbId: findCurb(raw, data.units), lotId: findLot(raw, data.lots) };
  const sims = similarities(raw);
  const plain = ` ${normalize(raw)} `;
  const cues = CUES.filter((c) => c.re.test(plain));
  // A near-exact match with one intent's example settles it, unless another is as close.
  const exact = Object.entries(sims).filter(([, v]) => v >= EXACT);
  const exactId = exact.length === 1 ? exact[0][0] : null;
  const scored = COMPILED.map(({ intent, terms }, order) => {
    let score = 0;
    let hit = false;
    for (const [term, w] of terms) if (text.includes(term)) { score += w; if (w > 0) hit = true; }
    // Off-topic words (weather, bitcoin) are unambiguous, so they outweigh a passing overlap.
    if (intent.group === "offtopic") score *= 1.3;
    const sim = sims[intent.id] || 0;
    if (sim >= SIM_FLOOR) { score += SIM_WEIGHT * sim; if (sim >= 0.5) hit = true; }
    if (intent.id === exactId) score += EXACT_BONUS;
    if (hit || sim >= SIM_FLOOR) for (const c of cues) score += c.boost(intent);
    // A named curb or lot only counts towards intents the question is otherwise about.
    if (hit || ent.only) {
      if (ent.curbId) score += intent.curb || (intent.usesCurb ? 0.75 : 0);
      if (ent.lotId) score += intent.lot || (intent.usesLot ? 0.75 : 0);
    }
    // Intents about one curb or lot step back when none is named or pointed at ("that lot").
    if (intent.curb > 0 && !ent.curbId && !ent.curbRef) score -= 2;
    if (intent.lot > 0 && !ent.lotId && !ent.lotRef) score -= 1;
    if (intent.maxWords && toks.length > intent.maxWords) score = -Infinity;
    return { intent, score, order };
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return { ranked: scored, entities: ent, tokens: toks };
}

// The intent for a question, or null when nothing scores high enough.
export function match(raw, data = {}, entities = null) {
  const { ranked, entities: ent, tokens: toks } = rank(raw, data, entities);
  const top = ranked[0];
  return { intent: toks.length && top.score >= THRESHOLD ? top.intent : null, score: top.score, entities: ent };
}

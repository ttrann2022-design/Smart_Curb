// Picks the intent a question means: canonical tokens (synonyms and typos folded
// in by text.js) are scored against each intent's weighted keywords and phrases,
// plus its similarity to the intent's example phrasings (similarity.js), plus the
// entities the question names (a curb, a lot, a customer). The best score wins if
// it reaches THRESHOLD; otherwise there's no match and the assistant falls back.

export const THRESHOLD = 2.5;
// How much a perfect match with an example phrasing is worth; weaker overlaps count
// in proportion, and below SIM_FLOOR not at all.
const SIM_WEIGHT = 5;
const SIM_FLOOR = 0.3;
const EXACT = 0.95;
const EXACT_BONUS = 3;

// How a question is asked hints at the kind of answer: something not working wants
// troubleshooting, "what does X mean" wants an explanation, "how do I" wants steps.
export const CUES = [
  { re: / (not|never|broken|stuck|frozen|blank|failed|fails|error|wrong|invalid) /, boost: (i) => (i.id.startsWith("ts_") ? 1.5 : 0) },
  { re: /( mean | meaning | define | definition | explain |^ what does .* do | how does .* work )/, boost: (i) => (i.group === "explain" ? 1 : i.group === "status" ? -1 : 0) },
  { re: /^ (how do i|how can i|how to|how do you|where do i|where can i|where are|where is the) /, boost: (i) => (i.group === "howto" && !i.id.startsWith("ts_") ? 1 : i.group === "status" ? -1 : 0) },
];

// An assistant's matcher.
//   intents   each with keys [[phrase, weight]], optional maxWords, and entity weights
//   text      the assistant's createText() instance
//   sim       its createSimilarity() instance
//   slots     the entities intents can weigh, in scoring order:
//             { ent: "curbId", ref: "curbRef", weight: "curb", uses: "usesCurb", missing: 2 }
//             An intent gains intent[weight] (or 0.75 if intent[uses]) when ent is named,
//             and loses `missing` when its weight is positive and nothing is named or pointed at.
//   findEntities(raw, data)  the entities in a question, when the caller passes none
export function createMatcher({ intents, text, sim, slots, findEntities, cues = CUES }) {
  // Keyword words become vocabulary, so typos are corrected towards them.
  text.addVocabulary(intents.flatMap((i) => i.keys.flatMap(([t]) => text.normalize(t).split(" "))));
  text.addVocabulary(sim.exampleWords());

  // Keywords that fold into the same phrase ("quietest" and "least busy") count once, at the higher weight.
  function compile(keys) {
    const best = new Map();
    for (const [t, w] of keys) {
      const term = ` ${text.canonicalPhrase(t)} `;
      if (!best.has(term) || Math.abs(w) > Math.abs(best.get(term))) best.set(term, w);
    }
    return [...best];
  }
  const compiled = intents.map((intent) => ({ intent, terms: compile(intent.keys) }));

  // Every intent's score for a question, best first. `entities` may carry entities
  // from earlier in the conversation; otherwise they're found in the question.
  function rank(raw, data = {}, entities = null) {
    const toks = text.tokens(raw);
    const joined = ` ${toks.join(" ")} `;
    const ent = entities || findEntities(raw, data);
    const sims = sim.similarities(raw);
    const plain = ` ${text.normalize(raw)} `;
    const active = cues.filter((c) => c.re.test(plain));
    // A near-exact match with one intent's example settles it, unless another is as close.
    const exact = Object.entries(sims).filter(([, v]) => v >= EXACT);
    const exactId = exact.length === 1 ? exact[0][0] : null;
    const scored = compiled.map(({ intent, terms }, order) => {
      let score = 0;
      let hit = false;
      for (const [term, w] of terms) if (joined.includes(term)) { score += w; if (w > 0) hit = true; }
      // Off-topic words (weather, bitcoin) are unambiguous, so they outweigh a passing overlap.
      if (intent.group === "offtopic") score *= 1.3;
      const s = sims[intent.id] || 0;
      if (s >= SIM_FLOOR) { score += SIM_WEIGHT * s; if (s >= 0.5) hit = true; }
      if (intent.id === exactId) score += EXACT_BONUS;
      if (hit || s >= SIM_FLOOR) for (const c of active) score += c.boost(intent);
      // A named entity only counts towards intents the question is otherwise about.
      if (hit || ent.only) {
        for (const slot of slots) if (ent[slot.ent]) score += intent[slot.weight] || (intent[slot.uses] ? 0.75 : 0);
      }
      // Intents about one entity step back when none is named or pointed at ("that lot").
      for (const slot of slots) if (intent[slot.weight] > 0 && !ent[slot.ent] && !ent[slot.ref]) score -= slot.missing;
      if (intent.maxWords && toks.length > intent.maxWords) score = -Infinity;
      return { intent, score, order };
    });
    scored.sort((a, b) => b.score - a.score || a.order - b.order);
    return { ranked: scored, entities: ent, tokens: toks };
  }

  // The intent for a question, or null when nothing scores high enough.
  function match(raw, data = {}, entities = null) {
    const { ranked, entities: ent, tokens: toks } = rank(raw, data, entities);
    const top = ranked[0];
    return { intent: toks.length && top.score >= THRESHOLD ? top.intent : null, score: top.score, entities: ent };
  }

  return { rank, match };
}

// Picks the intent a question means: canonical tokens (synonyms and typos folded
// in by text.js) are scored against each intent's weighted keywords and phrases,
// plus the curb or lot the question names. The best score wins if it reaches
// THRESHOLD; otherwise there's no match and the assistant falls back.
import { INTENTS } from "./intents.js";
import { addVocabulary, canonicalPhrase, normalize, tokens } from "./text.js";

export const THRESHOLD = 2.5;

// Keyword words become vocabulary, so typos are corrected towards them.
addVocabulary(INTENTS.flatMap((i) => i.keys.flatMap(([t]) => normalize(t).split(" "))));

const COMPILED = INTENTS.map((intent) => ({ intent, terms: intent.keys.map(([t, w]) => [` ${canonicalPhrase(t)} `, w]) }));

const containsWords = (text, words) => !!words && ` ${text} `.includes(` ${words} `);

// A curb the question names: an existing ID in any spelling ("C-041", "c41", "C 41"),
// or else anything shaped like one, so the answer can say it doesn't exist.
export function findCurb(raw, units = {}) {
  const text = normalize(raw);
  let best = null;
  for (const id of Object.keys(units)) {
    const form = normalize(id);
    if (/\d/.test(form) && containsWords(text, form) && (!best || form.length > best.form.length)) best = { id, form };
  }
  if (best) return best.id;
  const m = text.match(/(?:^| )c (\d{1,4})(?: |$)/);
  return m ? `C-${m[1].padStart(3, "0")}` : null;
}

// A lot the question names, by its name or ID; the longest match wins ("Lot 14" over "Lot 1").
export function findLot(raw, lots = {}) {
  const text = normalize(raw);
  let best = null;
  for (const [id, lot] of Object.entries(lots)) {
    const name = typeof lot?.name === "string" ? lot.name : "";
    for (const form of [normalize(name), normalize(name.split(/ [—-] /)[0]), normalize(id)]) {
      if (form && containsWords(text, form) && (!best || form.length > best.form.length)) best = { id, form };
    }
  }
  return best?.id || null;
}

// Every intent's score for a question, best first.
export function rank(raw, data = {}) {
  const toks = tokens(raw);
  const text = ` ${toks.join(" ")} `;
  const entities = { curbId: findCurb(raw, data.units), lotId: findLot(raw, data.lots) };
  const scored = COMPILED.map(({ intent, terms }, order) => {
    let score = 0;
    for (const [term, w] of terms) if (text.includes(term)) score += w;
    if (entities.curbId && intent.curb) score += intent.curb;
    if (entities.lotId && intent.lot) score += intent.lot;
    if (intent.maxWords && toks.length > intent.maxWords) score = -Infinity;
    return { intent, score, order };
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return { ranked: scored, entities, tokens: toks };
}

// The intent for a question, or null when nothing scores high enough.
export function match(raw, data = {}) {
  const { ranked, entities, tokens: toks } = rank(raw, data);
  const top = ranked[0];
  return { intent: toks.length && top.score >= THRESHOLD ? top.intent : null, score: top.score, entities };
}

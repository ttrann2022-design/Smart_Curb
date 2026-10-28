// Scores a question against the example phrasings of every intent by weighted
// word overlap (cosine similarity, rarer words weighing more). It lets new
// wording land on the right intent when it shares the telling words with an
// example, without anyone listing every phrase as a keyword. Deterministic and
// local: no AI service, no network.
import { EXAMPLES } from "./examples/index.js";
import { tokens } from "./text.js";

// Words that say nothing about the topic.
const SKIP = new Set(["what", "is", "are", "was", "the", "a", "an", "i", "you", "me", "my", "do", "does", "did", "can", "could", "would", "should", "will",
  "how", "to", "of", "in", "on", "for", "it", "this", "that", "there", "be", "and", "or", "any", "show", "tell", "give", "with", "at", "about", "from",
  "we", "our", "us", "your", "get", "got", "have", "has", "am", "c", "please", "right", "now", "one", "all", "some", "just", "so", "up", "out", "if", "then"]);

export const simTokens = (raw) => [...new Set(tokens(raw).filter((t) => !SKIP.has(t) && !/^\d+$/.test(t)))];

// Built on first use, once the matcher has loaded its vocabulary (typo fixes depend on it).
let docs = null;
const df = new Map();
const idf = (t) => Math.log((docs.length + 1) / ((df.get(t) || 0) + 1)) + 1;
function build() {
  docs = EXAMPLES.map(([q, id]) => ({ id, toks: simTokens(q) })).filter((d) => d.toks.length);
  for (const d of docs) for (const t of d.toks) df.set(t, (df.get(t) || 0) + 1);
  for (const d of docs) d.norm = Math.sqrt(d.toks.reduce((s, t) => s + idf(t) ** 2, 0));
}

// The words of every example, so typos can be corrected towards them too.
export const exampleWords = () => EXAMPLES.flatMap(([q]) => q.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3));

// { intentId: best cosine similarity with any of its examples } for a question.
export function similarities(raw) {
  if (!docs) build();
  const q = simTokens(raw);
  const out = {};
  if (!q.length) return out;
  const qSet = new Set(q);
  const qNorm = Math.sqrt(q.reduce((s, t) => s + idf(t) ** 2, 0));
  for (const d of docs) {
    let dot = 0;
    for (const t of d.toks) if (qSet.has(t)) dot += idf(t) ** 2;
    if (!dot) continue;
    const sim = dot / (qNorm * d.norm);
    if (sim > (out[d.id] || 0)) out[d.id] = sim;
  }
  return out;
}

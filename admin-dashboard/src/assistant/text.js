// Text handling for the rule-based assistant: normalising a question into
// canonical tokens, with synonyms and small typos folded in. Pure JS, no React.

// Multi-word forms that mean one thing, joined before splitting into words.
const JOINS = [
  [/\b(is|are|does|did|has|have|was|were|should|could|would|do)nt\b/g, "$1 not"],
  [/\bwont\b/g, "will not"],
  [/\bcant\b/g, "can not"],
  [/\byoure\b/g, "you are"],
  [/\bim\b/g, "i am"],
  [/\b(what|how|where|who|that|there|it)s\b/g, "$1 is"],
  [/\blog off\b/g, "signout"],
  [/\b(quietest|emptiest|slowest)\b/g, "least busy"],
  [/\b(running|run|ran) out\b/g, "low"],
  [/\bin one go\b/g, "at once"],
  [/\bset up\b/g, "setup"],
  [/\b(sign|log) ?out\b/g, "signout"],
  [/\b(sign|log) ?in\b/g, "signin"],
  [/\bsign ?up\b/g, "signup"],
  [/\bwheel ?stops?\b/g, "curb"],
  [/\bcar ?parks?\b/g, "lot"],
  [/\bparking (lot|garage|area|deck)s?\b/g, "lot"],
  [/\bdark mode\b/g, "theme"],
  [/\blight mode\b/g, "theme"],
  [/\bcolou?r scheme\b/g, "theme"],
];

// word -> canonical word. Every canonical word maps to itself implicitly.
const SYNONYMS = {
  free: ["open", "available", "vacant", "unoccupied", "spare"],
  spot: ["space", "stall", "place", "bay", "slot"],
  lot: ["garage", "deck"],
  curb: ["kerb", "unit", "sensor", "device", "wheelstop"],
  offline: ["disconnected", "unreachable"],
  battery: ["batteries", "charge", "charging", "charged", "power"],
  low: ["weak", "dying", "flat", "drained", "lowest"],
  color: ["colour"],
  led: ["light", "lamp"],
  brightness: ["bright", "brighter", "brighten", "dim", "dimmer", "dimming", "intensity"],
  text: ["wording", "words", "caption"],
  user: ["person", "people", "account", "colleague", "coworker", "teammate", "member", "staff", "someone", "somebody", "employee"],
  role: ["permission", "access", "rights", "privilege", "privileges"],
  add: ["onboard", "register"],
  park: ["parking"],
  change: ["edit", "modify", "adjust", "alter", "tweak", "customize", "customise", "configure"],
  busy: ["busiest", "busier", "crowded", "packed", "popular", "fullest"],
  thanks: ["thank", "thx", "ty", "ta", "cheers", "appreciate", "appreciated"],
  hello: ["hi", "hey", "hiya", "howdy", "greetings", "yo", "hallo", "hola", "morning", "afternoon", "evening"],
  bye: ["goodbye", "cya", "farewell"],
  simulation: ["sim", "simulated", "simulator", "fake"],
  live: ["real", "production", "actual"],
  latency: ["delay", "lag"],
  analytics: ["stats", "statistics", "chart", "graph", "trend"],
  fresh: ["latest", "recent", "freshness", "newest", "updated"],
  attention: ["problem", "issue", "broken", "alert", "fault", "trouble", "warning"],
  occupied: ["taken", "used"],
  theme: ["skin", "appearance"],
  password: ["passcode", "pwd"],
  mean: ["means", "meaning", "definition"],
  remove: ["delete", "kick", "deactivate"],
  find: ["locate", "search", "lookup"],
  okay: ["ok", "k", "alright", "cool", "great", "nice", "perfect", "awesome", "sure"],
};

// Little words dropped before matching, so "add a lot" matches "add lot".
const STOP = new Set(["a", "an", "the", "please", "pls", "plz", "just", "currently", "actually"]);

const CANON = new Map();
for (const [canon, words] of Object.entries(SYNONYMS)) {
  CANON.set(canon, canon);
  for (const w of words) CANON.set(w, canon);
}

// Words the intents use, so typos can be corrected towards them. Filled by addVocabulary().
const VOCAB = new Set(CANON.keys());
export function addVocabulary(words) {
  for (const w of words) if (w.length >= 3) VOCAB.add(w);
}

// Lowercase, no punctuation, letters and digits split ("lot14" -> "lot 14"), leading zeros dropped.
export function normalize(raw) {
  let s = String(raw || "").toLowerCase()
    .replace(/[‘’`´']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/\b0+(\d)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  for (const [re, to] of JOINS) s = s.replace(re, to);
  return s;
}

// Optimal string alignment distance (Levenshtein plus swapped neighbours), capped at max + 1.
export function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

// Everyday words that are never "corrected" into a keyword ("show" isn't a typo for "slow").
const COMMON = [
  "show", "tell", "list", "what", "which", "where", "when", "there", "have", "need", "some", "most", "least", "with",
  "without", "from", "this", "that", "these", "those", "again", "about", "today", "right", "still", "been", "back",
  "work", "make", "data", "site", "does", "could", "would", "should", "give", "look", "much", "many", "want", "know",
  "like", "them", "they", "their", "here", "into", "onto", "over", "under", "after", "before", "than", "then", "only",
  "also", "very", "really", "every", "each", "other", "another", "same", "such", "being", "time", "your", "mine", "doing", "going", "thing", "things", "stuff", "send", "sent", "deal", "take", "taken", "away", "today", "ages", "long", "kind", "sort", "said", "says", "seen", "seem", "feel", "just", "next", "last", "most", "less", "few", "lots", "whole", "part", "same", "keep", "kept", "came", "come", "goes", "gone", "went", "done", "call", "able", "real", "true", "sure", "yeah", "nope", "okay", "fine", "good", "well", "best", "ever", "even", "much", "more", "only", "both", "either", "never", "always", "maybe", "where", "near", "close", "open", "nothing", "happened", "moved", "point", "capable", "together", "swap", "swapping", "waiting", "brilliant", "computer", "stayed", "pressed", "together", "slowly", "loading", "showing", "sending", "anyone", "everyone", "everything", "something", "someone",
];
COMMON.forEach((w) => VOCAB.add(w));

// How many typos a word of this length may have: none under 3 letters, one up to 6, then two.
const allowedTypos = (len) => (len < 3 ? 0 : len < 7 ? 1 : 2);

const cache = new Map();
function correct(word) {
  if (VOCAB.has(word) || /^\d+$/.test(word)) return word;
  if (cache.has(word)) return cache.get(word);
  // Plurals and common endings of a known word.
  for (const cut of ["s", "es", "ed", "ing"]) {
    const stem = word.endsWith(cut) ? word.slice(0, -cut.length) : null;
    if (stem && VOCAB.has(stem)) { cache.set(word, stem); return stem; }
  }
  const max = allowedTypos(word.length);
  let best = word;
  let bestD = max + 1;
  for (const v of max > 0 ? VOCAB : []) {
    // Short words: trust the first letter (three-letter words, the first two) and allow one typo.
    if (v.length < 5 && v[0] !== word[0]) continue;
    if (word.length === 3 && (v.length !== 4 || v[1] !== word[1])) continue;
    const d = editDistance(word, v, max);
    if (d < bestD && d <= allowedTypos(v.length)) { best = v; bestD = d; }
  }
  cache.set(word, best);
  return best;
}

// Words ending in s that aren't plurals ("news" isn't "new").
const NOT_PLURAL = new Set(["news", "sms", "always", "analytics", "stats", "status", "yes", "this", "is", "was", "has", "does", "plus", "bus", "gas", "less", "bonus", "focus", "series", "species", "ages", "whats", "thanks", "ms"]);

// A word's canonical form: its synonym group, or the singular of a known plural.
function canonical(w) {
  if (CANON.has(w)) return CANON.get(w);
  const single = w.endsWith("s") && w.length > 3 && !NOT_PLURAL.has(w) ? w.slice(0, -1) : null;
  if (single && (CANON.has(single) || VOCAB.has(single))) return CANON.get(single) || single;
  return w;
}

// Question -> canonical tokens.
export function tokens(raw) {
  const out = [];
  for (const w of normalize(raw).split(" ")) {
    if (!w || STOP.has(w)) continue;
    out.push(canonical(correct(w)));
  }
  return out;
}

// A keyword or phrase written in plain words, in the same canonical form as tokens().
// Not typo-corrected: keywords are spelled right.
export function canonicalPhrase(text) {
  return normalize(text).split(" ").filter((w) => w && !STOP.has(w)).map(canonical).join(" ");
}

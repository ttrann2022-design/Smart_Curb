// Finding a named thing (a lot, a customer) in a question. Names match loosely:
// partial names ("garage 2" for "Garage A, Level 2"), short forms ("gar2"), number
// words ("lot twelve") and small typos ("garag 2").
import { editDistance } from "./text.js";

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

// "twenty one" -> "21", "twelve" -> "12". Normalised text in, normalised text out.
// `fuzzy` also reads near misses after a lot word ("lot tweleve"), and "lot right" as "lot 8".
export function numberWords(text, fuzzy = true) {
  const words = text.split(" ");
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w in TENS) {
      const next = ONES.indexOf(words[i + 1]);
      if (next > 0 && next < 10) { out.push(String(TENS[w] + next)); i++; } else out.push(String(TENS[w]));
    } else if (ONES.includes(w)) out.push(String(ONES.indexOf(w)));
    else if (fuzzy && w.length >= 5 && /^(lot|garage|level|deck|floor|curb)$/.test(words[i - 1] || "")) {
      // A misspelt number word after a lot word ("lot tweleve"); elsewhere "there" isn't "three".
      const near = ONES.findIndex((o) => o.length >= 5 && editDistance(w, o, 1) <= 1);
      out.push(near > 0 ? String(near) : w);
    } else out.push(w);
  }
  return out.join(" ");
}

// How well a question word stands for a name word: exact, a prefix ("gar"), or a typo.
function wordMatch(q, w) {
  if (q === w) return w.length === 1 ? 0.6 : 1;
  if (/^\d+$/.test(q) || /^\d+$/.test(w)) return 0;
  if (q.length >= 3 && w.startsWith(q)) return 0.8;
  if (q.length >= 4 && w.length >= 4 && editDistance(q, w, 1) <= 1) return 0.8;
  return 0;
}

// How well the question's words name one thing. `generic` words ("lot", "mall") are
// shared by many names, so on their own they don't pick one.
function nameScore(qWords, form, generic) {
  const nameWords = form.split(" ").filter(Boolean);
  const numbers = nameWords.filter((w) => /^\d+$/.test(w));
  const words = nameWords.filter((w) => !/^\d+$/.test(w));
  const matched = [];
  for (const w of words) {
    let best = { s: 0, at: -1 };
    qWords.forEach((q, i) => { const s = wordMatch(q, w); if (s > best.s) best = { s, at: i }; });
    if (best.s) matched.push({ w, ...best });
  }
  if (numbers.length) {
    // A numbered name needs its number, next to (within two words of) a word of its name.
    const hits = numbers.map((n) => qWords.reduce((at, q, i) => (q === n ? i : at), -1));
    const distinctive = matched.filter((m) => !generic.has(m.w) && (m.w.length > 1 || matched.some((o) => o !== m && o.at === m.at - 1)));
    // Without its number, a distinctive word still names it ("North" for "Lot 12 — North").
    if (hits.some((at) => at < 0)) return distinctive.length ? distinctive.reduce((s, m) => s + m.s, 0) : 0;
    const near = hits.every((at) => matched.some((m) => Math.abs(m.at - at) <= 2));
    if (!near) return 0;
    return 2 * numbers.length + matched.reduce((s, m) => s + m.s, 0) - 0.1 * (words.length - matched.length);
  }
  // An unnumbered name needs a distinctive word ("North" in "North Garage"); a single
  // letter ("A") only counts right after a word of the name ("garage a").
  const real = matched.filter((m) => m.w.length > 1 || matched.some((o) => o !== m && o.at === m.at - 1));
  if (!real.some((m) => !generic.has(m.w))) return 0;
  return matched.reduce((s, m) => s + m.s, 0) - 0.1 * (words.length - matched.length);
}

// findName(raw, items): the id of the item a question names, by its name or its ID;
// null if none, or if two fit equally. Items are { id: { name } }.
export function createNameFinder({ normalize, generic }) {
  return function findName(raw, items = {}) {
    const qWords = numberWords(normalize(raw)).split(" ");
    let best = { id: null, score: 0 };
    let tie = false;
    for (const [id, item] of Object.entries(items)) {
      const name = typeof item?.name === "string" ? item.name : "";
      // IDs ("lot06", "garageA") count only when every part is typed exactly.
      const idWords = numberWords(normalize(id)).split(" ");
      const idScore = idWords.every((w) => qWords.includes(w)) ? 1 + idWords.length : 0;
      const score = Math.max(nameScore(qWords, numberWords(normalize(name)), generic), idScore);
      if (score > best.score + 0.01) { best = { id, score }; tie = false; } else if (score > 0 && Math.abs(score - best.score) <= 0.01 && id !== best.id) tie = true;
    }
    return tie ? null : best.id;
  };
}

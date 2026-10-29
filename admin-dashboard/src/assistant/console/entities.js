// What a console question is about: a customer, a lot, a curb or a quote request.
// Customers and lots match loosely (engine/names.js: partial names, number words,
// typos). A name made of everyday words needs more than one everyday word to
// count, so "lots that point here" doesn't pick "Harbor Point".
import { createNameFinder, numberWords, wordMatch } from "../engine/names.js";
import { isKnown, normalize } from "./text.js";

// Words shared by many names in any set; a word in two or more names of the set is also generic.
const ALWAYS_GENERIC = ["the", "of", "and", "at", "inc", "llc", "ltd", "co", "lot", "lots", "garage", "level", "deck", "parking", "area", "zone", "car", "park", "structure", "floor"];
// Words that are mostly part of the question, not a name, when they're the only match.
const QUESTION_WORDS = new Set(["point", "points", "city", "center", "centre", "status", "contact", "type", "request", "requests", "customer", "customers",
  "curb", "curbs", "new", "open", "active", "paused", "prospect", "details", "list", "most", "offline", "online", "battery", "admin", "platform", "import",
  "live", "simulation", "demo", "real", "first", "last", "best", "won", "closed", "contacted", "converted", "today", "week", "help", "show", "more",
  "time", "date", "data", "site", "sites", "spots", "size", "total", "public", "form", "quote", "website", "console", "home", "sign", "access", "account",
  "lot", "lots", "level", "north", "south", "east", "west", "main", "big", "fake", "test", "all", "any", "every", "which", "what", "who", "where"]);

const words = (s) => numberWords(normalize(s)).split(" ").filter(Boolean);

function genericFor(items) {
  const count = new Map();
  for (const it of Object.values(items)) {
    for (const w of new Set(words(typeof it?.name === "string" ? it.name : ""))) count.set(w, (count.get(w) || 0) + 1);
  }
  return new Set([...ALWAYS_GENERIC, ...[...count].filter(([, n]) => n > 1).map(([w]) => w)]);
}

// Does the question name this item strongly enough? A number in the name counts on
// its own (the finder already checked it); otherwise two name words, or one that
// isn't an everyday question word.
function strong(raw, name, generic) {
  const q = words(raw);
  const nameWords = words(name).filter((w) => !generic.has(w));
  if (words(name).some((w) => /^\d+$/.test(w) && q.includes(w))) return true;
  // A close match: exact, a prefix of 4+ letters ("brow"), or a typo in a word of 6+ letters
  // ("browad"). Shorter fuzzy matches are too easy ("tell" for "Bell", "are" for "Arena").
  const close = (x, w) => x === w || (x.length >= 4 && w.startsWith(x)) || (Math.min(x.length, w.length) >= 6 && wordMatch(x, w) > 0);
  const hits = nameWords.filter((w) => q.some((x) => close(x, w)));
  // Two name words, even loosely ("demo uni"), or all of a one-word name.
  const loose = nameWords.filter((w) => q.some((x) => wordMatch(x, w) > 0));
  if (loose.length >= 2 || (nameWords.length && hits.length === nameWords.length)) return true;
  return hits.some((w) => !QUESTION_WORDS.has(w) && q.some((x) => !QUESTION_WORDS.has(x) && close(x, w)));
}

function finder(items) {
  const generic = genericFor(items);
  const find = createNameFinder({ normalize, generic });
  return (raw) => {
    const id = find(raw, items);
    return id && strong(raw, items[id]?.name || "", generic) ? id : null;
  };
}

const named = (x) => (x && typeof x === "object" ? x : {});
export const findCustomer = (raw, sites) => finder(named(sites))(raw);
export const findLot = (raw, lots) => finder(named(lots))(raw);

// A request by the person's name or their organisation.
export function findLead(raw, leads) {
  const all = Object.entries(named(leads)).filter(([, l]) => l && typeof l === "object");
  const byPerson = Object.fromEntries(all.filter(([, l]) => l.name).map(([id, l]) => [id, { name: l.name }]));
  const byOrg = Object.fromEntries(all.filter(([, l]) => l.organization).map(([id, l]) => [id, { name: l.organization }]));
  return finder(byPerson)(raw) || finder(byOrg)(raw);
}

// A curb the question names: an existing ID in any spelling ("C-041", "c41", "curb 41"),
// or else anything shaped like one, so the answer can say it doesn't exist.
export function findCurb(raw, units) {
  const text = ` ${normalize(raw).replace(/\b(curb|unit|sensor|kerb|wheelstop) (\d)/g, "c $2")} `;
  let best = null;
  for (const id of Object.keys(named(units))) {
    const form = normalize(id);
    if (/\d/.test(form) && text.includes(` ${form} `) && (!best || form.length > best.length)) best = id;
  }
  if (best) return best;
  const m = text.match(/ c (\d{1,4}) /);
  return m ? `C-${m[1].padStart(3, "0")}` : null;
}

// Words that point back at the last thing talked about.
export const pointsBack = (raw) => /\b(it|its|it's|they|their|them|that one|this one|the same|there|those|these)\b/i.test(raw);
export const pointsToCustomer = (raw) => /\b(that|this|the same|same|their) (customer|client|site|company)\b/i.test(raw);
export const pointsToLot = (raw) => /\b(that|this|same) (lot|garage)\b/i.test(raw);
export const pointsToCurb = (raw) => /\b(that|this|same) (curb|sensor|unit)\b/i.test(raw);
export const pointsToLead = (raw) => /\b(that|this|same) (request|lead|quote)\b/i.test(raw);

// Words that start a phrase but never a name ("has been waiting", "does any lot", "has no curbs").
const NOT_A_NAME_START = new Set(["been", "being", "had", "have", "got", "gotten", "no", "zero", "any", "some", "more", "most", "less", "least",
  "the", "a", "an", "not", "never", "ever", "already", "still", "just", "only", "all", "every", "each", "many", "much", "few", "nothing", "none"]);
// Words that never make a name on their own ("Tell me about Live").
const NOT_NAMES = new Set(["i", "live", "simulation", "sim", "home", "customers", "customer", "requests", "request", "deployments", "import", "assistant",
  "console", "firebase", "csv", "uid", "lime", "it", "its", "them", "that", "this", "these", "those", "there", "here", "me", "you", "us", "my", "our",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "today", "yesterday", "tomorrow", "now", "the", "a", "an", "all", "each",
  "every", "any", "which", "what", "who", "lots", "curbs", "status", "contact", "details", "type", "some", "one", "more", "a lot", "everything", "everyone"]);
const TRAILING = /\s+(have|has|got|own|owns|use|uses|lots?|curbs?|details|status|contact|request|customer|please|now|today|again|right now)$/i;

function clean(s) {
  let out = String(s || "").trim().replace(/^["“'‘]|["”'’]$/g, "").replace(/^(the|a|an)\s+/i, "");
  while (TRAILING.test(out)) out = out.replace(TRAILING, "");
  out = out.replace(/[?.!,;:]+$/, "").trim();
  if (!out || out.length > 60) return null;
  const ws = out.toLowerCase().split(/\s+/);
  if (ws.every((w) => NOT_NAMES.has(w))) return null;
  return out;
}

// A name the question gives for something ("the customer called Acme", "Broward
// Mall's lots", "tell me about Acme Corp", "and lot 99?"), whether or not it exists.
// Returns { text, kind: "lot" | "thing" } or null.
export function nameIn(raw) {
  const s = String(raw || "");
  const lotNo = normalize(s).match(/\b(lot|garage|deck) (?:number |no )?(\d+[a-z]?)\b/);
  if (lotNo) return { text: `${lotNo[1][0].toUpperCase()}${lotNo[1].slice(1)} ${lotNo[2].toUpperCase()}`, kind: "lot" };
  const called = s.match(/\b(customer|client|company|site|organi[sz]ation|lot|garage|request|lead)\s+(?:called|named)\s+["“']?([^"”'?!.,;]+)/i);
  if (called) {
    const text = clean(called[2]);
    if (text) return { text, kind: /lot|garage/i.test(called[1]) ? "lot" : "thing" };
  }
  const caps = "[A-Z][\\w&.-]*";
  const phrase = `${caps}(?:\\s+(?:${caps}|of|the|and|\\d+))*`;
  const possessive = s.match(new RegExp(`\\b(${phrase})['’]s\\b`));
  if (possessive) {
    const text = clean(possessive[1]);
    if (text && !/^(what|who|where|how|that|it|there|here|let)$/i.test(text)) return { text, kind: "thing" };
  }
  const after = s.match(new RegExp(`\\b(?:about|for|of|on|at|from|does|did|has|is|with|in|and|to)\\s+(${phrase})`));
  if (after) {
    const text = clean(after[1]);
    if (text) return { text, kind: "thing" };
  }
  // Lower case, at the end: "how many lots does acme have", "tell me about acme", "and broward?"
  // Not after "with", "for" or "of": there an unfamiliar word is part of the question
  // ("customers with zero lots", "lots for events"), not a name. Real names still match
  // through findAll, and capitalised ones through the rule above.
  const tail = s.match(/\b(?:about|does|did|has|and)\s+([a-z][a-z0-9&.-]*(?:\s+[a-z0-9][a-z0-9&.-]*){0,2})\s*\??\s*$/i);
  if (tail) {
    const text = clean(tail[1]);
    const first = text ? text.toLowerCase().split(/\s+/)[0] : "";
    // "has been sitting longest", "did any …": a verb or quantifier, not a name.
    if (text && !NOT_A_NAME_START.has(first) && text.toLowerCase().split(/\s+/).some((w) => w.length >= 3 && !isKnown(w) && !NOT_NAMES.has(w))) return { text, kind: "thing" };
  }
  return null;
}

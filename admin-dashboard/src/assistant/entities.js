// Finds the curb and the lot a question is about. Lots match loosely (engine/names.js):
// partial names ("garage 2" for "Garage A, Level 2"), short forms ("gar2"), number
// words ("lot twelve") and small typos ("garag 2").
import { normalize } from "./text.js";
import { createNameFinder, numberWords } from "./engine/names.js";

export { numberWords };

// Words every lot name shares; on their own they don't pick a lot.
const GENERIC = new Set(["lot", "lots", "garage", "level", "deck", "parking", "area", "zone", "car", "park", "the", "and", "of", "structure", "floor"]);

// The lot a question names, by its name or ID; null if none, or if two fit equally.
const findName = createNameFinder({ normalize, generic: GENERIC });
export const findLot = (raw, lots = {}) => findName(raw, lots);

// Words before "lot" or "garage" that aren't a lot's name ("Which lot", "The garage").
const NOT_A_NAME = new Set(["which", "what", "that", "this", "the", "each", "every", "any", "a", "one", "best", "busiest", "fullest",
  "emptiest", "quietest", "next", "same", "parking", "full", "free", "empty", "my", "our", "your", "is", "in", "per", "by", "whole", "all", "car",
  "biggest", "smallest", "closest", "nearest", "main", "other", "new", "another", "first", "last", "favourite", "favorite"]);

// A lot the question names that isn't one of `lots`: "lot 99", "garage Z", "the lot
// called Westfield", "Westfield lot". Returns the name as typed, or null. Names that
// partly fit a real lot ("lot 12" for "Lot 12 — North") don't count as missing.
export function missingLot(raw, lots) {
  if (!lots || findLot(raw, lots)) return null;
  const text = numberWords(normalize(raw), false);
  const known = Object.entries(lots).flatMap(([id, l]) => numberWords(normalize(`${l?.name || ""} ${id}`)).split(" "))
    .map((w) => (/^\d+$/.test(w) ? String(Number(w)) : w));
  const isKnown = (w) => known.includes(/^\d+$/.test(w) ? String(Number(w)) : w);
  const title = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
  const numbered = text.match(/\b(lot|garage|deck) (?:number |no )?(\d+[a-z]?|[a-z])\b/);
  if (numbered && !(numbered[2].length === 1 && /[ai]/.test(numbered[2]) && numbered[1] === "lot") && !isKnown(numbered[2])) return title(`${numbered[1]} ${numbered[2]}`);
  const called = text.match(/\b(?:lot|garage) (?:called|named) ([a-z0-9]+(?: [a-z0-9]+)?)/);
  if (called && !called[1].split(" ").some(isKnown)) return title(called[1]);
  // A capitalised word right before "lot" or "garage": only proper names are written that way.
  const proper = [...String(raw).matchAll(/\b([A-Z][a-z]+) (?:[Ll]ot|[Gg]arage|[Cc]ar [Pp]ark)\b/g)].map((m) => m[1])
    .find((w) => !NOT_A_NAME.has(w.toLowerCase()) && !isKnown(w.toLowerCase()));
  if (proper) return proper;
  return null;
}

// A curb the question names: an existing ID in any spelling ("C-041", "c41", "curb 41"),
// or else anything shaped like one, so the answer can say it doesn't exist.
export function findCurb(raw, units = {}) {
  const text = ` ${normalize(raw).replace(/\b(curb|unit|sensor|kerb) (\d)/g, "c $2")} `;
  let best = null;
  for (const id of Object.keys(units)) {
    const form = normalize(id);
    if (/\d/.test(form) && text.includes(` ${form} `) && (!best || form.length > best.length)) best = id;
  }
  if (best) return best;
  const m = text.match(/ c (\d{1,4}) /);
  return m ? `C-${m[1].padStart(3, "0")}` : null;
}

// Words that point back at the last curb or lot ("its battery", "that lot", "there").
export const pointsBack = (raw) => /\b(it|its|it's|that one|this one|that curb|this curb|same curb|that lot|this lot|same lot|there|that sensor|that unit|the same)\b/i.test(raw);
export const pointsToLot = (raw) => /\b(that lot|this lot|same lot|there)\b/i.test(raw);
export const pointsToCurb = (raw) => /\b(that curb|this curb|same curb|that sensor|that unit|that one|this one)\b/i.test(raw);

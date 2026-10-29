// The dashboard Assistant's matcher (engine/matcher.js): its intents, its words, and
// the curb or lot a question names.
import { INTENTS } from "./intents.js";
import { findCurb, findLot } from "./entities.js";
import * as text from "./text.js";
import * as sim from "./similarity.js";
import { THRESHOLD, createMatcher } from "./engine/matcher.js";

const SLOTS = [
  { ent: "curbId", ref: "curbRef", weight: "curb", uses: "usesCurb", missing: 2 },
  { ent: "lotId", ref: "lotRef", weight: "lot", uses: "usesLot", missing: 1 },
];

export const { rank, match } = createMatcher({
  intents: INTENTS, text, sim, slots: SLOTS,
  findEntities: (raw, data) => ({ curbId: findCurb(raw, data.units), lotId: findLot(raw, data.lots) }),
});
export { THRESHOLD, findCurb, findLot };

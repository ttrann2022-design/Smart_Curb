// Example phrasings for every intent. The matcher scores a question against them
// by word overlap (see similarity.js), and npm run test:assistant checks each one
// still reaches its intent. Multi-part examples ("a+b") are test-only.
import { PHASE1 } from "./phase1.js";
import { PHASE2 } from "./phase2.js";
import { TUNED_HOLDOUT, TUNED_HOLDOUT_2 } from "./tuned.js";
import { EXTRA } from "./extra.js";

export const ALL_EXAMPLES = [...PHASE1, ...PHASE2, ...TUNED_HOLDOUT, ...TUNED_HOLDOUT_2, ...EXTRA];
export const EXAMPLES = ALL_EXAMPLES.filter(([, id]) => !id.includes("+"));

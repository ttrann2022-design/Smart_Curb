// The dashboard Assistant's example phrasings as a similarity index (engine/similarity.js).
import { EXAMPLES } from "./examples/index.js";
import { tokens } from "./text.js";
import { createSimilarity } from "./engine/similarity.js";

export const { simTokens, similarities, exampleWords } = createSimilarity(EXAMPLES, tokens);

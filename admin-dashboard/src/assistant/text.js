// The dashboard Assistant's words: multi-word forms and synonyms for parking, curbs
// and the dashboard, on top of the shared text engine (engine/text.js).
import { ENGLISH_JOINS, createText, editDistance } from "./engine/text.js";

// Multi-word forms that mean one thing, joined before splitting into words.
const JOINS = [
  ...ENGLISH_JOINS,
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

export const { normalize, tokens, canonicalPhrase, addVocabulary } = createText({ joins: JOINS, synonyms: SYNONYMS });
export { editDistance };

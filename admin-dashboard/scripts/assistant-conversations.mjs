// Test-only conversations for npm run test:assistant: follow-ups with a stored
// context, and out-of-scope questions. Not shipped with the app.

// Follow-ups: [earlier messages, follow-up, expected intent, expected lot or curb].
export const FOLLOW_UPS = [
  [["how many spots are free in lot 14"], "and lot 6?", "free_lot", "lot06"],
  [["how many spots are free in lot 14"], "what about garage 2", "free_lot", "garageA"],
  [["status of C-041"], "what about its battery?", "curb_battery", "C-041"],
  [["status of C-041"], "and C-002?", "curb_status", "C-002"],
  [["what's C-041's battery"], "and c2?", "curb_battery", "C-002"],
  [["status of C-041"], "when did it last report?", "curb_last_seen", "C-041"],
  [["status of C-041"], "which lot is it in?", "curb_location", "C-041"],
  [["tell me about lot 6"], "and lot 14?", "lot_details", "lot14"],
  [["tell me about lot 6"], "which curbs are in that lot?", "lot_curbs", "lot06"],
  [["tell me about lot 6"], "any low batteries there?", "low_battery", "lot06"],
  [["which curbs are offline"], "and in lot 6?", "offline_curbs", "lot06"],
  [["show low batteries"], "what about lot 14", "low_battery", "lot14"],
  [["which lot is busiest"], "and lot 6?", "free_lot", "lot06"],
  [["tell me a joke"], "another one", "joke", null],
  [["tell me a joke"], "more", "joke", null],
  [["tell me a fun fact"], "show me more", "fun_fact", null],
  [["thanks"], "lot 14", "free_lot", "lot14"],
  [["tell me about lot 6", "thanks"], "and lot 14?", "lot_details", "lot14"],
];

// Out of scope: must reach a friendly fallback (fallback or off-topic), never a wrong answer.
export const OUT_OF_SCOPE = [
  "What's the weather tomorrow?", "who won the football game", "book me a flight to Paris", "what is the capital of France",
  "play some music", "how do I bake bread", "translate hello into Spanish", "order a pizza", "what time is the meeting",
  "asdfghjkl", "", "   ", "?!", "who is the president", "write me a poem about cats", "what's the stock price of apple",
  "is bitcoin going up", "help me with my history essay", "recommend a movie", "what's on the news",
  "call me a taxi", "will it rain today", "who is the best footballer", "what's a good recipe for pasta", "tell me about dinosaurs",
  "how far is the moon", "what are the lottery numbers", "what's my horoscope", "can you play minecraft", "book a hotel room",
  "who is the richest celebrity", "qwerty uiop", "blah blah blah", "the quick brown fox", "xyz", "what's your opinion on politics",
  "how many planets are there", "best video game ever", "uber to the airport", "who will win the election",
];

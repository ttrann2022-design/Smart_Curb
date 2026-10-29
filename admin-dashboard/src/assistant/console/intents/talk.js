// Small talk, help, navigation (menu, more, repeat) and the lighter side for the
// Console Assistant. The jokes, facts and stories and the calculator are the shared
// engine's (engine/content.js, engine/math.js); the wording around them is the console's.
import { FACTS, JOKES, STORIES } from "../../engine/content.js";
import { formatNumber } from "../../engine/math.js";
import { pick } from "../common.js";

export function partOfDay(now) {
  const h = new Date(now).getHours();
  if (h < 5) return "Hello";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
const hiName = (ctx) => (ctx.firstName ? `, ${ctx.firstName}` : "");

export const TALK_INTENTS = [
  {
    id: "greeting", group: "smalltalk", maxWords: 3,
    keys: [["hello", 3], ["good", 0.5], ["there", 0.3]],
    next: ["Summary", "How many new requests?", "What can you do?"],
    say: (ctx) => [
      `${partOfDay(ctx.now)}${hiName(ctx)}! Want the big picture, or something specific?`,
      `${partOfDay(ctx.now)}${hiName(ctx)}. Customers, requests, lots: what shall I look up?`,
      `Hi${hiName(ctx)}! Ready when you are.`,
      `Hello${hiName(ctx)}! Ask me about a customer, the inbox, or how to do something in the console.`,
    ],
  },
  {
    id: "thanks", group: "smalltalk", maxWords: 7,
    keys: [["thanks", 3], ["helpful", 1.5], ["much", 0.3]],
    next: ["Summary", "How many new requests?", "Tell me a joke"],
    say: ["You're welcome! Anything else?", "Any time.", "Happy to help. What's next?", "Glad it was useful."],
  },
  {
    id: "goodbye", group: "smalltalk", maxWords: 6,
    keys: [["bye", 3], ["see you", 3], ["later", 1.5], ["good night", 3], ["that is all", 3], ["done for", 2.5]],
    next: ["Summary", "Something else"],
    say: (ctx) => [`Bye${hiName(ctx)}!`, "See you later. The inbox will keep.", `Take care${hiName(ctx)}.`, "Goodbye! I'll be here."],
  },
  {
    id: "who_are_you", group: "smalltalk",
    keys: [["who are you", 3.5], ["what are you", 3.5], ["your name", 3], ["are you ai", 3.5], ["chatgpt", 2.5], ["who made", 3], ["who built", 3], ["introduce", 2.5], ["robot", -2], ["can you", -1]],
    next: ["What can you do?", "Are you a robot?", "Summary"],
    say: [
      "I'm the Smart Wheel Stop Console Assistant. I answer from the console's own data with fixed rules: no AI service, no network, and I never change anything.",
      "Smart Wheel Stop Console Assistant. I know the customers, requests, lots and curbs this console shows, and how its pages work.",
      "The console's built-in helper: rule-based, read-only, and running right here in your browser.",
    ],
  },
  {
    id: "are_you_robot", group: "smalltalk",
    keys: [["robot", 3], ["bot", 3], ["human", 3], ["real person", 3.5], ["are you real", 3.5], ["machine", 2.5], ["alive", 2.5]],
    next: ["Who are you?", "What can you do?", "Tell me a joke"],
    say: ["A program, not a person: hand-written rules, no AI service behind me.", "Software, yes. Polite software.", "Not human. Just rules, data and a fondness for tidy customer lists."],
  },
  {
    id: "capabilities", group: "smalltalk",
    keys: [["what can you", 3.5], ["what do you do", 3.5], ["can you", 1], ["able to", 2.5], ["capable", 3], ["what else", 2], ["you", 0.3], ["can you change", -3], ["can you add", -3]],
    next: ["Summary", "How many new requests?", "How do I import lots from CSV?"],
    say: [
      "I can count and list customers, requests, lots and curbs, look up one customer or lot, spot offline curbs and low batteries, and walk you through console tasks like converting a request or importing lots. I only read; I never change data.",
      "Ask me things like \"tell me about Demo Mall\", \"new requests older than 2 days\", \"lots without coordinates\" or \"how do I add a platform admin\".",
      "Numbers and lists from the live (or simulated) data, step-by-step help for every console page, and the odd joke.",
    ],
  },
  {
    id: "can_you_change", group: "smalltalk",
    keys: [["can you change", 4.5], ["can you add", 4.5], ["can you delete", 4.5], ["can you convert", 4.5], ["can you assign", 4.5], ["do it for me", 4.5], ["for me", 1.5]],
    next: ["What can you do?", "How do I convert a request?", "How do I assign a lot?"],
    say: ["I can't: I only read. But I can tell you exactly where to click.", "I never write to the database, so that's one for you. Ask me how and I'll walk you through it.", "Read-only, I'm afraid. Want the steps?"],
  },
  {
    id: "how_are_you", group: "smalltalk", maxWords: 6,
    keys: [["how are you", 4], ["how is it going", 3.5], ["how you doing", 3.5], ["you ok", 3]],
    next: ["Summary", "How many new requests?", "Tell me a joke"],
    say: ["All good, thanks! Want a quick summary?", "Doing well. Every rule in order. You?", "Fine, thanks for asking. What can I check?"],
  },
  {
    id: "okay", group: "smalltalk", maxWords: 3,
    keys: [["okay", 3], ["got it", 3], ["understood", 3], ["fine", 2]],
    next: ["Summary", "How many new requests?", "Something else"],
    say: ["Okay! What next?", "Sounds good.", "Alright. I'm here if you need me."],
  },
  {
    id: "help", group: "help",
    keys: [["help", 3], ["what can i ask", 4], ["example", 3], ["question", 1.5], ["can i ask", 3], ["topic", 2], ["how do i use", 2], ["stuck", -1]],
    next: ["Summary", "List customers", "Newest requests"],
    say: [
      "Here's what I can answer:\n• Customers: counts, statuses, one customer's details, lots, curbs and contact\n• Requests: new, newest, waiting too long, converted\n• Lots and curbs: unassigned, missing size or location, offline, low battery\n• How-to and fixes: customers, requests, lots, imports, platform admins, sign-in\n• Explain: statuses, Live vs Simulation, how sites, lots and curbs link\n• Fun: jokes, facts, quick maths",
      "Try one of the topics below, or ask in your own words, like \"which customers have no lots?\"",
      "I'm good with customers, quote requests, lots, curbs and console how-tos. Pick a topic to start.",
    ],
  },
  {
    id: "menu", group: "help",
    keys: [["something else", 4], ["menu", 3.5], ["main menu", 4], ["start over", 3.5], ["other topic", 3.5], ["back", 1.5]],
    next: [],
    say: ["Sure! What would you like to look at?", "Here's the menu.", "Pick a topic:", "Let's try something else:"],
  },
  {
    id: "more", group: "help", maxWords: 4,
    keys: [["more", 3], ["show more", 4], ["next", 2], ["continue", 3], ["keep going", 3.5], ["another", 2.5], ["rest", 2]],
    next: ["Summary", "Something else"],
    say: ["There's no list going right now. Ask for one first, like \"list customers\".", "Nothing more to show. What else can I find?", "No longer list open. Try \"newest requests\"."],
  },
  {
    id: "repeat", group: "help", maxWords: 7,
    keys: [["repeat", 3], ["what was that", 3.5], ["say that again", 4], ["again", 1.5], ["what did you say", 3.5], ["pardon", 3]],
    next: ["Summary", "Something else"],
    say: ["Nothing to repeat yet! Ask me something.", "I haven't said anything worth repeating yet.", "Let's start: what can I help with?"],
  },
  {
    id: "joke", group: "fun",
    keys: [["joke", 4], ["funny", 3], ["make me laugh", 4], ["pun", 3], ["laugh", 1.5]],
    next: ["Another joke", "Tell me a fun fact", "Something else"],
    say: JOKES,
  },
  {
    id: "fun_fact", group: "fun",
    keys: [["fun fact", 4.5], ["fact", 3.5], ["did you know", 3.5], ["trivia", 3.5], ["something interesting", 3.5]],
    next: ["Another fact", "Tell me a joke", "Something else"],
    say: FACTS,
  },
  {
    id: "story", group: "fun",
    keys: [["story", 4], ["tell me a story", 4.5], ["bedtime", 3], ["tale", 3]],
    next: ["Tell me a joke", "Tell me a fun fact", "Something else"],
    say: STORIES,
  },
  {
    id: "calculator", group: "fun",
    keys: [["calculate", 2], ["calculator", 3], ["math", 2], ["maths", 2], ["sum", 1.5], ["arithmetic", 3]],
    next: ["Total spots across all lots", "Summary", "Something else"],
    say: (ctx, ent) => {
      const m = ent.math;
      if (!m) return ["Give me a sum, like \"240 / 8\" or \"15% of 3,000\".", "Happy to work something out: type it like 120 * 3.", "I do quick sums. Try \"what is 48 x 25\"."];
      if (m.error === "zero") return ["No answer: you can't divide by zero.", `${m.expr} has no answer; division by zero.`, "Dividing by zero? Not even I can do that."];
      if (m.error === "big") return [`${m.expr} is too big to show nicely.`, "That number's too large for me.", "Too big. Try something smaller."];
      if (m.error) return [`I couldn't read "${m.expr}". Try something like 48 x 25.`, "That sum didn't parse. Check the brackets?", "I didn't follow that. Write it like 120 / 4 + 3."];
      const v = formatNumber(m.value);
      return [`${m.expr} = ${v}`, `That comes to ${v}.`, `${v}.`, `The answer is ${v}.`];
    },
  },
  {
    id: "time_now", group: "fun",
    keys: [["what time", 3], ["time is it", 4], ["current time", 3.5], ["the time", 2], ["clock", 2.5], ["when", -1]],
    next: ["What's today's date?", "Summary", "Something else"],
    say: (ctx) => {
      const t = new Date(ctx.now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      return [`It's ${t} on your device.`, `${t}.`, `Your clock says ${t}.`];
    },
  },
  {
    id: "date_today", group: "fun",
    keys: [["what day", 3], ["what date", 3.5], ["todays date", 3.5], ["what is the date", 4], ["day is it", 3.5], ["day is today", 3.5]],
    next: ["How many requests this week?", "What time is it?", "Something else"],
    say: (ctx) => {
      const d = new Date(ctx.now).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
      return [`Today is ${d}.`, `It's ${d}.`, `${d}, by your device's calendar.`];
    },
  },
  {
    id: "coin_flip", group: "fun",
    keys: [["flip coin", 4], ["flip a coin", 4], ["coin", 3], ["heads or tails", 4], ["toss", 2.5]],
    next: ["Roll a die", "Tell me a joke", "Something else"],
    say: (ctx) => {
      const side = pick(ctx, ["Heads", "Tails"]);
      return [`${side}.`, `It's ${side.toLowerCase()}!`, `Flipped: ${side.toLowerCase()}.`];
    },
  },
  {
    id: "dice", group: "fun",
    keys: [["roll die", 4], ["roll a die", 4], ["roll dice", 4], ["dice", 3.5], ["random number", 3.5]],
    next: ["Flip a coin", "Tell me a joke", "Something else"],
    say: (ctx) => {
      const n = pick(ctx, [1, 2, 3, 4, 5, 6]);
      return [`A ${n}.`, `🎲 ${n}.`, `You rolled ${n}.`];
    },
  },
  {
    id: "compliment_bot", group: "fun",
    keys: [["good job", 4], ["well done", 4], ["you are great", 4], ["you are smart", 4], ["love you", 3.5], ["you rock", 4], ["amazing", 2.5], ["clever", 3]],
    next: ["Summary", "Tell me a joke", "Something else"],
    say: ["Thank you! I'll tell the customer list.", "That's kind. Right back at you.", "Thanks! One rule at a time."],
  },
  {
    id: "rude", group: "fun",
    keys: [["stupid", 4], ["useless", 4], ["dumb", 4], ["hate you", 4], ["shut up", 4], ["idiot", 4], ["you suck", 4], ["rubbish", 3.5], ["worst", 2]],
    next: ["What can you do?", "Help", "Something else"],
    say: ["Sorry I let you down. Try rephrasing, or pick a topic below.", "Fair. Tell me what you were after and I'll try again.", "Point taken. Maybe one of these topics will work better?"],
  },
  {
    id: "sorry", group: "fun", maxWords: 6,
    keys: [["sorry", 3], ["my bad", 3.5], ["oops", 3], ["apologies", 3]],
    next: ["Summary", "Something else"],
    say: ["No worries!", "Nothing to apologise for.", "All good. What's next?"],
  },
  {
    id: "laugh", group: "fun", maxWords: 4,
    keys: [["haha", 4], ["lol", 4], ["hehe", 4], ["funny", 1.5], ["lmao", 4]],
    next: ["Another joke", "Tell me a fun fact", "Something else"],
    say: ["Glad that landed! Another?", "😄 Plenty more where that came from.", "Thank you, I'm here all week."],
  },
  {
    id: "off_topic", group: "offtopic",
    keys: [["weather", 5], ["rain", 4], ["news", 4.5], ["sport", 4.5], ["football", 5], ["soccer", 5], ["basketball", 5], ["movie", 4.5], ["film", 4.5], ["song", 4], ["music", 4.5], ["recipe", 5],
      ["cook", 4.5], ["homework", 5], ["essay", 4.5], ["poem", 4.5], ["stock", 4.5], ["bitcoin", 5], ["crypto", 5], ["politic", 5], ["election", 5], ["president", 5], ["capital of", 5],
      ["translate", 5], ["flight", 5], ["pizza", 5], ["taxi", 4.5], ["uber", 4.5], ["celebrity", 5], ["lottery", 5], ["horoscope", 5], ["video game", 5], ["minecraft", 5], ["dinosaur", 4.5],
      ["planet", 4.5], ["moon", 4], ["holiday", 4], ["vacation", 4.5], ["salary", 4.5], ["girlfriend", 5], ["boyfriend", 5], ["meaning of life", 4], ["write code", 4], ["python", 4.5], ["javascript", 4.5], ["email my boss", 4],
      ["world cup", 5.5], ["everest", 5], ["mountain", 4.5], ["how tall", 4.5], ["guitar", 5], ["piano", 5], ["teach me", 3], ["dog", 4.5], ["cat", 4], ["pet", 4], ["hotel in", 5], ["rome", 4], ["paris", 4], ["london", 4]],
    next: [],
    say: [
      "That's outside what I know: I stick to the console's customers, requests, lots and curbs. Here's what I can help with:",
      "I can't help with that one, sorry. I'm the console's assistant: customers, requests and deployments. Try a topic:",
      "Not my area! I only know this console and its data. Pick a topic below:",
    ],
  },
];

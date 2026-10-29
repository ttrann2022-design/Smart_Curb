// Small talk, help, navigation (menu, more, repeat) and the fun side: jokes,
// facts, stories, a calculator, compliments and polite handling of rude or
// off-topic messages.
import { FACTS, JOKES, STORIES } from "../content.js";
import { formatNumber } from "../math.js";

function partOfDay(now) {
  const h = new Date(now).getHours();
  if (h < 5) return "Hello";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
const hiName = (ctx) => (ctx.firstName ? `, ${ctx.firstName}` : "");
const pick = (ctx, xs) => xs[Math.floor((ctx.random || Math.random)() * xs.length) % xs.length];

export const TALK_INTENTS = [
  {
    id: "greeting", group: "smalltalk", maxWords: 3,
    keys: [["hello", 3], ["good", 0.5], ["there", 0.3]],
    next: ["How many spots are free?", "What needs attention?", "What can you do?"],
    say: (ctx) => [
      `${partOfDay(ctx.now)}${hiName(ctx)}! What can I look up for you?`,
      `${partOfDay(ctx.now)}${hiName(ctx)}! Ask me about free spots, curbs, or how to do something here.`,
      `Hi${hiName(ctx)}! ${partOfDay(ctx.now)}. Want a quick summary of the lots?`,
      `Hey${hiName(ctx)}! Good to see you. What would you like to know?`,
    ],
  },
  {
    id: "thanks", group: "smalltalk", maxWords: 7,
    keys: [["thanks", 3], ["helpful", 1.5], ["much", 0.3]],
    next: ["How many spots are free?", "What needs attention?", "Tell me a joke"],
    say: ["You're welcome! Anything else?", "Any time. Happy to help.", "Glad that helped! What's next?", "My pleasure. Shout if you need anything else."],
  },
  {
    id: "who_are_you", group: "smalltalk",
    keys: [["who are you", 3.5], ["what are you", 3.5], ["your name", 3], ["are you ai", 3.5], ["chatgpt", 2.5], ["are you", 0.5], ["who made", 3], ["who built", 3], ["introduce", 2.5], ["able", -3], ["capable", -3], ["robot", -2], ["real", -1]],
    next: ["What can you do?", "Are you a robot?", "Tell me a joke"],
    say: [
      "I'm the Smart Wheel Stop Assistant. I answer from the dashboard's own data using fixed rules, not an AI service, and I only read: I never change anything.",
      "Smart Wheel Stop Assistant, at your service! I know the lots, the curbs and this dashboard inside out.",
      "I'm the dashboard's built-in assistant. I was written with hand-made rules, so I'm quick, private and read-only.",
      "The name's Smart Wheel Stop Assistant. Think of me as the friendly guide to your parking data.",
    ],
  },
  {
    id: "are_you_robot", group: "smalltalk",
    keys: [["robot", 3], ["bot", 3], ["human", 3], ["real person", 3.5], ["are you real", 3.5], ["machine", 2.5], ["alive", 2.5], ["computer", 3]],
    next: ["Who are you?", "What can you do?", "Tell me a joke"],
    say: [
      "I'm a program, not a person: a rule-based assistant with no AI service behind me. Friendly, though!",
      "Beep boop, yes. Well, a polite set of rules running in your browser.",
      "Not human, I'm afraid. I'm software that follows hand-written rules, and I'm pretty good at parking questions.",
      "A robot of sorts, without the metal. Just code, cheerfulness and a lot of parking facts.",
    ],
  },
  {
    id: "capabilities", group: "smalltalk",
    keys: [["what can you", 3.5], ["what do you do", 3.5], ["can you", 1], ["able", 1], ["able to", 2.5], ["capable", 3], ["what else", 2], ["you", 0.3], ["can you change", -3]],
    next: ["How many spots are free?", "How do I change an LED colour?", "Tell me a joke"],
    say: [
      "I can tell you how many spots are free, which lot is busiest, which curbs are offline or low on battery, and the status of any curb. I can explain the dashboard, read out Analytics history, and I know a few jokes. I never change anything.",
      "Lots of things: live status, history from Analytics, how-to steps, troubleshooting, a glossary, and some fun. Try the menu below.",
      "Ask me about spots, curbs, batteries, busy times, roles, LEDs, or how to do something. I can even do quick maths.",
    ],
  },
  {
    id: "goodbye", group: "smalltalk", maxWords: 6,
    keys: [["bye", 3], ["see you", 3], ["see ya", 3], ["thats all", 3], ["later", 1], ["good night", 3], ["have a good", 2.5]],
    next: ["How many spots are free?", "What needs attention?"],
    say: (ctx) => [`Bye for now${hiName(ctx)}!`, "See you soon. The curbs and I will be here.", "Take care! Come back any time.", `Goodbye${hiName(ctx)}. Have a great ${new Date(ctx.now).getHours() < 17 ? "day" : "evening"}!`],
  },
  {
    id: "how_are_you", group: "smalltalk", maxWords: 6,
    keys: [["how are you", 3.5], ["how is it going", 3], ["hows it going", 3], ["you doing", 2.5], ["whats up", 2.5], ["how have you been", 3.5]],
    next: ["How many spots are free?", "Give me a summary", "Tell me a joke"],
    say: ["All good, thanks! Want to know how the lots are doing?", "Doing great: every rule in working order. How about you?", "Very well, thanks for asking! Anything I can check for you?", "Fully charged, unlike a few curbs. What can I do for you?"],
  },
  {
    id: "okay", group: "smalltalk", maxWords: 3,
    keys: [["okay", 2.6], ["got it", 3], ["understood", 3], ["yes", 2.6], ["no", 2.6]],
    next: ["How many spots are free?", "What needs attention?", "Something else"],
    say: ["Okay! Ask me anything else about the lots or the dashboard.", "Great. What next?", "Sounds good. I'm here if you need me.", "Alright! Pick a topic below or type a question."],
  },
  {
    id: "help", group: "help",
    keys: [["help", 3], ["call", -3], ["essay", -3], ["homework", -3], ["who can help", -3], ["what can i ask", 4], ["example", 3], ["question", 1.5], ["can i ask", 3], ["command", 2.5], ["option", 1.5], ["topic", 2], ["how do i use", 2], ["stuck", -1], ["support", -1]],
    next: ["How many spots are free?", "How do I change an LED colour?", "What do the status colours mean?"],
    say: [
      "Here's what I can answer:\n• Status: free spots (total or in a lot), busiest lot, offline curbs, low batteries, what needs attention, a curb such as C-012\n• History: busiest hour and day, today vs yesterday, best time to park\n• How-to and fixes: LEDs, people and roles, Setup, Live and Simulation, why something isn't working\n• Explain: colours, roles, attention, offline, Analytics\n• Fun: jokes, facts, a story, quick maths",
      "Try asking about spots, curbs, batteries, busy times, LEDs, people and roles, or what something means. Follow-ups like \"and Lot 6?\" work too. Pick a topic below to start.",
      "I cover status, history, how-to, troubleshooting, a glossary and a bit of fun. Ask two things at once if you like: \"offline curbs and low batteries\".",
    ],
  },
  {
    id: "menu", group: "help",
    keys: [["something else", 4], ["main menu", 4], ["menu", 3], ["start over", 3.5], ["other topic", 3.5], ["back to menu", 4], ["topics", 2.5], ["home", 1]],
    next: [],
    say: ["Sure! What would you like to look at?", "No problem. Pick a topic:", "Here's the menu. What shall we do?", "Let's switch it up. Choose one:"],
  },
  {
    id: "more", group: "help", maxWords: 3,
    keys: [["more", 2.5], ["another one", 3], ["another", 2], ["show me more", 3.5], ["next page", 3.5], ["rest", 2], ["continue", 2.5], ["keep going", 3.5], ["next", 1.5], ["the others", 2.5]],
    next: ["Something else"],
    say: ["There's nothing more to show right now. Ask me for a list first, like offline curbs.", "I don't have a longer list going. Try \"which curbs are offline\".", "Nothing more on that one. What else can I find?"],
  },
  {
    id: "repeat", group: "help", maxWords: 7,
    keys: [["repeat", 3], ["what was that", 3.5], ["say that again", 4], ["again", 1.5], ["what did you say", 3.5], ["come again", 3.5], ["pardon", 3]],
    next: ["Something else"],
    say: ["I haven't said anything yet worth repeating! Ask me something.", "Nothing to repeat yet. What would you like to know?", "Let's start fresh: what can I help with?"],
  },

  // ---------- Fun ----------
  {
    id: "joke", group: "fun",
    keys: [["joke", 3.5], ["funny", 2.5], ["make me laugh", 4], ["pun", 3], ["another one", 1], ["humor", 3], ["humour", 3]],
    next: ["Tell me another joke", "Tell me a fun fact", "Something else"],
    say: JOKES,
  },
  {
    id: "fun_fact", group: "fun",
    keys: [["fact", 3.5], ["fun fact", 4], ["something new", 3], ["teach me", 2.5], ["did you know", 3.5], ["trivia", 3.5], ["interesting", 2.5], ["teach me", 2.5], ["something cool", 3]],
    next: ["Tell me another fun fact", "Tell me a joke", "Something else"],
    say: FACTS,
  },
  {
    id: "story", group: "fun",
    keys: [["story", 3.5], ["tell me a story", 4], ["once upon", 3.5], ["bedtime", 3], ["tale", 3]],
    next: ["Tell me a joke", "Tell me a fun fact", "Something else"],
    say: STORIES,
  },
  {
    id: "calculator", group: "fun",
    keys: [["calculate", 2], ["calculator", 3], ["math", 2], ["maths", 2], ["sum", 1.5], ["arithmetic", 3]],
    next: ["Tell me a fun fact", "How many spots are free?", "Something else"],
    say: (ctx, ent) => {
      const m = ent.math;
      if (!m) return ["I can do quick sums: try \"what is 17 x 23\" or \"15% of 80\".", "Give me a sum, like 144 / 12, and I'll work it out.", "Happy to calculate! Type something like \"12 times 7\"."];
      if (m.error === "zero") return [`${m.expr}: dividing by zero doesn't have an answer, even for me.`, "Dividing by zero? That one breaks the universe. Try another!", "No answer there: you can't divide by zero."];
      if (m.error === "big") return [`${m.expr} is too big for me to show nicely.`, "That number's enormous! Try something smaller.", "Too big to count, even for a parking assistant."];
      if (m.error) return [`I couldn't work out "${m.expr}". Try something like 17 x 23.`, "That sum confused me. Check the brackets and operators?", "I didn't follow that one. Write it like 120 / 4 + 3."];
      const v = formatNumber(m.value);
      return [`${m.expr} = ${v}`, `That's ${v}.`, `${m.expr} comes to ${v}.`, `The answer is ${v}.`];
    },
  },
  {
    id: "compliment_bot", group: "fun",
    keys: [["good job", 3.5], ["well done", 3.5], ["you are great", 3.5], ["you are awesome", 3.5], ["you are smart", 3.5], ["love you", 3], ["you rock", 3.5], ["best assistant", 3.5], ["clever", 2.5], ["amazing", 2], ["brilliant", 2], ["you are", 1]],
    next: ["Tell me a joke", "Give me a summary", "Something else"],
    say: ["Aw, thank you! You're making my LEDs glow.", "That's kind of you! I'll pass it on to the curbs.", "Thanks! I try my best, one rule at a time.", "You're too kind. Right back at you!"],
  },
  {
    id: "compliment_me", group: "fun",
    keys: [["say something nice", 4], ["compliment me", 4], ["cheer me up", 4], ["motivate me", 4], ["encourage", 3], ["i feel sad", 3.5], ["i am sad", 3.5], ["i am tired", 3], ["i am stressed", 3.5], ["bad day", 3.5], ["motivation", 3]],
    next: ["Tell me a joke", "Tell me a fun fact", "Something else"],
    say: (ctx) => [
      `You're doing a great job keeping this place running${hiName(ctx)}. Every free spot you help someone find saves them a stressful lap.`,
      "Hang in there! Even the busiest lot empties out by evening.",
      "You've got this. And if not, I've got jokes.",
      "Here's a fact: people who check the dashboard are excellent at their jobs. I've seen the data. (Okay, I made that up, but I believe it.)",
    ],
  },
  {
    id: "rude", group: "fun",
    keys: [["stupid", 3.5], ["dumb", 3.5], ["useless", 3.5], ["idiot", 3.5], ["hate you", 4], ["shut up", 4], ["you suck", 4], ["worst", 2.5], ["annoying", 3], ["rubbish", 3], ["terrible", 2.5], ["awful", 2.5], ["bad bot", 4]],
    next: ["Help", "What can you do?", "Something else"],
    say: [
      "Sorry I didn't hit the mark! Tell me what you were after and I'll try again.",
      "Ouch, but fair enough: I'm only a set of rules. Try rephrasing, or pick a topic below.",
      "I hear you. Let's get you what you need: what were you looking for?",
      "Sorry about that. I do best with questions about the lots, curbs and this dashboard.",
    ],
  },
  {
    id: "off_topic", group: "offtopic",
    keys: [["weather", 5], ["rain", 4], ["news", 4.5], ["sport", 4.5], ["football", 5], ["soccer", 5], ["basketball", 5], ["score", 3.5], ["movie", 4.5], ["film", 4.5], ["song", 4], ["music", 4.5], ["recipe", 5], ["cook", 4.5], ["homework", 5], ["essay", 4.5], ["poem", 4.5], ["stock", 4.5], ["bitcoin", 5], ["crypto", 5], ["politic", 5], ["election", 5], ["president", 5], ["capital of", 5], ["translate", 5], ["flight", 5], ["hotel", 4.5], ["pizza", 5], ["taxi", 4.5], ["uber", 4.5], ["celebrity", 5], ["lottery", 5], ["horoscope", 5], ["date me", 4.5], ["video game", 5], ["minecraft", 5], ["fortnite", 5], ["dinosaur", 4.5], ["planet", 4.5], ["moon", 4], ["book a", 4], ["order", 3], ["play", 3], ["meeting", 4]],
    next: [],
    say: [
      "That's outside my parking lot, I'm afraid! I'm best at spots, curbs and this dashboard.",
      "I'd love to help, but I only know about parking and this dashboard. Want to try one of these?",
      "Good question, wrong assistant! I stick to lots, curbs and the dashboard.",
      "I can't help with that one; my world is about four lots wide. Here's what I can do:",
    ],
  },
  {
    id: "age", group: "fun",
    keys: [["how old are you", 4], ["your age", 3.5], ["birthday", 3], ["when were you born", 4]],
    next: ["Who are you?", "Tell me a joke", "Something else"],
    say: ["I'm brand new: I was written for this dashboard in 2026.", "Young enough to still be learning, old enough to know every curb by name.", "Let's just say I'm a 2026 model."],
  },
  {
    id: "favourite", group: "fun",
    keys: [["favourite", 3], ["favorite", 3], ["do you like", 2.5], ["what do you like", 3]],
    next: ["Tell me a joke", "Tell me a fun fact", "Something else"],
    say: ["My favourite colour? Lime green: it means a free spot.", "I'm partial to a fully charged battery and an empty lot at 7 AM.", "Favourite thing: a curb that comes back online. Second favourite: puns.", "I like it when everything's green on the lot plan."],
  },
  {
    id: "sing", group: "fun",
    keys: [["sing", 3.5], ["song for me", 3.5], ["dance", 3], ["rap", 3], ["beatbox", 3.5]],
    next: ["Tell me a joke", "Tell me a story", "Something else"],
    say: ["🎵 Free spots, free spots, where can you be? Lot 6 has twelve, come park next to me! 🎵 (I'll stick to parking.)", "I'd sing, but my only instrument is an LED panel. Imagine it flashing green in rhythm.", "La la la... that's all I've got. My talents are mostly counting cars."],
  },
  {
    id: "bored", group: "fun",
    keys: [["bored", 3.5], ["boring", 3], ["nothing to do", 3.5], ["entertain me", 4], ["something fun", 3.5], ["play a game", 3.5]],
    next: ["Tell me a joke", "Tell me a fun fact", "Flip a coin"],
    say: ["Bored? I can tell a joke, share a fun fact, flip a coin or roll a die.", "Let's fix that: want a joke, a story, or a fun fact?", "How about a quick game? Say \"flip a coin\" or \"roll a die\"."],
  },
  {
    id: "where_live", group: "fun",
    keys: [["where do you live", 4], ["where are you", 3.5], ["your home", 3], ["where are you from", 4]],
    next: ["Who are you?", "Tell me a joke", "Something else"],
    say: ["I live right here in your browser. No servers, no network calls: just me and the curb data.", "In this tab, mostly. It's cosy.", "I'm part of the dashboard page itself, so wherever you open it, I'm there."],
  },
  {
    id: "meaning_of_life", group: "fun",
    keys: [["meaning of life", 4], ["purpose of life", 4], ["why are we here", 4], ["42", 1]],
    next: ["Tell me a joke", "Tell me a fun fact", "Something else"],
    say: ["To find a free spot close to the door. At least, that's my guess.", "Big question! Mine is helping people park. Yours is probably more interesting.", "I'm a parking assistant, so: always leave the spot better than you found it."],
  },
  {
    id: "laugh", group: "fun", maxWords: 4,
    keys: [["haha", 3.5], ["lol", 3.5], ["lmao", 3.5], ["hehe", 3.5], ["rofl", 3.5], ["thats funny", 3.5]],
    next: ["Tell me another joke", "Tell me a fun fact", "Something else"],
    say: ["Glad you liked it! Want another?", "😄 I've got plenty more where that came from.", "Ha! I'll be here all week. Literally.", "Thank you, thank you. Tip your curbs."],
  },
  {
    id: "sorry", group: "fun", maxWords: 6,
    keys: [["sorry", 3], ["my bad", 3.5], ["apologies", 3.5], ["oops", 3]],
    next: ["Help", "Something else"],
    say: ["No worries at all!", "Nothing to apologise for. What can I do?", "All good! Ask away.", "No harm done. What's next?"],
  },
  {
    id: "time_now", group: "fun",
    keys: [["what time", 3], ["what is time", 3.5], ["time is it", 4], ["current time", 3.5], ["tell me time", 3.5], ["the time", 2], ["clock", 2.5], ["least", -3], ["least busy", -3], ["avoid", -3], ["should", -3], ["meeting", -3], ["first time", -3], ["busiest", -3], ["best", -3], ["peak", -3], ["quiet", -3]],
    next: ["When is it busiest?", "What's today's date?", "Something else"],
    say: (ctx) => {
      const t = new Date(ctx.now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      return [`It's ${t}.`, `Right now it's ${t}.`, `The time is ${t}, by your device's clock.`];
    },
  },
  {
    id: "date_today", group: "fun",
    keys: [["what day", 3], ["what date", 3.5], ["todays date", 3.5], ["what is the date", 4], ["day is it", 3.5], ["day is today", 3.5], ["busiest", -3], ["quiet", -3]],
    next: ["Today vs yesterday?", "What time is it?", "Something else"],
    say: (ctx) => {
      const d = new Date(ctx.now).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
      return [`Today is ${d}.`, `It's ${d}.`, `${d}, by your device's calendar.`];
    },
  },
  {
    id: "coin_flip", group: "fun",
    keys: [["flip coin", 4], ["flip a coin", 4], ["coin", 3], ["heads or tails", 4], ["toss", 2.5]],
    next: ["Roll a die", "Tell me a joke", "Something else"],
    say: (ctx) => {
      const side = pick(ctx, ["Heads", "Tails"]);
      return [`${side}!`, `It landed on ${side.toLowerCase()}.`, `*flip* ... ${side}!`];
    },
  },
  {
    id: "dice", group: "fun",
    keys: [["roll die", 4], ["roll a die", 4], ["roll dice", 4], ["dice", 3.5], ["die", 1.5], ["random number", 3.5]],
    next: ["Flip a coin", "Tell me a joke", "Something else"],
    say: (ctx) => {
      const n = pick(ctx, [1, 2, 3, 4, 5, 6]);
      return [`You rolled a ${n}.`, `🎲 ${n}!`, `It's a ${n}.`];
    },
  },
  {
    id: "testing", group: "fun", maxWords: 4,
    keys: [["test", 3], ["testing", 3.5], ["is this working", 4], ["anyone there", 4], ["hello world", 4], ["ping", 3]],
    next: ["How many spots are free?", "What can you do?", "Something else"],
    say: ["Loud and clear! I'm working.", "Pong! Everything's running.", "Yes, I'm here and listening.", "Test received. All systems green."],
  },
  {
    id: "coffee", group: "fun",
    keys: [["coffee", 3.5], ["hungry", 3.5], ["lunch", 3], ["snack", 3], ["food", 2.5], ["thirsty", 3]],
    next: ["When is the best time to park?", "Tell me a joke", "Something else"],
    say: ["I run on electricity, not coffee, but I hope you get a good one!", "Go grab something! I'll keep an eye on the lots. (Read-only, of course.)", "Lunch break? Good plan. The busiest hour might be a good time to stay put, though."],
  },
  {
    id: "riddle", group: "fun",
    keys: [["riddle", 4], ["puzzle", 3.5], ["brain teaser", 4], ["quiz me", 3.5]],
    next: ["Tell me a joke", "Tell me a fun fact", "Something else"],
    say: [
      "Riddle: I have a light but no bulb, I sense but have no eyes, and I sit at the end of every space. What am I? (A smart curb!)",
      "What gets fuller the more cars leave? (The list of free spots!)",
      "I'm always waiting at the end of the row, and I stop everyone, politely. What am I? (A wheel stop!)",
    ],
  },
  {
    id: "smart", group: "fun",
    keys: [["are you smart", 4], ["can you learn", 4], ["do you learn", 4], ["do you think", 3], ["are you clever", 4], ["do you remember", 3]],
    next: ["Who are you?", "What can you do?", "Something else"],
    say: [
      "I don't learn on my own; I follow rules people wrote. I do remember the last lot and curb we talked about, so follow-ups work.",
      "Smart-ish! I match your words to topics and read the live data. No learning, no AI service.",
      "I'm clever within my lane: parking. I remember our last topic, but I don't learn new tricks by myself.",
    ],
  },
  {
    id: "language", group: "fun",
    keys: [["speak", 2.5], ["spanish", 3], ["french", 3], ["german", 3], ["language", 3], ["chinese", 3], ["hindi", 3], ["arabic", 3]],
    next: ["Help", "What can you do?", "Something else"],
    say: ["I only understand English for now, sorry!", "English is my one language at the moment.", "Just English, I'm afraid. Ask away in English and I'll do my best."],
  },
];

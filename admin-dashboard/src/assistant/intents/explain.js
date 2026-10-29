// Explain, glossary and tip intents: what things mean and how to get the most out of them.
import { alertsOf, ASK_MANAGER, roleText } from "../common.js";

const ROLE_LINES = {
  viewer: "Viewer: sees occupancy, battery and status, and can watch the simulation.",
  operator: "Operator: everything a viewer can, plus changing LED zone colours, panel text and brightness, and running the simulation.",
  manager: "Manager: everything an operator can, plus inviting people, changing roles, running Setup, putting curbs in lots, and changing alert thresholds and the theme.",
};
const MY_ROLE = {
  viewer: "You can see occupancy, battery and status, and watch the simulation, but not change LEDs, people or settings. If you need more, ask a manager: Users & roles lists who they are.",
  operator: "You can change LED zone colours, panel text and brightness, and run the simulation. Inviting people, roles, Setup and settings are for managers: Users & roles lists who they are.",
  manager: "You can do everything here: LEDs, the simulation, inviting people and changing roles, Setup, putting curbs in lots, alert thresholds and the theme.",
};

export const EXPLAIN_INTENTS = [
  {
    id: "explain_status_colors", group: "explain",
    keys: [["color", 1.5], ["status color", 2], ["mean", 2], ["what do", 1], ["legend", 3], ["key", 1], ["red", 1], ["green", 1], ["grey", 2], ["gray", 2], ["amber", 1], ["orange", 1], ["yellow", 1], ["x", 1], ["change", -2], ["what color", -1]],
    next: ["What does attention mean?", "What does offline mean?", "How do I change the theme?"],
    say: [
      "The curb colours are the same in every theme:\n• Lime green: free\n• Red-orange: occupied\n• Amber ring: needs attention, such as a low battery\n• Dark grey with an X: offline, so the spot isn't counted",
      "Quick colour key:\n• Green: free\n• Red-orange: taken\n• Amber ring: needs a look\n• Grey with an X: offline",
      "Green means free, red-orange means occupied, an amber ring flags a problem like a low battery, and grey with an X means the curb is offline. Themes never change these.",
    ],
  },
  {
    id: "explain_roles", group: "explain",
    keys: [["role", 2], ["user and role", 3], ["difference", 2.5], ["what can", 1.5], ["what is", 1], ["explain", 1.5], ["viewer", 1.5], ["operator", 1.5], ["manager", 1.5], ["each", 1], ["mean", 1], ["do", 0.3], ["change", -2], ["my role", -3], ["what can i", -3], ["am i", -3]],
    next: ["What can I do?", "How do I change someone's role?", "How do I add a user?"],
    say: (ctx) => {
      const you = `\n\nYou're ${roleText(ctx)}. Users & roles has the full table.`;
      return [
        `There are three roles:\n• ${ROLE_LINES.viewer}\n• ${ROLE_LINES.operator}\n• ${ROLE_LINES.manager}${you}`,
        `In short: viewers look, operators also control LEDs and the simulation, managers also handle people, Setup and settings.${you}`,
        `Three levels:\n• Viewer: read-only\n• Operator: + LEDs and simulation\n• Manager: + people, Setup, settings${you}`,
      ];
    },
  },
  {
    id: "explain_my_role", group: "explain",
    keys: [["my role", 3], ["what role do i", 3], ["do i have", 1.5], ["what can i do", 3.5], ["am i allowed", 3], ["am i", 2.5], ["can i", 1], ["allowed", 1.5], ["what am i", 2], ["who am i", 3], ["i", 0.3], ["simulation", -2], ["live", -2], ["cant", -2]],
    next: ["What can each role do?", "How do I change an LED colour?", "What can you do?"],
    say: (ctx) => (MY_ROLE[ctx.role]
      ? [`You're ${roleText(ctx)}. ${MY_ROLE[ctx.role]}`, `Your role: ${ctx.role}. ${MY_ROLE[ctx.role]}`, `You're signed in as ${roleText(ctx)}. ${MY_ROLE[ctx.role]}`]
      : [`I can't tell your role yet. ${ASK_MANAGER}`, "Your role hasn't loaded. Try reloading the page.", "I don't know your role yet; a manager can check it in Users & roles."]),
  },
  {
    id: "explain_attention", group: "explain",
    keys: [["attention", 2], ["what makes", 3], ["mean", 1.5], ["what does", 0.5], ["what is", 0.5], ["why", 1], ["what count", 2.5], ["explain", 1.5]],
    next: ["What needs attention?", "What does offline mean?", "What counts as low battery?"],
    say: (ctx) => {
      const a = alertsOf(ctx);
      return [
        `A curb needs attention when it's offline, when its battery is below ${a.lowBattery}%, or, if a manager turned it on, when it hasn't reported for ${a.staleMinutes} minutes (now ${a.staleEnabled ? "on" : "off"}). Overview lists them under Needs attention, and Curb units has a Needs attention filter.`,
        `"Needs attention" covers offline curbs, batteries under ${a.lowBattery}%, and (if enabled) curbs quiet for ${a.staleMinutes}+ minutes.`,
        `It's the dashboard's to-do list: offline curbs, low batteries (under ${a.lowBattery}%) and, when switched on, curbs that went quiet.`,
      ];
    },
  },
  {
    id: "explain_offline", group: "explain", curb: -3,
    keys: [["offline", 2], ["mean", 1.5], ["what does", 0.5], ["explain", 1.5], ["go offline", 1], ["definition", 1]],
    next: ["Which curbs are offline?", "Why is a curb offline?", "What is the Receiver?"],
    say: [
      "Offline means the Receiver isn't hearing from the curb, so its spot isn't counted as free or occupied.",
      "An offline curb has stopped talking to the Receiver. Its spot is left out of the counts until it's back.",
      "Offline = no signal from that curb. The dashboard can't tell if its spot is free, so it doesn't count it.",
    ],
  },
  {
    id: "explain_low_battery", group: "explain",
    keys: [["low battery", 2], ["battery", 0.5], ["mean", 1.5], ["what count", 2.5], ["what percent", 3], ["at what", 2], ["considered", 2.5], ["consider", 1.5], ["explain", 1]],
    next: ["Show low batteries", "How do I change the alert thresholds?", "What does attention mean?"],
    say: (ctx) => {
      const a = alertsOf(ctx);
      return [
        `A curb counts as low on battery below ${a.lowBattery}%. That threshold is shared by everyone; managers change it in Settings, under Alert thresholds.`,
        `Low battery means under ${a.lowBattery}%. Curbs that don't report a level show as Not measured and never count as low.`,
        `Anything below ${a.lowBattery}% is flagged as low. Managers can move that line in Settings.`,
      ];
    },
  },
  {
    id: "explain_stale", group: "explain",
    keys: [["stale", 2], ["mean", 1.5], ["what does", 0.5], ["what is", 0.5], ["explain", 1.5]],
    next: ["Which curbs have stopped reporting?", "What does offline mean?", "How do I change the alert thresholds?"],
    say: (ctx) => {
      const a = alertsOf(ctx);
      const state = `It's ${a.staleEnabled ? "on" : "off"} right now.`;
      return [
        `A stale curb is online but hasn't sent a reading for longer than ${a.staleMinutes} minutes. ${state} Curbs only report when their spot changes, so a quiet curb isn't necessarily broken.`,
        `Stale means "online, but silent for a while" (${a.staleMinutes}+ minutes). ${state}`,
        `It's a curb that's gone quiet without going offline. ${state} Managers set the time in Settings.`,
      ];
    },
  },
  {
    id: "explain_occupied", group: "explain",
    keys: [["know", 2], ["detect", 2.5], ["how does", 1], ["occupied", 1], ["sensor", 1], ["work", 1.5], ["curb", 0.5], ["how many", -2], ["working", -2]],
    next: ["What is the Receiver?", "How many spots are occupied?", "What do the status colours mean?"],
    say: [
      "Each curb has a sensor that notices a car over the spot. The curb tells the Receiver, which writes \"occupied\" to the database, and the dashboard shows it within a moment or two.",
      "The curb senses the car above it, radios the Receiver, and the Receiver updates the database. Your screen updates by itself.",
      "Sensor in the curb, signal to the Receiver, write to the database, and the dashboard updates. Usually in about a second.",
    ],
  },
  {
    id: "explain_simulation", group: "explain",
    keys: [["simulation", 2], ["demo", 1.5], ["point of", 2.5], ["what is", 1.5], ["mean", 1.5], ["what does", 0.5], ["explain", 1.5], ["why", 0.5], ["for", 0.3], ["start", -1], ["switch", -2]],
    next: ["How do I switch to Simulation?", "How do I run the simulation?", "Is this live data?"],
    say: (ctx) => {
      const now = ctx.mode === "sim" ? "You're in Simulation now." : "You're on Live now; switch under Data source at the bottom of the sidebar.";
      return [
        `Simulation is a separate set of fake curbs and lots for demos and testing. It lives apart from the real data, so nothing you do there touches the real site. ${now}`,
        `It's a practice copy of a site with pretend curbs. Great for demos and training. ${now}`,
        `Simulation runs made-up curbs so you can try things safely. Real data is never affected. ${now}`,
      ];
    },
  },
  {
    id: "explain_receiver", group: "explain",
    keys: [["receiver", 3], ["gateway", 3], ["hardware", 1.5], ["latency", -3], ["to firebase", -3]],
    next: ["What does the latency card show?", "How does it know a spot is taken?", "Why is a curb offline?"],
    say: [
      "The Receiver is the hardware gateway at the site. It hears every curb over radio and writes their readings (occupied, battery, last update) to the database the dashboard reads.",
      "Think of the Receiver as the curbs' translator: it listens to them over radio and posts what they say to the database.",
      "It's the box at the site that collects every curb's signal and sends it on to the dashboard's database.",
    ],
  },
  {
    id: "explain_free", group: "explain",
    keys: [["free", 2], ["mean", 1], ["what count", 2.5], ["what does", 0.5]],
    next: ["How many spots are free?", "What do the status colours mean?", "What does offline mean?"],
    say: [
      "A free spot is one whose curb is online and doesn't detect a car. Offline curbs don't count as free or occupied, because the dashboard can't tell.",
      "Free = the curb is online and no car is over it.",
      "We call a spot free when its curb is reporting and sees no car. Offline spots are left out.",
    ],
  },

  // ---------- Glossary ----------
  {
    id: "glossary_curb", group: "explain",
    keys: [["what is curb", 3.5], ["what is smart wheel stop", 4], ["smart wheel stop", 1.5], ["what are curb", 3.5], ["curb", 0.5], ["what is", 0.5], ["status", -2], ["how many", -2]],
    next: ["How does it know a spot is taken?", "What is the Receiver?", "What do the status colours mean?"],
    say: [
      "A curb, or smart wheel stop, is the block at the front of a parking space. Ours has a car sensor, an LED panel and a battery, and reports to the Receiver.",
      "It's the wheel stop at the end of each space, with a sensor, a light and a battery built in.",
      "Each curb is a smart wheel stop: it senses the car, shows a colour and short text, and runs on a battery.",
    ],
  },
  {
    id: "glossary_lot", group: "explain",
    keys: [["what is lot", 3.5], ["what is a lot", 3.5], ["what counts as lot", 3.5], ["lot mean", 3]],
    next: ["What lots are there?", "How do I add a lot?", "Free spots in each lot"],
    say: [
      "A lot is a parking area, like a surface lot or a garage level. Each curb belongs to one lot.",
      "Lots are the parking areas on your site. Curbs are grouped into them.",
      "A lot is any group of spaces you want counted together: a surface lot, a garage level, a row.",
    ],
  },
  {
    id: "glossary_panel", group: "explain",
    keys: [["what is panel", 3.5], ["what panel", 3], ["led panel", 2], ["panel mean", 3], ["what is led", 3], ["what is panel text", 3.5], ["panel", 0.5], ["how", -2], ["change", -2]],
    next: ["How do I change panel text?", "How do I change an LED colour?", "What are zone presets?"],
    say: [
      "The LED panel is the small light on each curb. It shows a zone colour and up to 16 characters of text, like a permit zone.",
      "Each curb has a little LED display: one colour plus short text, set by operators.",
      "It's the curb's light: colour for the zone, text for a short label (16 characters max).",
    ],
  },
  {
    id: "glossary_zone", group: "explain",
    keys: [["what is zone", 3.5], ["what zone", 3], ["zone mean", 3], ["zone color", 1.5], ["zone", 1], ["preset", -2], ["change", -2]],
    next: ["What are zone presets?", "How do I change an LED colour?", "What do the status colours mean?"],
    say: [
      "A zone is a group of spaces with the same purpose, like visitor or permit parking. Its colour shows on the curbs' LEDs.",
      "Zones mark what spaces are for: visitors, staff, permits. The LED colour tells drivers which is which.",
      "Zone = the purpose of a space, shown as the LED colour. Red, blue, green, gold or white.",
    ],
  },
  {
    id: "glossary_occupancy", group: "explain",
    keys: [["what is occupancy", 2], ["explain occupancy", 3.5], ["occupancy mean", 3.5], ["define occupancy", 3.5], ["occupancy rate mean", 3.5]],
    next: ["How full is the site?", "When is it busiest?", "How do I read Analytics?"],
    say: [
      "Occupancy is the share of reporting spots that have a car in them. 75% means three in four are taken.",
      "It's how full things are, as a percentage of spots whose curbs are reporting.",
      "Occupancy = occupied spots divided by reporting spots. Offline curbs are left out.",
    ],
  },
  {
    id: "glossary_database", group: "explain",
    keys: [["firebase", 3], ["database", 2.5], ["realtime", 2.5], ["cloud", 1.5], ["where is data stored", 3.5], ["stored", 1.5], ["to firebase", -3]],
    next: ["What is the Receiver?", "Is this live data?", "What does the latency card show?"],
    say: [
      "The data lives in a realtime database (Firebase). The Receiver writes to it, and every open dashboard updates the moment something changes.",
      "Firebase is the cloud database behind the dashboard. Changes appear on every screen without refreshing.",
      "Everything's stored in a realtime database in the cloud; that's why the screens update by themselves.",
    ],
  },
  {
    id: "glossary_heatmap", group: "explain",
    keys: [["heatmap", 2], ["latency", -3], ["what is heatmap", 4], ["heatmap mean", 3.5], ["darker", 2.5], ["brighter", 2.5], ["cell", 2]],
    next: ["When is it busiest?", "How do I read Analytics?", "What's the busiest day?"],
    say: [
      "The heatmap on Analytics is a grid of days by hours. Brighter red cells are fuller, darker ones emptier. Show as table gives the exact numbers.",
      "Each cell is one hour on one day; the brighter the red, the fuller the lots.",
      "Rows are days, columns are hours, colour is how full. Hover a cell (or use Show as table) for the number.",
    ],
  },
  {
    id: "glossary_threshold", group: "explain",
    keys: [["what is threshold", 4], ["threshold mean", 3.5], ["alert threshold mean", 3.5]],
    next: ["How do I change the alert thresholds?", "What counts as low battery?", "What does stale mean?"],
    say: (ctx) => {
      const a = alertsOf(ctx);
      return [
        `A threshold is the line where an alert starts. For batteries it's ${a.lowBattery}%: anything below that is flagged.`,
        `Thresholds decide what counts as a problem, like a battery under ${a.lowBattery}%.`,
        `It's the cut-off for alerts. Managers set them in Settings; low battery is ${a.lowBattery}% right now.`,
      ];
    },
  },
  {
    id: "glossary_snapshot", group: "explain",
    keys: [["camera", 3], ["snapshot", 3], ["photo", 2.5], ["picture", 2.5], ["video", 2.5]],
    next: ["What can each role do?", "What can you do?", "How does it know a spot is taken?"],
    say: [
      "Camera snapshots are planned but not available yet. The curbs sense cars; they don't film them.",
      "No camera views yet; it's on the roadmap. For now, curbs only sense whether a car is there.",
      "Snapshots are a planned feature. Today the system only knows free or occupied, not what the car looks like.",
    ],
  },
  {
    id: "glossary_overview", group: "explain",
    keys: [["overview page", 3.5], ["what is overview", 3.5], ["overview show", 3.5], ["home page", 2.5], ["front page", 2.5], ["dashboard show", 2.5]],
    next: ["What needs attention?", "How many spots are free?", "What do the status colours mean?"],
    say: [
      "Overview is the home page: the free-spot count, a plan of each lot with curb colours, and Needs attention for anything wrong.",
      "On Overview you'll see free spots, every lot drawn as a plan, and the Needs attention list.",
      "Overview = the big picture. Free count up top, lot plans in the middle, problems in Needs attention.",
    ],
  },
  {
    id: "glossary_lot_plan", group: "explain",
    keys: [["lot plan", 3.5], ["plan", 1.5], ["blocks", 2], ["squares", 3.5], ["color", -2], ["little boxes", 3], ["map", 1.5]],
    next: ["What do the status colours mean?", "Where should I park?", "Tell me about Lot 6"],
    say: [
      "The lot plan draws each curb as a block in rows, coloured by its state: green free, red-orange taken, grey with an X offline, amber ring for a problem.",
      "Each square on a lot plan is one curb. Its colour shows whether the spot's free, taken or offline.",
      "Lot plans are a bird's-eye sketch: one block per curb, coloured by status.",
    ],
  },
  {
    id: "glossary_dashboard", group: "explain",
    keys: [["what is this", 3], ["what is this dashboard", 4], ["what does this do", 3], ["what is smart curb", 3.5], ["purpose", 2.5], ["what for", 2], ["about this", 2.5]],
    next: ["What can you do?", "Give me a summary", "What can each role do?"],
    say: [
      "This is the Smart Wheel Stop dashboard: it shows which parking spots are free, which curbs need attention, and lets staff set the curbs' LEDs.",
      "It's the control room for your smart curbs: live free spots, curb health, LED settings and history.",
      "The dashboard turns curb readings into free-spot counts, alerts and trends, and lets operators set the LEDs.",
    ],
  },

  // ---------- Tips ----------
  {
    id: "tip_general", group: "explain",
    keys: [["tip", 3], ["advice", 3], ["trick", 3], ["pro tip", 3.5], ["suggestion", 2.5], ["best practice", 3], ["hint", 2.5]],
    next: ["Give me another tip", "What should I check every morning?", "How do I make batteries last?"],
    say: [
      "Tip: ask me \"give me a summary\" first thing; it covers free spots, problems and the busiest lot in one go.",
      "Tip: open the lot sign on a spare screen at the entrance. Drivers find spots faster and circle less.",
      "Tip: you can ask follow-ups. After \"tell me about Lot 6\", just say \"and Lot 14?\".",
      "Tip: Curb units' Needs attention filter is the quickest daily check.",
      "Tip: practise in Simulation before changing anything live. Nothing there touches the real site.",
    ],
  },
  {
    id: "tip_morning", group: "explain",
    keys: [["every morning", 3.5], ["first thing", 3.5], ["daily check", 3.5], ["checklist", 3], ["routine", 3], ["start of day", 3.5], ["start my shift", 3.5], ["what should i check", 3.5]],
    next: ["What needs attention?", "Give me a summary", "Show low batteries"],
    say: [
      "A good morning routine: check Needs attention, look at low batteries, then glance at which lot fills first.",
      "Start of shift: summary, offline curbs, low batteries. Three questions, about a minute.",
      "Each morning, ask me \"what needs attention\" and \"show low batteries\". Fix those and you're set.",
    ],
  },
  {
    id: "tip_events", group: "explain",
    keys: [["event", 2], ["big game", 3.5], ["concert", 3], ["graduation", 3], ["busy day ahead", 3.5], ["prepare", 2.5], ["rush", 1.5], ["crowd", 2.5]],
    next: ["When is it busiest?", "How do I change an LED colour?", "How do I open the lot sign?"],
    say: [
      "Before a big event: check batteries and offline curbs the day before, set clear zone colours, and put the lot sign on a screen at the entrance.",
      "Event prep: fix anything in Needs attention, set event zones on the LEDs, and open the lot sign for arriving drivers.",
      "For crowds: healthy curbs first (batteries, offline), then clear LED zones, then the entrance sign.",
    ],
  },
  {
    id: "tip_accessible_spots", group: "explain",
    keys: [["accessible", 2], ["disabled parking", 3.5], ["handicap", 3.5], ["wheelchair", 3.5], ["blue badge", 3.5], ["accessible spot", 3.5]],
    next: ["How do I change an LED colour?", "What are zone presets?", "Where should I park?"],
    say: [
      "For accessible spaces, give them their own zone colour (blue is common) and short panel text so they're easy to spot.",
      "Mark accessible spots with a dedicated LED zone and text like \"ACCESSIBLE\". Keep that colour for those spaces only.",
      "Use one zone colour just for accessible spaces, so drivers learn it at a glance.",
    ],
  },
];

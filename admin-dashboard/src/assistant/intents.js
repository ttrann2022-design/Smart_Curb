// Everything the assistant understands. Each intent has:
//   keys   [word or phrase, weight]: plain words, folded through the same synonyms
//          as the question (so "space" also matches "spot"). Negative weights push
//          a question away from this intent.
//   curb / lot  extra weight when the question names a curb (C-041) or a lot;
//          negative to step aside for an intent that uses it.
//   maxWords    only for short messages ("ok", "thanks").
//   next   follow-up suggestion chips, worded so they match an intent.
//   answer the function in answers.js that writes the reply.
import * as A from "./answers.js";

export const GROUPS = { status: "Status", howto: "How-to", explain: "Explain", smalltalk: "Small talk", help: "Help" };

export const INTENTS = [
  // ---------- Status ----------
  {
    id: "free_total", group: "status", lot: -3,
    keys: [["free", 2], ["spot", 1], ["how many", 1], ["how much", 1], ["total", 1.5], ["overall", 1.5], ["left", 1.5], ["park", 0.5], ["anywhere", 1], ["right now", 0.5], ["count", 0.5], ["what count", -3], ["tv", -2], ["sign", -2]],
    next: ["Free spots in each lot", "Where should I park?", "Which lot is busiest?"],
    answer: A.freeTotal,
  },
  {
    id: "free_lot", group: "status", lot: 3.5,
    keys: [["free", 2], ["spot", 1], ["how many", 1], ["left", 1], ["full", 1], ["busy", 1], ["room", 1]],
    next: ["Which lot is busiest?", "Free spots in each lot", "What needs attention?"],
    answer: A.freeInLot,
  },
  {
    id: "free_by_lot", group: "status",
    keys: [["free", 1.5], ["spot", 0.5], ["each", 2], ["per", 2], ["every lot", 2], ["by lot", 2], ["breakdown", 2.5], ["all lots", 1.5], ["lot by lot", 2]],
    next: ["Where should I park?", "Which lot is busiest?", "How full is the site?"],
    answer: A.freeByLot,
  },
  {
    id: "best_lot", group: "status",
    keys: [["where should", 2], ["park", 2], ["best", 2], ["most free", 2], ["most spot", 2], ["most room", 3], ["emptiest", 3], ["least busy", 4.5], ["least full", 4], ["quietest", 3], ["recommend", 3], ["suggest", 2.5], ["should i", 1.5], ["which lot should", 3]],
    next: ["Free spots in each lot", "Which lot is busiest?", "Which lots are full?"],
    answer: A.bestLot,
  },
  {
    id: "busiest_lot", group: "status",
    keys: [["busy", 3], ["most occupied", 3], ["most full", 3], ["fill up", 3], ["how busy", -2], ["least", -3], ["day", -3], ["hour", -3], ["lot", 0.5]],
    next: ["Where should I park?", "Which lots are full?", "How full is the site?"],
    answer: A.busiestLot,
  },
  {
    id: "full_lots", group: "status", lot: -2,
    keys: [["full", 2.5], ["any lot", 1], ["which lot", 0.5], ["no free", 3.5], ["completely", 1], ["how full", -3], ["least", -3]],
    next: ["Where should I park?", "Which lot is busiest?", "Free spots in each lot"],
    answer: A.fullLots,
  },
  {
    id: "occupancy_rate", group: "status",
    keys: [["occupancy", 3], ["how full", 3], ["how busy", 3], ["overall", 1], ["percent", 2.5], ["percentage", 2.5], ["rate", 1], ["utilisation", 3], ["utilization", 3], ["capacity", 2], ["site", 0.5], ["analytics", -2]],
    next: ["Which lot is busiest?", "How many spots are occupied?", "How do I read Analytics?"],
    answer: A.occupancyRate,
  },
  {
    id: "occupied_count", group: "status",
    keys: [["occupied", 2.5], ["how many", 1], ["car", 1.5], ["parked", 1.5], ["percent", -2], ["percentage", -2], ["know", -2], ["detect", -2], ["mean", -2]],
    next: ["How many spots are free?", "How full is the site?", "Which lot is busiest?"],
    answer: A.occupiedCount,
  },
  {
    id: "offline_curbs", group: "status", curb: -3,
    keys: [["offline", 3], ["not reporting", 3], ["lost connection", 3], ["down", 2.5], ["dead", 2.5], ["battery", -2], ["curb", 0.5], ["mean", -3], ["why", -1.5], ["explain", -3]],
    next: ["Show low batteries", "Which lot is busiest?", "What does offline mean?"],
    answer: A.offlineCurbs,
  },
  {
    id: "online_count", group: "status", curb: -3,
    keys: [["online", 3], ["reporting", 1.5], ["connected", 2], ["how many", 0.5], ["curb", 0.5], ["working", 2.5]],
    next: ["Which curbs are offline?", "When was the last update?", "What needs attention?"],
    answer: A.onlineCount,
  },
  {
    id: "low_battery", group: "status", curb: -3,
    keys: [["battery", 2], ["low", 2], ["below", 1.5], ["new battery", 2], ["dead", 1], ["replace", 1], ["need charge", 1.5], ["threshold", -3], ["change", -2], ["mean", -2], ["what count", -2], ["average", -2], ["consider", -2]],
    next: ["Which curbs are offline?", "What needs attention?", "How are the batteries overall?"],
    answer: A.lowBattery,
  },
  {
    id: "battery_overview", group: "status", curb: -3,
    keys: [["battery", 2], ["level", 1.5], ["average", 2], ["overall", 1.5], ["health", 1.5], ["how are", 1], ["low", -2], ["threshold", -3]],
    next: ["Show low batteries", "What needs attention?", "Which curbs are offline?"],
    answer: A.batteryOverview,
  },
  {
    id: "attention", group: "status",
    keys: [["attention", 3], ["anything", 0.5], ["need", 0.5], ["any", 0.5], ["fix", 2.5], ["look at", 2], ["should", 0.5], ["mean", -3], ["what count", -3]],
    next: ["Which curbs are offline?", "Show low batteries", "What does attention mean?"],
    answer: A.attention,
  },
  {
    id: "last_update", group: "status",
    keys: [["fresh", 3], ["last update", 3], ["last reading", 3], ["last heard", 3], ["when", 1], ["how old", 2], ["up to date", 3], ["data", 0.5], ["last", 1], ["simulation", -1.5]],
    next: ["Which curbs are offline?", "How many spots are free?", "Is this live data?"],
    answer: A.lastUpdate,
  },
  {
    id: "curb_status", group: "status", curb: 4,
    keys: [["status", 1], ["curb status", 2.5], ["status of curb", 3], ["how is", 1], ["check", 1], ["what about", 1], ["change", -3], ["offline", 0.5], ["battery", 0.5], ["occupied", 0.5], ["free", 0.5]],
    next: ["Which curbs are offline?", "Show low batteries", "What needs attention?"],
    answer: A.curbStatus,
  },
  {
    id: "curb_location", group: "status", curb: 4,
    keys: [["where is", 2], ["which lot", 1.5], ["located", 2], ["location", 2], ["find", 1], ["curb", 0.3], ["change", -3]],
    next: ["Free spots in each lot", "Which curbs are offline?", "What needs attention?"],
    answer: A.curbLocation,
  },
  {
    id: "curb_led", group: "status", curb: 4,
    keys: [["led", 2], ["showing", 1.5], ["display", 1], ["color", 1], ["text", 0.5], ["change", -3], ["how", -1]],
    next: ["How do I change an LED colour?", "What needs attention?", "Which curbs are offline?"],
    answer: A.curbLed,
  },
  {
    id: "lot_list", group: "status", lot: -2,
    keys: [["what lot", 3], ["which lot", 1.5], ["list", 2], ["how many lot", 3.5], ["all lot", 2], ["lot name", 3], ["lot", 1], ["have", 0.5], ["free", -2], ["busy", -2], ["full", -2]],
    next: ["Free spots in each lot", "How many curbs are there?", "Which lot is busiest?"],
    answer: A.lotList,
  },
  {
    id: "curb_count", group: "status",
    keys: [["how many curb", 3.5], ["number of curb", 3.5], ["curb", 1], ["installed", 2], ["count", 1], ["total", 0.5], ["offline", -2], ["online", -2], ["free", -2], ["working", -2]],
    next: ["Which curbs are offline?", "Which curbs aren't in a lot?", "What needs attention?"],
    answer: A.curbCount,
  },
  {
    id: "unassigned_curbs", group: "status",
    keys: [["unassigned", 3], ["not in lot", 3], ["arent in lot", 3], ["isnt in lot", 3], ["without lot", 3], ["no lot", 2.5], ["new curb", 2], ["curb", 0.5], ["how", -1]],
    next: ["How do I put a curb in a lot?", "How many curbs are there?", "Which curbs are offline?"],
    answer: A.unassignedCurbs,
  },
  {
    id: "stale_curbs", group: "status",
    keys: [["stale", 3], ["stopped reporting", 3], ["havent reported", 3], ["not reported", 3], ["not heard", 3], ["curb", 0.5], ["mean", -3], ["what is", -1.5], ["what does", -1.5]],
    next: ["Which curbs are offline?", "What does stale mean?", "When was the last update?"],
    answer: A.staleCurbs,
  },
  {
    id: "data_mode_now", group: "status",
    keys: [["which mode", 3], ["what mode", 3], ["mode", 1], ["data source", 3], ["come from", 2.5], ["is this live", 3.5], ["live data", 2], ["is this simulation", 3.5], ["am i", 1], ["switch", -2.5], ["how", -1], ["back", -2]],
    next: ["How do I switch to Simulation?", "What is Simulation?", "When was the last update?"],
    answer: A.dataModeNow,
  },

  // ---------- How-to ----------
  {
    id: "howto_led_color", group: "howto",
    keys: [["color", 2.5], ["led", 1], ["change", 1.5], ["how", 0.5], ["make", 1], ["zone", 1], ["red", 0.5], ["blue", 0.5], ["green", 0.5], ["mean", -2.5], ["status color", -2]],
    next: ["How do I change panel text?", "How do I change brightness?", "What are zone presets?"],
    answer: A.howtoLedColor,
  },
  {
    id: "howto_panel_text", group: "howto",
    keys: [["text", 2.5], ["panel", 1.5], ["message", 1.5], ["change", 1.5], ["write", 1], ["how", 0.5], ["led", 0.5]],
    next: ["How do I change an LED colour?", "How do I change brightness?", "What can I do?"],
    answer: A.howtoPanelText,
  },
  {
    id: "howto_brightness", group: "howto",
    keys: [["brightness", 3], ["change", 1], ["led", 0.5], ["how", 0.5], ["turn", 0.5]],
    next: ["How do I change an LED colour?", "How do I change panel text?", "What can I do?"],
    answer: A.howtoBrightness,
  },
  {
    id: "howto_zone_presets", group: "howto",
    keys: [["preset", 3], ["zone", 1.5], ["what", 0.3], ["use", 0.5]],
    next: ["How do I change an LED colour?", "How do I run Setup?", "What are modules?"],
    answer: A.howtoZonePresets,
  },
  {
    id: "howto_invite_user", group: "howto",
    keys: [["add", 2], ["user", 1.5], ["new user", 2.5], ["signup link", 2.5], ["give", 1], ["give user role", 3], ["role", -1], ["lot", -3], ["curb", -2]],
    next: ["How do I change someone's role?", "What can each role do?", "How do I remove a user?"],
    answer: A.howtoInviteUser,
  },
  {
    id: "howto_change_role", group: "howto",
    keys: [["role", 2], ["change", 1.5], ["promote", 3], ["demote", 3], ["make", 1], ["give", 0.5], ["upgrade", 2], ["user", 0.5], ["operator", 1], ["manager", 1], ["viewer", 0.5], ["what", -0.5], ["difference", -3], ["my role", -2]],
    next: ["What can each role do?", "How do I add a user?", "What can I do?"],
    answer: A.howtoChangeRole,
  },
  {
    id: "howto_remove_user", group: "howto",
    keys: [["remove", 2.5], ["revoke", 3], ["user", 1], ["disable", 1.5], ["get rid", 2], ["lot", -2]],
    next: ["How do I add a user?", "How do I change someone's role?", "What can each role do?"],
    answer: A.howtoRemoveUser,
  },
  {
    id: "howto_setup", group: "howto",
    keys: [["setup", 3], ["run", 1], ["reopen", 2], ["redo", 2], ["how", 0.5], ["start", 0.5], ["facility type", 2.5], ["site name", 2]],
    next: ["How do I put a curb in a lot?", "What are zone presets?", "What are modules?"],
    answer: A.howtoSetup,
  },
  {
    id: "howto_switch_mode", group: "howto",
    keys: [["switch", 2], ["toggle", 2], ["live", 1.5], ["simulation", 1.5], ["mode", 1], ["go to", 1.5], ["go back", 2], ["change", 0.5], ["back", 0.5], ["what is", -2], ["mean", -2]],
    next: ["What is Simulation?", "Is this live data?", "How do I run the simulation?"],
    answer: A.howtoSwitchMode,
  },
  {
    id: "howto_analytics", group: "howto",
    keys: [["analytics", 3], ["read", 1], ["understand", 1], ["how", 0.5], ["peak hour", 2.5], ["busiest day", 3], ["busy day", 3], ["what", 0.3], ["latency", -3]],
    next: ["What does the latency card show?", "How full is the site?", "Which lot is busiest?"],
    answer: A.howtoAnalytics,
  },
  {
    id: "explain_latency", group: "howto",
    keys: [["latency", 3], ["event age", 3], ["receiver to firebase", 3], ["millisecond", 2], ["ms", 1], ["card", 0.5]],
    next: ["How do I read Analytics?", "What is the Receiver?", "When was the last update?"],
    answer: A.explainLatency,
  },
  {
    id: "howto_thresholds", group: "howto",
    keys: [["threshold", 3], ["attention", 0.5], ["low battery", 1], ["change", 1], ["limit", 1.5], ["below", 1], ["stale", 0.5]],
    next: ["What counts as low battery?", "What does attention mean?", "Show low batteries"],
    answer: A.howtoThresholds,
  },
  {
    id: "howto_theme", group: "howto",
    keys: [["theme", 3], ["change", 1], ["look", 2], ["color", 0.5], ["status", -1]],
    next: ["What do the status colours mean?", "What can I do?", "How do I run Setup?"],
    answer: A.howtoTheme,
  },
  {
    id: "howto_password", group: "howto",
    keys: [["password", 3], ["change", 0.5], ["reset", 1], ["forgot", 1.5]],
    next: ["How do I sign out?", "What can I do?", "What can you do?"],
    answer: A.howtoPassword,
  },
  {
    id: "howto_assign_curb", group: "howto",
    keys: [["curb", 1], ["assign", 2.5], ["put", 1.5], ["move", 1.5], ["connect", 2.5], ["into lot", 2], ["in lot", 1.5], ["to lot", 1.5], ["lot", 0.5], ["which", -1], ["where is", -2]],
    next: ["Which curbs aren't in a lot?", "How do I run Setup?", "How many curbs are there?"],
    answer: A.howtoAssignCurb,
  },
  {
    id: "howto_find_curb", group: "howto", curb: -3,
    keys: [["find", 2], ["filter", 2], ["look up", 2], ["curb", 1], ["how", 0.5], ["specific", 1]],
    next: ["Which curbs are offline?", "What needs attention?", "Show low batteries"],
    answer: A.howtoFindCurb,
  },
  {
    id: "howto_lot_sign", group: "howto",
    keys: [["sign", 3], ["entrance", 3], ["tv", 3.5], ["screen", 1.5], ["display", 1], ["open", 0.5], ["kiosk", 2.5]],
    next: ["How many spots are free?", "How do I switch to Simulation?", "What can you do?"],
    answer: A.howtoLotSign,
  },
  {
    id: "howto_run_simulation", group: "howto",
    keys: [["simulation", 1.5], ["start", 2], ["stop", 2], ["run", 1.5], ["scenario", 2.5], ["rush hour", 3], ["reset", 1.5], ["load", 2], ["pause", 2], ["what is", -2], ["switch", -1.5]],
    next: ["What is Simulation?", "How do I switch to Live?", "Which curbs are offline?"],
    answer: A.howtoRunSimulation,
  },
  {
    id: "howto_sign_out", group: "howto",
    keys: [["signout", 3.5], ["exit", 1], ["leave", 1]],
    next: ["How do I change my password?", "What can I do?", "What can you do?"],
    answer: A.howtoSignOut,
  },
  {
    id: "howto_modules", group: "howto",
    keys: [["module", 3], ["sidebar", 1], ["feature", 1.5], ["permit", 1], ["event mode", 2]],
    next: ["How do I run Setup?", "What are zone presets?", "What can you do?"],
    answer: A.howtoModules,
  },
  {
    id: "howto_add_lot", group: "howto",
    keys: [["add lot", 3.5], ["new lot", 3.5], ["create lot", 3.5], ["lot", 0.5], ["add", 0.5], ["curb", -2], ["user", -2]],
    next: ["How do I put a curb in a lot?", "What lots are there?", "How do I run Setup?"],
    answer: A.howtoAddLot,
  },

  // ---------- Explain ----------
  {
    id: "explain_status_colors", group: "explain",
    keys: [["color", 1.5], ["status color", 2], ["mean", 2], ["what do", 1], ["legend", 3], ["key", 1], ["red", 1], ["green", 1], ["grey", 2], ["gray", 2], ["amber", 1], ["orange", 1], ["x", 1], ["change", -2]],
    next: ["What does attention mean?", "What does offline mean?", "How do I change the theme?"],
    answer: A.explainStatusColors,
  },
  {
    id: "explain_roles", group: "explain",
    keys: [["role", 2], ["difference", 2.5], ["what can", 1.5], ["what is", 1], ["explain", 1.5], ["viewer", 1.5], ["operator", 1.5], ["manager", 1.5], ["each", 1], ["mean", 1], ["do", 0.3], ["change", -2], ["my role", -3], ["what can i", -3]],
    next: ["What can I do?", "How do I change someone's role?", "How do I add a user?"],
    answer: A.explainRoles,
  },
  {
    id: "explain_my_role", group: "explain",
    keys: [["my role", 3], ["what role do i", 3], ["do i have", 1.5], ["what can i do", 3.5], ["am i allowed", 3], ["am i", 2.5], ["can i", 1], ["allowed", 1.5], ["what am i", 2], ["who am i", 3], ["i", 0.3], ["simulation", -2], ["live", -2]],
    next: ["What can each role do?", "How do I change an LED colour?", "What can you do?"],
    answer: A.explainMyRole,
  },
  {
    id: "explain_attention", group: "explain",
    keys: [["attention", 2], ["mean", 1.5], ["what does", 0.5], ["what is", 0.5], ["why", 1], ["what count", 2.5], ["explain", 1.5]],
    next: ["What needs attention?", "What does offline mean?", "What counts as low battery?"],
    answer: A.explainAttention,
  },
  {
    id: "explain_offline", group: "explain", curb: -3,
    keys: [["offline", 2], ["mean", 1.5], ["what does", 0.5], ["why", 1.5], ["explain", 1.5], ["cause", 1.5], ["go offline", 1]],
    next: ["Which curbs are offline?", "What does stale mean?", "What is the Receiver?"],
    answer: A.explainOffline,
  },
  {
    id: "explain_low_battery", group: "explain",
    keys: [["low battery", 2], ["battery", 0.5], ["mean", 1.5], ["what count", 2.5], ["consider", 1.5], ["explain", 1]],
    next: ["Show low batteries", "How do I change the alert thresholds?", "What does attention mean?"],
    answer: A.explainLowBattery,
  },
  {
    id: "explain_stale", group: "explain",
    keys: [["stale", 2], ["mean", 1.5], ["what does", 0.5], ["what is", 0.5], ["explain", 1.5]],
    next: ["Which curbs have stopped reporting?", "What does offline mean?", "How do I change the alert thresholds?"],
    answer: A.explainStale,
  },
  {
    id: "explain_occupied", group: "explain",
    keys: [["know", 2], ["detect", 2.5], ["how does", 1], ["occupied", 1], ["sensor", 1], ["work", 1.5], ["curb", 0.5], ["how many", -2]],
    next: ["What is the Receiver?", "How many spots are occupied?", "What do the status colours mean?"],
    answer: A.explainOccupied,
  },
  {
    id: "explain_simulation", group: "explain",
    keys: [["simulation", 2], ["what is", 1.5], ["mean", 1.5], ["what does", 0.5], ["explain", 1.5], ["why", 0.5], ["for", 0.3]],
    next: ["How do I switch to Simulation?", "How do I run the simulation?", "Is this live data?"],
    answer: A.explainSimulation,
  },
  {
    id: "explain_receiver", group: "explain",
    keys: [["receiver", 3], ["gateway", 3], ["hardware", 1.5], ["latency", -3]],
    next: ["What does the latency card show?", "How does it know a spot is taken?", "What does offline mean?"],
    answer: A.explainReceiver,
  },
  {
    id: "explain_free", group: "explain",
    keys: [["free", 2], ["mean", 1], ["what count", 2.5], ["what does", 0.5]],
    next: ["How many spots are free?", "What do the status colours mean?", "What does offline mean?"],
    answer: A.explainFree,
  },

  // ---------- Small talk ----------
  {
    id: "greeting", group: "smalltalk", maxWords: 3,
    keys: [["hello", 3], ["good", 0.5], ["there", 0.3]],
    next: ["How many spots are free?", "What needs attention?", "What can you do?"],
    answer: A.greeting,
  },
  {
    id: "thanks", group: "smalltalk", maxWords: 6,
    keys: [["thanks", 3], ["helpful", 1.5], ["much", 0.3]],
    next: ["How many spots are free?", "What needs attention?", "What can you do?"],
    answer: A.thanks,
  },
  {
    id: "who_are_you", group: "smalltalk",
    keys: [["who are you", 3.5], ["what are you", 3.5], ["your name", 3], ["are you ai", 3.5], ["bot", 3], ["are you", 1], ["chatgpt", 2.5], ["robot", 2], ["human", 2], ["real person", 3], ["who made", 3], ["who built", 3], ["able", -3]],
    next: ["What can you do?", "How many spots are free?", "Help"],
    answer: A.whoAreYou,
  },
  {
    id: "capabilities", group: "smalltalk",
    keys: [["what can you", 3.5], ["what do you do", 3.5], ["can you", 1], ["able", 1], ["able to", 2.5], ["what else", 2], ["you", 0.3]],
    next: ["How many spots are free?", "How do I change an LED colour?", "What do the status colours mean?"],
    answer: A.capabilities,
  },
  {
    id: "goodbye", group: "smalltalk", maxWords: 6,
    keys: [["bye", 3], ["see you", 3], ["thats all", 3], ["later", 1]],
    next: ["How many spots are free?", "What needs attention?"],
    answer: A.goodbye,
  },
  {
    id: "how_are_you", group: "smalltalk", maxWords: 6,
    keys: [["how are you", 3.5], ["how is it going", 3], ["hows it going", 3], ["you doing", 2.5], ["whats up", 2.5]],
    next: ["How many spots are free?", "What needs attention?", "What can you do?"],
    answer: A.howAreYou,
  },
  {
    id: "okay", group: "smalltalk", maxWords: 3,
    keys: [["okay", 2.6], ["got it", 3], ["understood", 3], ["yes", 2.6], ["no", 2.6]],
    next: ["How many spots are free?", "What needs attention?", "Help"],
    answer: A.okay,
  },

  // ---------- Help ----------
  {
    id: "help", group: "help",
    keys: [["help", 3], ["what can i ask", 4], ["example", 3], ["question", 1.5], ["can i ask", 3], ["command", 2.5], ["menu", 2], ["option", 1.5], ["topic", 2], ["how do i use", 2]],
    next: ["How many spots are free?", "How do I change an LED colour?", "What do the status colours mean?"],
    answer: A.help,
  },
];

// Shown with the fallback, and before the first question.
export const START_CHIPS = ["How many spots are free?", "Which curbs are offline?", "How do I change an LED colour?", "What can you do?"];
export const FALLBACK_CHIPS = ["Help", ...START_CHIPS];

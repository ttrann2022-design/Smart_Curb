// How-to and troubleshooting intents: where things are in the dashboard and who
// can do them. Role notes come from common.js.
import { alertsOf, ASK_MANAGER, canOperate, isManager, needManager, needOperator, roleText } from "../common.js";

const note = (variants, extra) => variants.map((v) => v + extra);
const LOT_PATH = "Open Parking lots, pick the lot, then pick a curb.";

export const HOWTO_INTENTS = [
  {
    id: "howto_led_color", group: "howto",
    keys: [["led help", 4], ["set", 1], ["to red", 2], ["to blue", 2], ["to green", 2], ["to gold", 2], ["to white", 2], ["color", 2.5], ["led", 1], ["change", 1.5], ["how", 0.5], ["make", 1], ["zone", 1], ["red", 0.5], ["blue", 0.5], ["green", 0.5], ["mean", -2.5], ["status color", -2], ["why", -2], ["all led", -2], ["theme", -2], ["bulk", -3], ["at once", -3], ["every curb", -3], ["what zone", -2], ["what are led", -3]],
    next: ["How do I change panel text?", "How do I change brightness?", "What are zone presets?"],
    say: (ctx) => note([
      `${LOT_PATH} Under LED panel control, choose a Zone colour (red, blue, green, gold or white) or a Zone preset, then press Apply changes. Colour and panel text save together.`,
      "Easy: Parking lots, then the lot, then the curb. In LED panel control, pick a Zone colour and press Apply changes.",
      "Head to Parking lots and select the curb. Pick one of the five zone colours (or a preset) under LED panel control and hit Apply changes.",
    ], needOperator(ctx, "LED settings")),
  },
  {
    id: "howto_panel_text", group: "howto",
    keys: [["text", 2.5], ["panel", 1.5], ["message", 1.5], ["change", 1.5], ["write", 1], ["how", 0.5], ["led", 0.5], ["why", -2], ["not changing", -3], ["still", -3], ["bigger", -3], ["what", -1]],
    next: ["How do I change an LED colour?", "How do I change brightness?", "Why isn't the panel changing?"],
    say: (ctx) => note([
      `${LOT_PATH} Under LED panel control, type in Panel text (up to 16 characters), then press Apply changes.`,
      "Pick the curb in Parking lots, type up to 16 characters in Panel text, and press Apply changes.",
      "In Parking lots, select the curb; the Panel text box is under LED panel control. Keep it to 16 characters and Apply.",
    ], needOperator(ctx, "the panel text")),
  },
  {
    id: "howto_brightness", group: "howto",
    keys: [["brightness", 3], ["change", 1], ["led", 0.5], ["how", 0.5], ["turn", 0.5], ["all", -1]],
    next: ["How do I change an LED colour?", "How do I change panel text?", "Can I change all LEDs at once?"],
    say: (ctx) => note([
      `${LOT_PATH} Under LED panel control, drag the Brightness slider (0 to 100%). It saves when you let go.`,
      "Select the curb in Parking lots and drag the Brightness slider. No Apply button needed: it saves when you let go.",
      "Brightness lives under LED panel control for each curb (Parking lots, then the curb). Drag, release, done.",
    ], needOperator(ctx, "the brightness")),
  },
  {
    id: "howto_led_all", group: "howto",
    keys: [["all led", 3], ["update all", 3], ["every curb", 2.5], ["at once", 3], ["together", 2.5], ["bulk", 3], ["all curb", 2], ["whole lot", 2], ["same time", 2.5], ["change", 1]],
    next: ["How do I change an LED colour?", "What are zone presets?", "How do I change brightness?"],
    say: (ctx) => note([
      "There's no bulk change yet: LEDs are set one curb at a time in Parking lots. Zone presets make each one quick.",
      "One curb at a time, I'm afraid. Pick each curb in Parking lots; a Zone preset gets colour and text in one click.",
      "The dashboard doesn't change every curb at once yet. Do them one by one under LED panel control.",
    ], needOperator(ctx, "LED settings")),
  },
  {
    id: "howto_zone_presets", group: "howto",
    keys: [["preset", 3], ["zone", 1.5], ["what", 0.3], ["use", 0.5], ["edit", 0.5]],
    next: ["How do I change an LED colour?", "How do I run Setup?", "What are modules?"],
    say: (ctx) => note([
      "Zone presets are ready-made colour and text pairs that fit your facility type, for example permit zones on a campus. Pick one under Parking lots, LED panel control, then press Apply changes.",
      "Presets are shortcuts: one click sets a zone colour and its panel text together. They come from the facility type chosen in Setup.",
      "A zone preset fills in colour and text for you. Operators can still set anything by hand; managers change the preset list by changing the facility type in Setup.",
    ], needOperator(ctx, "the presets")),
  },
  {
    id: "howto_invite_user", group: "howto",
    keys: [["add", 2], ["invite", 2], ["for user", 2.5], ["user", 1.5], ["get in", -2], ["new user", 2.5], ["sent", -2], ["pending", -3], ["signup link", 2.5], ["send signup link", 3.5], ["give", 1], ["give user role", 3], ["role", -1], ["lot", -3], ["curb", -2], ["why", -2], ["not working", -3]],
    next: ["How do I change someone's role?", "What can each role do?", "How do I remove a user?"],
    say: (ctx) => note([
      "Open Users & roles. Under Invite someone, enter their email, pick a role and press Send invite. The dashboard doesn't email anyone: copy their sign-up link and send it yourself. They show under Pending invites until they create their account.",
      "Go to Users & roles, fill in Invite someone with their email and a role, and press Send invite. Then copy the sign-up link and send it to them yourself.",
      "Inviting is in Users & roles: email, role, Send invite. They'll appear under Pending invites; share the sign-up link with them directly.",
    ], needManager(ctx, "invite people")),
  },
  {
    id: "howto_change_role", group: "howto",
    keys: [["role", 2], ["change", 1.5], ["promote", 3], ["demote", 3], ["make", 1.5], ["give", 0.5], ["upgrade", 2], ["user", 0.5], ["operator", 1], ["manager", 1], ["viewer", 0.5], ["what", -0.5], ["difference", -3], ["my role", -2], ["am i", -2]],
    next: ["What can each role do?", "How do I add a user?", "What can I do?"],
    say: (ctx) => note([
      "Open Users & roles and find the person under People. Pick their new role and confirm. You can't remove your own manager access; another manager has to do that.",
      "In Users & roles, choose a new role next to their name under People, then confirm.",
      "Roles change in Users & roles, under People: pick the role, confirm, done. Managers can't demote themselves.",
    ], needManager(ctx, "change roles")),
  },
  {
    id: "howto_remove_user", group: "howto",
    keys: [["remove", 2.5], ["revoke", 3], ["take away", 3], ["user", 1], ["disable", 1.5], ["get rid", 2], ["lot", -2], ["curb", -2]],
    next: ["How do I add a user?", "How do I change someone's role?", "What can each role do?"],
    say: (ctx) => note([
      "In Users & roles you can revoke an invite that hasn't been used yet, under Pending invites. Accounts that already exist can't be deleted from the dashboard yet: set them to Viewer to limit what they can do, and contact Smart Wheel Stop to remove the account.",
      "Unused invites can be revoked under Pending invites. For an existing account, set it to Viewer and ask Smart Wheel Stop to remove it.",
      "You can revoke pending invites in Users & roles. Deleting a real account isn't in the dashboard yet; Viewer is the most limited role in the meantime.",
    ], needManager(ctx, "manage people")),
  },
  {
    id: "howto_pending_invites", group: "howto",
    keys: [["pending", 3], ["waiting", 2.5], ["invite list", 3], ["who invited", 3], ["invited", 3], ["invites", 2], ["sent", 1.5], ["ive sent", 2.5], ["outstanding", 2.5], ["sent invite", 2.5]],
    next: ["How do I add a user?", "How do I remove a user?", "Why isn't the sign-up link working?"],
    say: (ctx) => note([
      "Pending invites are listed in Users & roles, under Pending invites, until the person creates their account.",
      "Check Users & roles: anyone invited but not signed up yet shows under Pending invites.",
      "Users & roles has a Pending invites list. You can copy someone's sign-up link or revoke the invite there.",
    ], needManager(ctx, "manage invites")),
  },
  {
    id: "howto_signup", group: "howto",
    keys: [["create account", 2], ["how do i create", 2], ["people create", 2.5], ["create my account", 3.5], ["for user", -2.5], ["join", 3], ["get in", 3], ["new account", 1.5], ["signup", 2.5], ["register", 2], ["how do people", 2], ["first time", 3], ["not working", -3]],
    next: ["How do I add a user?", "Why isn't the sign-up link working?", "What can each role do?"],
    say: [
      "New staff need an invite from a manager. They open the sign-up link the manager sends them, set a password, and they're in with the role on the invite.",
      "First a manager invites them in Users & roles, then they use the sign-up link to create their account.",
      "Accounts start with an invite: manager invites, person opens the sign-up link, picks a password. Done.",
    ],
  },
  {
    id: "howto_setup", group: "howto",
    keys: [["setup", 3], ["run", 1], ["reopen", 2], ["redo", 2], ["how", 0.5], ["start", 0.5], ["facility type", 2.5], ["site name", 2]],
    next: ["How do I put a curb in a lot?", "What are zone presets?", "What are modules?"],
    say: (ctx) => note([
      "Open Settings and press Reopen setup under Site setup. Setup has three steps: the site's name and contact, the facility type (which picks the LED zone presets), and Connect curbs, where curbs that have reported get put in their lots.",
      "Settings, then Reopen setup. You'll go through site details, facility type and Connect curbs.",
      "Setup reopens from Settings (Site setup, Reopen setup). It's three short steps.",
    ], needManager(ctx, "run Setup")),
  },
  {
    id: "howto_site_details", group: "howto",
    keys: [["site name", 3], ["rename site", 3.5], ["site contact", 3.5], ["contact detail", 3], ["phone number", 2], ["change contact", 3], ["rename", 1.5]],
    next: ["How do I run Setup?", "How do I change the theme?", "What can I do?"],
    say: (ctx) => note([
      "The site name and contact are the first step of Setup. Open Settings, Reopen setup, and edit them there.",
      "Change the site's name or contact in Setup's first step (Settings, then Reopen setup).",
      "Site details live in Setup: Settings, Reopen setup, step one.",
    ], needManager(ctx, "change site details")),
  },
  {
    id: "howto_switch_mode", group: "howto",
    keys: [["switch", 2], ["toggle", 2], ["live", 1.5], ["simulation", 1.5], ["demo", 1.5], ["mode", 1], ["go to", 1.5], ["take me to", 2.5], ["point", -3], ["go back", 2], ["change", 0.5], ["back", 0.5], ["what is", -2], ["mean", -2], ["why", -2]],
    next: ["What is Simulation?", "Is this live data?", "How do I run the simulation?"],
    say: (ctx) => {
      const now = `You're on ${ctx.mode === "sim" ? "Simulation" : "Live"} now.`;
      return [
        `Use Data source at the bottom of the sidebar (on a phone, open the menu first) and pick Live or Simulation. It's also in Settings. Switching only changes what this browser shows; it never moves or changes any data. ${now}`,
        `Data source, at the bottom of the sidebar, flips between Live and Simulation. ${now}`,
        `Tap Live or Simulation under Data source in the sidebar. Only your browser changes; the data stays put. ${now}`,
      ];
    },
  },
  {
    id: "howto_analytics", group: "howto",
    keys: [["analytics", 3], ["heatmap", 3], ["read", 1], ["understand", 1], ["how", 0.5], ["what", 0.3], ["latency", -3], ["empty", -3]],
    next: ["When is it busiest?", "What does the latency card show?", "What's the busiest day?"],
    say: [
      "Analytics has three parts:\n• Live occupancy: the share of reporting curbs that are occupied, with a new point every few seconds.\n• Average occupancy by day and hour: a heatmap, darker for emptier and brighter red for fuller. Show as table gives the numbers.\n• Busiest day and Peak hour, worked out from that week.\nBelow them is the latency card.",
      "On Analytics: a live occupancy line, a day-by-hour heatmap (brighter red is fuller; Show as table for numbers), the busiest day and peak hour, and the latency card. I can also read those numbers out for you.",
      "Analytics shows how full things are over time: live, and across a typical week as a heatmap. Ask me \"when is it busiest\" and I'll pull the number from it.",
    ],
  },
  {
    id: "explain_latency", group: "howto",
    keys: [["latency", 3], ["event age", 3], ["receiver to firebase", 3], ["millisecond", 2], ["ms", 1], ["card", 0.5]],
    next: ["How do I read Analytics?", "What is the Receiver?", "When was the last update?"],
    say: [
      "The latency card on Analytics times each step a reading takes, in milliseconds:\n• Event age: how old the curb's event was when the Receiver handled it.\n• Receiver to Firebase: from the Receiver getting it to its database write.\n• Firebase to dashboard: measured in your browser when a curb's reading changes; not stored.\nPick a step with the chips above the chart.",
      "Latency is how long a reading takes to reach you. The card splits it into event age, Receiver to Firebase, and Firebase to dashboard.",
      "That card measures delay, step by step, from the curb to your screen. Use its chips to switch between the three legs.",
    ],
  },
  {
    id: "howto_thresholds", group: "howto",
    keys: [["threshold", 3], ["alert level", 3], ["battery limit", 2.5], ["count as low", 3.5], ["set", 0.5], ["attention", 0.5], ["low battery", 1], ["change", 1], ["limit", 1.5], ["below", 1], ["stale", 0.5]],
    next: ["What counts as low battery?", "What does attention mean?", "Show low batteries"],
    say: (ctx) => {
      const a = alertsOf(ctx);
      const now = `(now ${a.lowBattery}% and stale checks ${a.staleEnabled ? `after ${a.staleMinutes} minutes` : "off"})`;
      return note([
        `Open Settings, then Alert thresholds. Set Low battery alert below and, if you want it, Flag curbs that stop reporting after some minutes ${now}. Press Save thresholds. They're shared by everyone.`,
        `Thresholds live in Settings, under Alert thresholds ${now}. Change them and press Save thresholds.`,
        `Settings, Alert thresholds: that's where the low-battery level and stale check are set ${now}.`,
      ], needManager(ctx, "change alert thresholds"));
    },
  },
  {
    id: "howto_theme", group: "howto",
    keys: [["theme", 3], ["change", 1], ["look", 2], ["color", 0.5], ["status", -1], ["why", -1]],
    next: ["What do the status colours mean?", "What can I do?", "How do I run Setup?"],
    say: (ctx) => note([
      "Open Settings, then Appearance, and pick a theme. It changes everyone's dashboard. Curb status colours stay the same in every theme.",
      "Themes are in Settings, under Appearance. Pick one and the whole team sees it.",
      "Settings, Appearance: six themes to choose from. Status colours never change, whichever you pick.",
    ], needManager(ctx, "change the theme")),
  },
  {
    id: "howto_password", group: "howto",
    keys: [["password", 3], ["change", 0.5], ["reset", 1], ["forgot", 1.5]],
    next: ["How do I sign out?", "I can't sign in", "What can I do?"],
    say: [
      "Open Settings and use Change password under Account: enter your current password, then the new one twice. If you've forgotten it, ask a manager or Smart Wheel Stop for help; the dashboard can't reset it for you yet.",
      "Settings, Account, Change password. Current one first, then the new one twice.",
      "You can change it under Settings, Account. Forgotten passwords need a manager or Smart Wheel Stop for now.",
    ],
  },
  {
    id: "howto_assign_curb", group: "howto",
    keys: [["curb", 1], ["assign", 2.5], ["not assigned", -3], ["put", 1.5], ["move", 1.5], ["connect", 2.5], ["into lot", 2], ["in lot", 1.5], ["to lot", 1.5], ["lot", 0.5], ["which", -1], ["where is", -2], ["curbs in", -2]],
    next: ["Which curbs aren't in a lot?", "How do I run Setup?", "How many curbs are there?"],
    say: (ctx) => note([
      "Curbs go into lots in Setup, on the Connect curbs step: it lists curbs that have reported but aren't in a lot, and you pick the lot each one is installed in. Open it from Settings, Reopen setup.",
      "Use Setup's Connect curbs step (Settings, Reopen setup) and choose a lot for each curb.",
      "Settings, Reopen setup, then Connect curbs. Each unassigned curb gets a lot picker.",
    ], needManager(ctx, "put curbs in lots")),
  },
  {
    id: "howto_find_curb", group: "howto", curb: -3,
    keys: [["find", 2], ["filter", 2], ["look up", 2], ["curb", 1], ["how", 0.5], ["specific", 1], ["missing", -3], ["cant find", -3]],
    next: ["Which curbs are offline?", "What needs attention?", "Show low batteries"],
    say: [
      "Open Curb units and type the curb or lot in Search by unit or lot. The filters narrow it to Needs attention, Offline, Low battery or Free spots. You can also ask me, for example \"status of C-012\".",
      "Curb units has a search box and filters. Or just ask me about the curb by its ID.",
      "Search on Curb units, or tell me the ID and I'll look it up.",
    ],
  },
  {
    id: "howto_lot_sign", group: "howto",
    keys: [["sign", 3], ["entrance", 3], ["tv", 3.5], ["screen", 1.5], ["display", 1], ["open", 0.5], ["kiosk", 2.5], ["blank", -3], ["nothing", -3]],
    next: ["How many spots are free?", "How do I switch to Simulation?", "Why is the lot sign blank?"],
    say: (ctx) => {
      const sim = ctx.mode === "sim" ? " From Simulation it opens the simulated version." : "";
      return [
        `Open lot sign, at the bottom of the sidebar, opens the entrance sign in a new tab. It runs signed out, so it can stay up on a TV, and shows the free spots in each lot.${sim}`,
        `Use Open lot sign in the sidebar. Put that tab full-screen on a TV at the entrance.${sim}`,
        `The entrance sign opens from Open lot sign in the sidebar. No sign-in needed on the TV.${sim}`,
      ];
    },
  },
  {
    id: "howto_run_simulation", group: "howto",
    keys: [["simulation", 1.5], ["start", 2], ["stop", 2], ["run", 1.5], ["scenario", 2.5], ["rush hour", 1.5], ["rush hour scenario", 3], ["reset", 1.5], ["load", 2], ["pause", 2], ["demo", 1.5], ["what is", -2], ["switch", -1.5], ["when", -2], ["why", -2], ["greyed", -3], ["wont", -3], ["cant", -3]],
    next: ["What is Simulation?", "How do I switch to Live?", "Which curbs are offline?"],
    say: (ctx) => {
      const tail = (ctx.mode === "sim" ? "" : " Switch to Simulation first, under Data source.") + (canOperate(ctx) ? "" : `\n\nViewers can watch the simulation; operators and managers control it. ${ASK_MANAGER}`);
      return note([
        "In Simulation, the Simulation page in the sidebar has Start simulation and Stop simulation, scenarios (Rush hour in Lot 6, Take a curb offline, Bring all curbs online, Install 3 new curbs) and Load fresh simulated data to start over. Real curbs are never touched.",
        "Open the Simulation page (it's in the sidebar while you're in Simulation). Start, stop, run a scenario, or load fresh data.",
        "The Simulation page has the controls: Start, Stop, scenarios like Rush hour, and Load fresh simulated data.",
      ], tail);
    },
  },
  {
    id: "howto_demo", group: "howto",
    keys: [["demo", 1], ["run demo", 3.5], ["give demo", 3.5], ["presentation", 3], ["show off", 3], ["present", 2.5], ["impress", 2.5], ["showcase", 3], ["audience", 3]],
    next: ["How do I run the simulation?", "How do I open the lot sign?", "Tell me a joke"],
    say: [
      "For a demo: switch to Simulation, press Start simulation, open the lot sign on a second screen, then run Rush hour in Lot 6 and watch it fill. Take a curb offline to show alerts.",
      "My demo recipe: Simulation, Start, lot sign on a TV, Rush hour scenario, then Take a curb offline. Finish on Analytics.",
      "Try this: start the simulation, open the lot sign, trigger Rush hour, then show Needs attention after taking a curb offline. People love the live updates.",
    ],
  },
  {
    id: "howto_sign_out", group: "howto",
    keys: [["signout", 3.5], ["exit", 1], ["leave", 1]],
    next: ["How do I change my password?", "What can I do?", "What can you do?"],
    say: [
      "Use the sign-out button next to your email at the bottom of the sidebar. On a phone, open the menu first.",
      "Bottom of the sidebar, next to your email: that's the sign-out button.",
      "Tap the sign-out icon beside your email in the sidebar (open the menu first on a phone).",
    ],
  },
  {
    id: "howto_modules", group: "howto",
    keys: [["module", 3], ["sidebar", 1], ["feature", 1.5], ["permit", 1], ["event mode", 2]],
    next: ["How do I run Setup?", "What are zone presets?", "What can you do?"],
    say: [
      "Modules are optional features for a facility type, such as permit tiers for a campus or event mode for a stadium. None has shipped yet, so none appears in the sidebar. They'll show up there, and in Setup, once they're released.",
      "Modules are extra features for your facility type. None is available yet, so you won't see any in the sidebar for now.",
      "No modules are available yet. When one is released it appears in Setup and, once turned on, in the sidebar.",
    ],
  },
  {
    id: "howto_add_lot", group: "howto",
    keys: [["add lot", 3.5], ["new lot", 3.5], ["create lot", 3.5], ["another lot", 3.5], ["lot", 0.5], ["add", 0.5], ["curb", -2], ["user", -2], ["rename lot", -3]],
    next: ["How do I put a curb in a lot?", "What lots are there?", "How do I run Setup?"],
    say: [
      "Lots are added by Smart Wheel Stop when your curbs are installed, so there's no button for it here. Contact them with the lot's name, size and location. Once a lot exists, a manager can put curbs in it in Setup, on the Connect curbs step.",
      "Smart Wheel Stop sets up new lots for you. Send them the name, number of spaces and location.",
      "New lots come from Smart Wheel Stop's side, not this dashboard. Once it's there, connect curbs to it in Setup.",
    ],
  },
  {
    id: "howto_rename", group: "howto",
    keys: [["rename lot", 3.5], ["rename curb", 3.5], ["lot name", 1], ["rename", 2], ["change name", 2.5], ["change lot name", 4], ["curb id", 1.5], ["site", -2]],
    next: ["How do I add a lot?", "What lots are there?", "How do I change the site name?"],
    say: [
      "Lot names are managed by Smart Wheel Stop, and curb IDs are fixed by the hardware, so neither can be renamed here. Ask Smart Wheel Stop to rename a lot.",
      "Renaming lots happens on Smart Wheel Stop's side; curb IDs never change.",
      "You can't rename lots or curbs from the dashboard. Smart Wheel Stop can change a lot's name for you.",
    ],
  },
  {
    id: "howto_export", group: "howto",
    keys: [["export", 3], ["download", 3], ["csv", 3], ["excel", 3], ["spreadsheet", 3], ["print", 2], ["report", 1.5], ["save data", 2.5]],
    next: ["How do I read Analytics?", "When is it busiest?", "Give me a summary"],
    say: [
      "There's no export yet, sorry. Analytics has a Show as table option you can copy from, and I can read out the key numbers.",
      "Downloads aren't built yet. For now, Analytics' Show as table is the easiest place to copy numbers from.",
      "No CSV or Excel export at the moment. Ask me for a summary, or copy the table on Analytics.",
    ],
  },
  {
    id: "howto_notifications", group: "howto",
    keys: [["notification", 3], ["notify", 3], ["email me", 4], ["text me", 3], ["sms", 4], ["push", 2], ["get alerted", 3], ["alert me", 3]],
    next: ["What needs attention?", "How do I change the alert thresholds?", "What does attention mean?"],
    say: [
      "The dashboard doesn't send emails or texts yet. Alerts show on Overview under Needs attention, and you can always ask me what needs attention.",
      "No push or email alerts yet. Keep an eye on Needs attention on Overview, or ask me.",
      "Notifications aren't available yet; everything shows in the dashboard itself, under Needs attention.",
    ],
  },
  {
    id: "howto_mobile", group: "howto",
    keys: [["phone", 2.5], ["mobile", 3], ["tablet", 3], ["ipad", 3], ["app", 1.5], ["on the go", 2.5]],
    next: ["How do I sign out?", "How do I switch to Simulation?", "How many spots are free?"],
    say: [
      "The dashboard works in your phone's browser: open the same address and sign in. The menu button at the top opens the sidebar.",
      "Yes, it works on phones and tablets in the browser. Use the menu button for the sidebar.",
      "Just open it in your mobile browser. There's no separate app; everything fits the small screen.",
    ],
  },
  {
    id: "howto_accessibility", group: "howto",
    keys: [["accessibility", 3], ["accessible", 2], ["screen reader", 3.5], ["bigger text", 3], ["bigger", 2.5], ["larger", 2.5], ["zoom", 2.5], ["font size", 3], ["reduced motion", 3], ["keyboard", 2]],
    next: ["How do I change the theme?", "What do the status colours mean?", "What can you do?"],
    say: [
      "Use your browser's zoom (Ctrl or Cmd and +) for bigger text. Animations turn off if your device asks for reduced motion, and screen readers can read every page.",
      "Zoom in with Ctrl/Cmd and +, and set reduced motion in your device settings if you'd like fewer animations. Screen readers work too.",
      "The dashboard follows your device: browser zoom for size, reduced motion for calmer screens, and labels for screen readers.",
    ],
  },
  {
    id: "howto_contact_support", group: "howto",
    keys: [["support", 2], ["contact", 2], ["who can help", 4], ["call", 1.5], ["who do i call", 3.5], ["talk to", 1.5], ["real person", 1], ["vendor", 2.5], ["smart wheel stop team", 3], ["call", 1.5], ["email support", 3], ["helpdesk", 3]],
    next: ["Who is the site contact?", "What can I do?", "Help"],
    say: [
      "For anything I can't sort out, contact Smart Wheel Stop. Your managers have their details, and the site contact is in Setup's first step.",
      "Ask a manager to reach Smart Wheel Stop for you; they handle lots, hardware and accounts.",
      "Smart Wheel Stop's team can help with hardware, lots and accounts. Your managers know how to reach them.",
    ],
  },

  // ---------- Troubleshooting ----------
  {
    id: "ts_curb_offline", group: "howto", usesCurb: true,
    keys: [["why", 1.5], ["offline", 2], ["fix", 1.5], ["fix offline", 2], ["keep going offline", 3], ["go offline", 1.5], ["not reporting", 1], ["what do i do", 1], ["mean", -2]],
    next: ["Which curbs are offline?", "What is the Receiver?", "Show low batteries"],
    say: (ctx, ent) => {
      const u = ent.curbId ? ctx.units?.[ent.curbId] : null;
      const first = u ? (u.online ? `${ent.curbId} is actually online right now. ` : `${ent.curbId} is offline${typeof u.battery === "number" ? ` with ${u.battery}% battery` : ""}. `) : "";
      return [
        `${first}A curb usually goes offline because its battery is flat, something is blocking its signal (snow, a parked trailer, a leaf on the antenna), or the Receiver itself is down. Check the battery first, then whether nearby curbs are offline too: if a whole lot drops at once, it's the Receiver.`,
        `${first}Common causes: a flat battery, a blocked signal, or the Receiver being off. If many curbs drop together, look at the Receiver; if it's one curb, check its battery and surroundings.`,
        `${first}Try this order: battery level, anything covering the curb, then the Receiver's power. A single offline curb is usually local; a whole lot offline points at the Receiver.`,
      ];
    },
  },
  {
    id: "ts_panel_not_changing", group: "howto",
    keys: [["not changing", 3], ["didnt change", 3], ["wont change", 3], ["panel", 1.5], ["panel changing", 2.5], ["led", 1], ["still", 2], ["old message", 3], ["old", 1.5], ["stayed same", 3.5], ["pressed apply", 3], ["apply", 1.5], ["nothing happened", 3.5], ["but nothing", 3], ["not updating", 1.5], ["didnt work", 2], ["not showing", 2]],
    next: ["How do I change an LED colour?", "Why can't I save?", "Which curbs are offline?"],
    say: (ctx) => note([
      "If the panel isn't changing: make sure you pressed Apply changes (brightness saves when you let go of the slider), check the curb is online, and give it a few seconds. An offline curb can't receive the change.",
      "Three things to check: you pressed Apply changes, the curb is online, and your account can edit LEDs. Offline curbs pick the change up once they're back.",
      "Usually it's one of: Apply changes not pressed, the curb is offline, or the change is still on its way. Check Curb units for the curb's status.",
    ], canOperate(ctx) ? "" : `\n\nAlso, you're ${roleText(ctx)}, so the LED controls are read-only for you.`),
  },
  {
    id: "ts_cant_save", group: "howto",
    keys: [["cant save", 3.5], ["wont save", 3.5], ["not saving", 3.5], ["let me save", 3.5], ["save", 2], ["saving", 2.5], ["not work", 1.5], ["permission denied", 3.5], ["refused", 2.5], ["not allowed", 2.5], ["why cant i", 2.5], ["error", 1]],
    next: ["What can I do?", "What can each role do?", "How do I change someone's role?"],
    say: (ctx) => {
      const why = isManager(ctx) ? "As a manager you can save everything, so check you're online and the fields are valid (the form says which)." : canOperate(ctx) ? "You're an operator: LEDs and the simulation save, but people, Setup and settings need a manager." : "You're a viewer, so the dashboard is read-only for you. A manager can make you an operator.";
      return [`${why} If you see "permission denied", it's your role or the connection.`, `Most of the time it's the role. ${why}`, `${why} Otherwise, check your connection and try again.`];
    },
  },
  {
    id: "ts_greyed_out", group: "howto",
    keys: [["greyed out", 3.5], ["grayed out", 3.5], ["disabled", 2.5], ["cant click", 3.5], ["button", 1.5], ["locked", 2.5], ["lock icon", 3]],
    next: ["What can I do?", "What can each role do?", "Why can't I save?"],
    say: (ctx) => [
      `Greyed-out controls usually mean your role can't use them. You're ${roleText(ctx)}.${isManager(ctx) ? " Managers can use everything, so it may be waiting for a choice first (like picking a lot)." : ` ${ASK_MANAGER}`}`,
      `That's the role lock. As ${roleText(ctx)}, some buttons are for other roles.${isManager(ctx) ? " If you're a manager, check a selection is made first." : ""}`,
      `Buttons go grey when your role can't use them, or a choice is still needed. You're ${roleText(ctx)}.`,
    ],
  },
  {
    id: "ts_data_stuck", group: "howto",
    keys: [["not updating", 3], ["not moved", 3], ["moved", 1.5], ["in ages", 2], ["stuck", 3], ["frozen", 3], ["not refreshing", 3], ["refresh", 2], ["old data", 2.5], ["same number", 2], ["not moving", 2.5]],
    next: ["When was the last update?", "Which curbs are offline?", "Is this live data?"],
    say: (ctx) => [
      `Numbers only change when a curb reports a change, so a quiet lot can look still. If it seems wrong, reload the page and check your connection.${ctx.mode === "sim" ? " In Simulation, the data only moves while the simulation is running." : ""}`,
      `Try a reload first. Curbs only report when something changes, so stillness isn't always a problem.${ctx.mode === "sim" ? " In Simulation, press Start simulation to get movement." : ""}`,
      `Ask me "when was the last update" to see how fresh it is. Reloading fixes most stuck screens.${ctx.mode === "sim" ? " Simulation needs to be running to change." : ""}`,
    ],
  },
  {
    id: "ts_wrong_count", group: "howto",
    keys: [["wrong", 2.5], ["looks wrong", 3], ["no car", 2.5], ["but no car", 3.5], ["count is wrong", 3.5], ["is wrong", 1.5], ["incorrect", 3], ["doesnt match", 3], ["shows occupied", 3], ["but empty", 3], ["ghost car", 3], ["false", 2], ["not accurate", 3], ["inaccurate", 3]],
    next: ["How does it know a spot is taken?", "Which curbs are offline?", "What does offline mean?"],
    say: [
      "If a spot shows the wrong state, check the curb: debris, snow or a shopping cart over it can fool the sensor. Offline curbs aren't counted, which can make totals look low.",
      "Mismatches usually come from something sitting over the sensor or the curb being offline. Clear it, and it reports again on the next change.",
      "Wrong counts? Look for blocked sensors and offline curbs first. If one curb keeps getting it wrong, tell Smart Wheel Stop.",
    ],
  },
  {
    id: "ts_cant_sign_in", group: "howto",
    keys: [["cant sign in", 3.5], ["cant log in", 3.5], ["signin", 3], ["error", 1], ["locked out", 3.5], ["login problem", 3.5], ["no access", 3], ["access to dashboard", 2], ["wrong password", 3]],
    next: ["How do I change my password?", "How do new people create an account?", "Who can help?"],
    say: [
      "If you can't sign in, double-check your email and password. Forgotten passwords need a manager or Smart Wheel Stop for now. New accounts need an invite first.",
      "Check the email you were invited with and your password. Still stuck? A manager can help, or Smart Wheel Stop can.",
      "Sign-in trouble is usually the email, the password, or a missing invite. A manager can check your invite in Users & roles.",
    ],
  },
  {
    id: "ts_invite_not_working", group: "howto",
    keys: [["link not working", 3.5], ["link doesnt work", 3.5], ["invite not working", 3.5], ["signup link", 1.5], ["link", 1.5], ["not working", 2], ["signin", -3], ["didnt get", 2.5], ["no email", 3], ["never got", 3], ["not working", 1.5]],
    next: ["How do I add a user?", "Where are pending invites?", "How do new people create an account?"],
    say: [
      "The dashboard doesn't email invites: the manager must copy the sign-up link and send it. The person has to sign up with exactly the invited email.",
      "Check two things: the link was actually sent (the dashboard doesn't email it), and they're using the same email that was invited.",
      "Invites aren't emailed automatically. Copy the link from Pending invites, send it, and make sure they use the invited email.",
    ],
  },
  {
    id: "ts_curb_missing", group: "howto",
    keys: [["missing", 3], ["cant find", 3], ["not showing", 3], ["showing up", 2.5], ["doesnt appear", 3], ["disappeared", 3], ["not listed", 3], ["where did", 2]],
    next: ["Which curbs aren't in a lot?", "How do I find a curb?", "How do I put a curb in a lot?"],
    say: [
      "A curb appears once it has reported at least once. If it reported but isn't in a lot, it's under Curbs without a lot in Setup. Search Curb units by its ID to check.",
      "Missing curbs either haven't reported yet or aren't in a lot. Ask me \"which curbs aren't in a lot\".",
      "Check Curb units' search first. New curbs show up after their first report, then need a lot in Setup.",
    ],
  },
  {
    id: "ts_battery_drain", group: "howto",
    keys: [["drain", 3], ["draining", 3], ["dies fast", 3.5], ["die", 2.5], ["quickly", 1], ["battery life", 3], ["last longer", 3], ["battery last", 3], ["save battery", 3.5], ["battery dropping", 3], ["why", 0.5]],
    next: ["Show low batteries", "How are the batteries overall?", "Give me a tip"],
    say: [
      "Batteries drain faster with high LED brightness, a busy spot (more reports), and cold weather. Lower the brightness where it isn't needed.",
      "To make batteries last: keep brightness modest, and expect shorter life in winter and on very busy spots.",
      "Fast drain usually means a bright LED, lots of traffic, or cold. Turning brightness down helps the most.",
    ],
  },
  {
    id: "ts_sign_blank", group: "howto",
    keys: [["sign blank", 3.5], ["sign empty", 3.5], ["blank", 2], ["sign", 1], ["tv", 1], ["nothing on", 4], ["show nothing", 3.5], ["nothing", 1.5], ["sign not", 3]],
    next: ["How do I open the lot sign?", "Which curbs are offline?", "How many spots are free?"],
    say: [
      "If the lot sign is blank, reload it and check the TV's internet. It needs lots with curbs reporting; in Simulation, open it from the dashboard so it shows simulated data.",
      "A blank sign is usually the connection or an empty lot list. Reload it, and make sure it's the right Live or Simulation version.",
      "Try reloading the sign tab. It only shows lots that exist, and the simulated version needs its own link from Open lot sign.",
    ],
  },
  {
    id: "ts_analytics_empty", group: "howto",
    keys: [["analytics empty", 3.5], ["no history", 3.5], ["analytics blank", 3.5], ["no chart", 3], ["nothing in analytics", 3.5], ["no data", 1.5], ["analytics", 2], ["empty", 1], ["is empty", 1]],
    next: ["How do I read Analytics?", "How do I run the simulation?", "When is it busiest?"],
    say: (ctx) => [
      `Analytics needs recorded history.${ctx.mode === "sim" ? " In Simulation, Load fresh simulated data adds a week of it, and the live chart moves while the simulation runs." : " For the live site it fills in as history is recorded."}`,
      `Empty Analytics just means no history yet.${ctx.mode === "sim" ? " Load fresh simulated data on the Simulation page." : ""}`,
      `No history has been recorded${ctx.mode === "sim" ? " in the simulation yet; loading fresh simulated data fixes that" : " yet"}.`,
    ],
  },
  {
    id: "ts_sim_wont_start", group: "howto",
    keys: [["wont start", 3.5], ["cant start", 3.5], ["start greyed", 3.5], ["running elsewhere", 3.5], ["simulation not", 3], ["simulation", 1.5], ["start", 1], ["greyed out", 1.5]],
    next: ["How do I run the simulation?", "What is Simulation?", "What can I do?"],
    say: (ctx) => note([
      "If Start simulation is greyed out, it's either running in another browser (only one runs at a time) or your role can't control it. Stop it from the other browser, or wait.",
      "Only one browser runs the simulation at a time. If someone else started it, you'll see it moving but can't start a second one.",
      "Check whether it's already running elsewhere; the Simulation page says so. Viewers can watch but not start it.",
    ], canOperate(ctx) ? "" : `\n\nYou're ${roleText(ctx)}: ${ASK_MANAGER}`),
  },
  {
    id: "ts_slow", group: "howto",
    keys: [["slow", 2.5], ["slowly", 2.5], ["loading", 2], ["page", 1.5], ["laggy", 3], ["loading forever", 3.5], ["takes ages", 3], ["page slow", 3.5], ["slow to load", 3.5], ["sluggish", 3]],
    next: ["What does the latency card show?", "When was the last update?", "Is this live data?"],
    say: [
      "If pages are slow, check your connection and reload. The latency card on Analytics shows how long readings take to arrive.",
      "Slowness is usually the network. Reload, and see Analytics' latency card for where the delay is.",
      "Try a reload on a better connection. For reading delays specifically, the latency card has the breakdown.",
    ],
  },
];

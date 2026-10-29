// Tests the rule-based assistant (src/assistant/) without React or a database:
// example phrasings must reach the right intent (typos, other wording and
// follow-ups included), out-of-scope questions must fall back politely, variants
// must never repeat back to back, and answers must use the data, mode and role given.
//
//   npm run test:assistant
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { INTENTS, INTENT_BY_ID, SOMETHING_ELSE, findLot, menuChips, respond, welcome } from "../src/assistant/index.js";
import { parseMath } from "../src/assistant/engine/math.js";
import { ALL_EXAMPLES } from "../src/assistant/examples/index.js";
import { FOLLOW_UPS, OUT_OF_SCOPE } from "./assistant-conversations.mjs";
import { HOLDOUT } from "./assistant-holdout.mjs";

const NOW = new Date(2026, 9, 28, 15, 0, 0).getTime(); // a Wednesday, 3 PM local
const min = (n) => NOW - n * 60000;
const ROW = (base) => Array.from({ length: 14 }, (_, h) => Math.min(99, base + (h === 10 ? 30 : h === 0 ? -20 : 0)));
const WEEK = { Mon: ROW(50), Tue: ROW(55), Wed: ROW(60), Thu: ROW(65), Fri: ROW(70), Sat: ROW(30), Sun: ROW(25) };
const DATA = {
  lots: { lot06: { name: "Lot 6" }, lot14: { name: "Lot 14" }, lot12: { name: "Lot 12 — North" }, garageA: { name: "Garage A, Level 2" } },
  units: {
    "C-001": { lot: "lot06", online: true, occupied: true, battery: 80, lastUpdated: min(3), ledColor: "blue", panelText: "PERMIT A" },
    "C-002": { lot: "lot06", online: true, occupied: false, battery: 12, lastUpdated: min(9) },
    "C-003": { lot: "lot06", online: false, occupied: false, battery: 5, lastUpdated: min(400) },
    "C-041": { lot: "lot14", online: true, occupied: true, battery: 64, lastUpdated: min(1), ledColor: "\"red\"", ledBrightness: 40 },
    "C-042": { lot: "lot14", online: true, occupied: true, lastUpdated: min(20) },
    "C-095": { lot: "garageA", online: true, occupied: false, battery: 90, lastUpdated: min(2) },
    "C-120": { lot: "lot12", online: true, occupied: false, battery: 55, lastUpdated: min(6) },
    "C-200": { online: true, occupied: false, battery: 70, lastUpdated: min(30) },
  },
  history: { week: WEEK, live: { a: { t: min(30), pct: 40 }, b: { t: min(15), pct: 48 }, c: { t: min(1), pct: 61 } } },
};
// A fixed sequence instead of Math.random, so runs repeat exactly.
function seeded(seed = 7) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}
const ctx = (over = {}) => ({ ...DATA, alerts: { lowBattery: 20, staleEnabled: false, staleMinutes: 30 }, now: NOW, mode: "live", role: "manager", firstName: "Dana", random: seeded(), ...over });
const intentOf = (q, c = ctx(), state = {}) => respond(q, c, state).intent;

const CASES = ALL_EXAMPLES;

test(`${CASES.length} example phrasings reach the expected intent`, () => {
  assert.ok(CASES.length >= 500, `only ${CASES.length} phrasings`);
  const wrong = CASES.map(([q, want]) => ({ q, want, got: intentOf(q) })).filter((r) => r.got !== r.want);
  assert.deepEqual(wrong, [], wrong.map((r) => `"${r.q}": wanted ${r.want}, got ${r.got}`).join("\n"));
});

test("every intent has at least two example phrasings", () => {
  const counts = Object.fromEntries(INTENTS.map((i) => [i.id, 0]));
  for (const [, id] of CASES) counts[id] += 1;
  for (const [, , id] of FOLLOW_UPS) counts[id] += 1;
  const thin = Object.entries(counts).filter(([, n]) => n < 2).map(([id]) => id);
  assert.deepEqual(thin, []);
});

test(`fresh phrasings written after tuning reach at least 80% (${HOLDOUT.length} of them)`, () => {
  // A multi-part reply counts when one of its answers is the expected intent.
  const misses = HOLDOUT.filter(([q, want]) => !intentOf(q).split("+").includes(want));
  const rate = 1 - misses.length / HOLDOUT.length;
  console.log(`  held-out accuracy: ${HOLDOUT.length - misses.length}/${HOLDOUT.length} = ${(rate * 100).toFixed(1)}%`);
  assert.ok(rate >= 0.8, `held-out accuracy ${(rate * 100).toFixed(1)}%: ${misses.map(([q, w]) => `"${q}" (${w})`).join(", ")}`);
});

test("follow-ups use the lot, curb and topic from earlier in the conversation", () => {
  const wrong = [];
  for (const [before, q, want, entity] of FOLLOW_UPS) {
    let state = {};
    const c = ctx();
    for (const b of before) state = respond(b, c, state).state;
    const r = respond(q, c, state);
    const got = r.entities?.lotId || r.entities?.curbId || null;
    if (r.intent !== want || (entity && got !== entity)) wrong.push(`"${before.join(" / ")}" then "${q}": wanted ${want} ${entity || ""}, got ${r.intent} ${got || ""}`);
  }
  assert.deepEqual(wrong, []);
});

test("\"show me more\" pages through a long list", () => {
  const units = {};
  for (let i = 1; i <= 20; i++) units[`C-${String(i).padStart(3, "0")}`] = { lot: "lot06", online: false, lastUpdated: min(i) };
  const c = ctx({ units });
  const first = respond("which curbs are offline", c, {});
  assert.match(first.text, /C-001/);
  assert.match(first.text, /12 more/);
  const second = respond("show me more", c, first.state);
  assert.equal(second.intent, "offline_curbs");
  assert.match(second.text, /C-009/);
  assert.doesNotMatch(second.text, /C-001 /);
  const third = respond("more", c, second.state);
  assert.match(third.text, /C-017/);
});

test(`${OUT_OF_SCOPE.length} out-of-scope questions get a friendly fallback with the topic menu`, () => {
  assert.ok(OUT_OF_SCOPE.length >= 40);
  const wrong = [];
  for (const q of OUT_OF_SCOPE) {
    const r = respond(q, ctx());
    if (!r.fallback) wrong.push(`"${q}" matched ${r.intent}`);
    else {
      assert.deepEqual(r.chips, menuChips(ctx()));
      assert.match(r.text, /parking|lots|curbs|dashboard|topic/i);
    }
  }
  assert.deepEqual(wrong, []);
});

test("multi-part questions get every answer", () => {
  const r = respond("offline curbs and low batteries", ctx());
  assert.deepEqual(r.intents, ["offline_curbs", "low_battery"]);
  assert.match(r.text, /C-003 in Lot 6: last heard/);
  assert.match(r.text, /C-002 in Lot 6: 12%/);
  assert.equal(r.text.match(/From live data/g).length, 1, "one source line for both");
  assert.deepEqual(respond("free spots in lot 6 and lot 14", ctx()).intents, ["free_lot", "free_lot"]);
  assert.deepEqual(respond("thanks and bye", ctx()).intents, ["thanks", "goodbye"]);
  assert.equal(respond("difference between operator and manager", ctx()).intent, "explain_roles");
});

test("lot names match loosely: partial names, short forms, number words and typos", () => {
  const cases = [["garage 2", "garageA"], ["gar2", "garageA"], ["level 2", "garageA"], ["garag 2", "garageA"], ["lot twelve", "lot12"], ["lot tweleve", "lot12"],
    ["north", "lot12"], ["lot 12 north", "lot12"], ["lot06", "lot06"], ["lot six", "lot06"], ["Lot 14", "lot14"], ["lot 1", null], ["which lot is busiest", null], ["what is 2 plus 2", null], ["the garage", null]];
  for (const [q, want] of cases) assert.equal(findLot(q, DATA.lots), want, q);
});

test("the calculator parses sums itself", () => {
  const val = (q) => parseMath(q)?.value;
  assert.equal(val("what is 17x23"), 391);
  assert.equal(val("17 * 23"), 391);
  assert.equal(val("what's 2 plus 2"), 4);
  assert.equal(val("15% of 80"), 12);
  assert.equal(val("(3+4)*2"), 14);
  assert.equal(val("2 ^ 10"), 1024);
  assert.equal(val("seven times eight"), 56);
  assert.equal(val("square root of 81"), 9);
  assert.equal(val("100 / 8"), 12.5);
  assert.equal(val("-3 + 5"), 2);
  assert.equal(parseMath("10 / 0").error, "zero");
  for (const q of ["C-041", "lot 6", "what time is it", "process.exit()", "alert(1)", "2; drop table", "constructor"]) assert.equal(parseMath(q), null, q);
  assert.match(respond("what is 17x23", ctx()).text, /391/);
  assert.match(respond("1,000 * 3", ctx()).text, /3,000/);
});

test("history answers use the recorded week and say where they come from", () => {
  const busy = respond("when is it busiest", ctx()).text;
  assert.match(busy, /5 PM/);
  assert.match(busy, /From recorded history of the live site/);
  assert.match(respond("what's the busiest day", ctx()).text, /Friday/);
  assert.match(respond("what's the quietest day", ctx()).text, /Sunday/);
  assert.match(respond("today vs yesterday", ctx()).text, /Wednesday[\s\S]*Tuesday/);
  assert.match(respond("weekends vs weekdays", ctx()).text, /\d+%/);
  assert.match(respond("is it getting busier", ctx()).text, /busier/);
  assert.match(respond("when is it busiest", ctx({ mode: "sim" })).text, /recorded history of the simulation/);
  assert.match(respond("when is it busiest", ctx({ history: {} })).text, /recorded history|No history/i);
});

test("\"today vs yesterday\" compares typical days of the week and never says \"yesterday\"", () => {
  // Every variant, by asking repeatedly in one conversation (variants don't repeat back to back).
  let state = {};
  const texts = new Set();
  for (let i = 0; i < 12; i++) {
    const r = respond("today vs yesterday", ctx({ random: seeded(i + 1) }), state);
    assert.equal(r.intent, "history_today_vs_yesterday");
    state = r.state;
    texts.add(r.text);
  }
  assert.equal(texts.size, 3);
  for (const t of texts) {
    assert.match(t, /a typical Wednesday/i, t);
    assert.match(t, /a typical Tuesday/i, t);
    assert.match(t, /from recorded history/i, t);
    assert.doesNotMatch(t, /yesterday/i, t);
  }
  // Monday compares with a typical Sunday.
  assert.match(respond("compared to yesterday", ctx({ now: new Date(2026, 9, 26, 12).getTime() })).text, /typical Monday[\s\S]*typical Sunday/);
});

test("status answers name lots and curbs and say how fresh the data is", () => {
  const offline = respond("which curbs are offline", ctx()).text;
  assert.match(offline, /C-003 in Lot 6/);
  assert.match(offline, /From live data · latest reading 1 min ago\./);
  // Capacity is the curbs that report: C-003 in Lot 6 is offline, so 6, not 7.
  assert.match(respond("how many spots are free", ctx()).text, /3 of 6|3 free spots out of 6|3 of 6 spots/);
  assert.match(respond("is lot 14 full", ctx()).text, /Lot 14/);
  assert.match(respond("status of c41", ctx()).text, /C-041[\s\S]*Lot 14[\s\S]*Status: occupied[\s\S]*LED: red/);
  assert.match(respond("C-999", ctx()).text, /C-999/);
  for (const q of ["how many spots are free", "which curbs are offline", "status of C-041", "what needs attention", "give me a summary"]) {
    assert.match(respond(q, ctx({ mode: "sim" })).text, /From simulated data, not the real curbs/, q);
  }
});

test("lot capacity is the curbs that report: offline curbs are never in \"of N\"", () => {
  const total = respond("how many spots are free", ctx()).text;
  assert.match(total, /• Lot 6: 1 of 2 \(1 offline\)/);
  assert.doesNotMatch(total, /Lot 6: \d+ of 3/);
  assert.match(respond("free spots in lot 6", ctx()).text, /1 (free spot )?(out )?of 2|1 free spot right now/);
  assert.doesNotMatch(respond("free spots in lot 6", ctx()).text, /of 3/);
  // A lot with no curbs says so; one whose curbs are all offline says none report.
  const c = ctx();
  const lots = { ...c.lots, lot20: { name: "Lot 20" }, lot21: { name: "Lot 21" } };
  const units = { ...c.units, "C-201": { lot: "lot21", online: false, occupied: false, lastUpdated: c.now - 60000 } };
  const bare = respond("how many spots are free", { ...c, lots, units }).text;
  assert.match(bare, /• Lot 20: no curbs yet/);
  assert.match(bare, /• Lot 21: no curbs reporting/);
  assert.doesNotMatch(bare, /Lot 2[01]: 0 of 0/);
  assert.match(respond("free spots in lot 20", { ...c, lots, units }).text, /Lot 20 has no curbs yet|No curbs yet in Lot 20/);
  assert.match(respond("free spots in lot 21", { ...c, lots, units }).text, /reporting|offline/);
  assert.match(respond("free spots in each lot", { ...c, lots, units }).text, /• Lot 20: no curbs yet/);
});

test("a lot that doesn't exist gets \"couldn't find\" and the real lots, not the site total", () => {
  const cases = [["how many free spots in lot 99", "Lot 99"], ["is lot 7 full", "Lot 7"], ["free spots in Garage Z", "Garage Z"],
    ["spots in the Westfield lot", "Westfield"], ["free spots in the lot called Riverside", "Riverside"], ["lot ninety nine", "Lot 99"]];
  for (const [q, name] of cases) {
    const r = respond(q, ctx());
    assert.equal(r.intent, "lot_not_found", q);
    assert.match(r.text, new RegExp(`couldn't find a lot called ${name}\\.|no lot called ${name}\\.|${name} isn't one of the lots`), q);
    assert.match(r.text, /Lots on this site:\n• Garage A, Level 2\n• Lot 6\n• Lot 12 — North\n• Lot 14/, q);
    assert.doesNotMatch(r.text, /free spots? out of|spots are free across|of \d+ spots are open/, q);
    assert.ok(r.chips.includes("What lots are there?"), q);
  }
  assert.match(respond("is lot 7 full", ctx({ mode: "sim" })).text, /Lots in the simulation:/);
  // The topic carries on: "and Lot 6?" after a missing lot gets Lot 6's free spots.
  const state = respond("how many free spots in lot 99", ctx()).state;
  assert.equal(respond("and lot 6?", ctx(), state).intent, "free_lot");
  assert.equal(respond("and lot 99?", ctx(), respond("free spots in lot 6", ctx()).state).intent, "lot_not_found");
  // Real lots, typo'd and partial names, and everyday "lot" stay as they were.
  for (const [q, want] of [["is lot 14 full", "free_lot"], ["garage 2", "free_lot"], ["lot 12", "free_lot"], ["most crowded lot right now", "busiest_lot"],
    ["thanks a lot", "thanks"], ["A lot of curbs are offline", "offline_curbs"], ["which lot is busiest", "busiest_lot"], ["how do I add lot 7", "howto_add_lot"]]) {
    assert.equal(intentOf(q), want, q);
  }
});

test("\"is C-041 free / occupied / taken?\" answers for that curb, not the site", () => {
  for (const q of ["Is C-041 free?", "is C-041 occupied", "is C-041 taken", "is c41 available", "is curb 41 empty", "is C-041 vacant", "is C-041 in use"]) {
    const r = respond(q, ctx());
    assert.equal(r.intent, "curb_status", q);
    assert.equal(r.entities.curbId, "C-041", q);
    assert.match(r.text, /^(C-041 is occupied|Right now C-041 \(in Lot 14\) is occupied)/, q);
    assert.match(r.text, /Lot 14/, q);
    assert.doesNotMatch(r.text, /spots are free across|free spots? out of|Garage A/, q);
  }
  const first = respond("is C-002 free right now", ctx()).text.split("\n")[0];
  assert.match(first, /C-002/);
  assert.match(first, /is free/);
  assert.match(first, /Lot 6/);
  assert.match(respond("is C-003 free", ctx()).text, /C-003[^\n]*offline, so I can't tell/);
  assert.match(respond("is C-200 taken", ctx()).text, /C-200[^\n]*not in a lot yet/);
  assert.match(respond("is C-999 free", ctx()).text, /can't find a curb called C-999|no C-999|C-999 doesn't show up/);
  assert.match(respond("is it free?", ctx(), respond("status of C-002", ctx()).state).text, /^(C-002 is free|Right now C-002)/);
  // Questions about many spots still get the site answer.
  assert.equal(intentOf("how many spots are free"), "free_total");
});

test("answers are role-aware and point viewers to a manager", () => {
  const viewer = respond("how do I change an LED colour", ctx({ role: "viewer" })).text;
  assert.match(viewer, /You're a viewer, so you can see LED settings but not change it/);
  assert.match(viewer, /Users & roles lists who they are/);
  assert.doesNotMatch(respond("how do I change an LED colour", ctx({ role: "operator" })).text, /viewer/);
  assert.match(respond("how do I add a user", ctx({ role: "operator" })).text, /Only managers can invite people, and you're an operator/);
  assert.match(respond("why can't I save", ctx({ role: "viewer" })).text, /viewer/);
  assert.match(respond("what can I do", ctx({ role: "viewer" })).text, /viewer/);
});

test("the welcome greets by time of day and name, then offers the topic menu", () => {
  const w = welcome(ctx());
  assert.match(w.text, /^Good afternoon, Dana! I'm the Smart Wheel Stop Assistant/);
  assert.deepEqual(w.chips, ["Open spots", "Offline curbs", "Low batteries", "LED help", "Users & roles", "Analytics", "What colours mean", "Switch to Simulation"]);
  assert.equal(welcome(ctx({ mode: "sim", firstName: null })).chips.at(-1), "Switch to Live");
  assert.match(welcome(ctx({ firstName: null, now: new Date(2026, 9, 28, 9).getTime() })).text, /^Good morning! /);
});

test("every chip leads to a real intent, and replies offer \"Something else\"", () => {
  const chips = new Set([...menuChips(ctx()), ...menuChips(ctx({ mode: "sim" })), ...INTENTS.flatMap((i) => i.next || [])]);
  for (const chip of chips) assert.ok(!respond(chip, ctx()).fallback, `chip "${chip}" falls back`);
  assert.equal(intentOf(SOMETHING_ELSE), "menu");
  assert.ok(respond("which curbs are offline", ctx()).chips.includes(SOMETHING_ELSE));
  const menuMap = { "Open spots": "free_total", "Offline curbs": "offline_curbs", "Low batteries": "low_battery", "LED help": "howto_led_color", "Users & roles": "explain_roles", Analytics: "howto_analytics", "What colours mean": "explain_status_colors", "Switch to Simulation": "howto_switch_mode", "Switch to Live": "howto_switch_mode" };
  for (const [chip, id] of Object.entries(menuMap)) assert.equal(intentOf(chip), id, chip);
});

// Content intents (jokes, facts, stories) have more than five variants on purpose.
const MANY = new Set(["joke", "fun_fact", "story"]);
const ENT = { curbId: "C-041", lotId: "lot14", math: { expr: "2 + 2", value: 4 } };

test(`all ${INTENTS.length} intents have 3-5 answer variants`, () => {
  assert.ok(INTENTS.length >= 150, `only ${INTENTS.length} intents`);
  assert.equal(new Set(INTENTS.map((i) => i.id)).size, INTENTS.length);
  const bad = [];
  for (const i of INTENTS) {
    const out = typeof i.say === "function" ? i.say(ctx(), ENT) : i.say;
    const variants = Array.isArray(out) ? out : out.variants;
    const n = new Set(variants).size;
    if (n < 3 || (n > 5 && !MANY.has(i.id))) bad.push(`${i.id}: ${n}`);
  }
  assert.deepEqual(bad, []);
  assert.equal(INTENT_BY_ID.joke.say.length, 40, "40 jokes");
});

test("no intent repeats the same reply twice in a row", () => {
  const first = Object.fromEntries([...CASES].reverse().map(([q, id]) => [id, q]));
  const repeated = [];
  for (const i of INTENTS) {
    const q = first[i.id];
    if (!q || i.id === "repeat") continue;
    let state = {};
    let last = null;
    const c = ctx({ random: seeded(i.id.length) });
    for (let n = 0; n < 12; n++) {
      const r = respond(q, c, state);
      if (r.text === last) { repeated.push(i.id); break; }
      last = r.text;
      state = { ...r.state, lastPaged: null };
    }
  }
  assert.deepEqual(repeated, []);
});

test("the assistant never writes, imports Firebase or calls the network", async () => {
  const root = new URL("../src/assistant/", import.meta.url);
  const files = [];
  async function walk(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.isDirectory()) await walk(new URL(`${e.name}/`, dir));
      else files.push(new URL(e.name, dir));
    }
  }
  await walk(root);
  assert.ok(files.length >= 10);
  for (const f of files) {
    const src = await readFile(f, "utf8");
    assert.doesNotMatch(src, /from ["'][^"']*firebase|fetch\(|XMLHttpRequest|WebSocket|\beval\(|new Function/, f.pathname);
  }
});

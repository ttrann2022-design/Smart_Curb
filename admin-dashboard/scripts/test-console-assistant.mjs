// Tests the company console's rule-based assistant (src/assistant/console/) without
// React or a database: example phrasings reach the right intent (typos included),
// held-out phrasings reach 80%, follow-ups use what came before, names match
// loosely and wrong names are named back, out-of-scope questions fall back
// politely, variants never repeat back to back, and the code stays read-only.
//
//   npm run test:console-assistant
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ASSISTANT_NAME, INTENTS, INTENT_BY_ID, SOMETHING_ELSE, menuChips, respond, welcome } from "../src/assistant/console/index.js";
import { EXAMPLES } from "../src/assistant/console/examples.js";
import { findCustomer, findLot } from "../src/assistant/console/entities.js";
import { CONSOLE_HOLDOUT } from "./console-assistant-holdout.mjs";

const NOW = new Date(2026, 9, 28, 15, 0, 0).getTime(); // a Wednesday, 3 PM local
const H = 3600000;
const D = 24 * H;
const DATA = {
  sites: {
    s1: { name: "Demo University", type: "campus", status: "active", contactName: "Dana Whitaker", contactEmail: "dana@demo-university.example", createdAt: NOW - 30 * D, fromLeadId: "l4" },
    s2: { name: "Broward Mall", type: "mall", status: "active", contactName: "Lee Park", contactEmail: "lee@broward.example", createdAt: NOW - 10 * D },
    s3: { name: "Harbor Point Hotel", type: "hotel", status: "prospect", contactName: "Robin Ames", createdAt: NOW - 2 * D },
    s4: { name: "Riverside Garage", type: "garage", status: "paused", createdAt: NOW - 60 * D },
  },
  lots: {
    lot14: { name: "Lot 14", siteId: "s1", totalSpots: 40, openSpots: 12, latitude: 42.36, longitude: -71.06 },
    lot6: { name: "Lot 6", siteId: "s1", totalSpots: 20, openSpots: 5 },
    mallp1: { name: "Mall P1", siteId: "s2", totalSpots: 120, openSpots: 60, latitude: 26.1, longitude: -80.2 },
    mallp2: { name: "Mall P2", siteId: "s2", openSpots: 0 },
    northgarage: { name: "North Garage", totalSpots: 80, openSpots: 80 },
  },
  units: {
    "C-001": { lot: "lot14", online: true, occupied: true, battery: 80, lastUpdated: NOW - 3 * 60000 },
    "C-002": { lot: "lot14", online: true, occupied: false, battery: 12, lastUpdated: NOW - 9 * 60000 },
    "C-041": { lot: "lot14", online: true, occupied: true, battery: 64, lastUpdated: NOW - 60000 },
    "C-003": { lot: "lot6", online: false, occupied: false, battery: 5, lastUpdated: NOW - 400 * 60000 },
    "C-095": { lot: "mallp1", online: true, occupied: false, battery: 90, lastUpdated: NOW - 2 * 60000 },
    "C-096": { lot: "mallp1", online: false, occupied: false, battery: 30, lastUpdated: NOW - 90 * 60000 },
    "C-120": { lot: "northgarage", online: true, occupied: false, battery: 55, lastUpdated: NOW - 6 * 60000 },
    "C-200": { online: true, occupied: false, battery: 70, lastUpdated: NOW - 30 * 60000 },
  },
  leads: {
    l1: { name: "Priya Raman", organization: "Westbrook University", facilityType: "university", status: "new", createdAt: NOW - 3 * D, email: "priya@example.com", message: "Two lots next semester." },
    l2: { name: "Marcus Bell", organization: "Riverside Arena", facilityType: "stadium", status: "contacted", createdAt: NOW - 26 * H, email: "marcus@example.com" },
    l3: { name: "Elena Ortiz", organization: "St. Agnes Medical Center", facilityType: "hospital", status: "new", createdAt: NOW - 5 * H, email: "elena@example.com" },
    l4: { name: "Dana Whitaker", organization: "Demo University", facilityType: "university", status: "won", siteId: "s1", createdAt: NOW - 40 * D, email: "dana@example.com" },
    l5: { name: "Jordan Lee", facilityType: "airport", status: "closed", createdAt: NOW - 12 * D, email: "jordan@example.com" },
  },
};
// A fixed sequence instead of Math.random, so runs repeat exactly.
function seeded(seed = 7) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}
const ctx = (over = {}) => ({ ...DATA, now: NOW, mode: "live", firstName: "Sam", random: seeded(), ...over });
const intentOf = (q, c = ctx(), state = {}) => respond(q, c, state).intent;
const chat = (lines, c = ctx()) => {
  let state = {};
  let r;
  for (const q of lines) { r = respond(q, c, state); state = r.state; }
  return r;
};

// ---------- Matching ----------

test(`${EXAMPLES.length} example phrasings reach the expected intent`, () => {
  assert.ok(EXAMPLES.length >= 400, `only ${EXAMPLES.length} phrasings`);
  const wrong = EXAMPLES.map(([q, want]) => ({ q, want, got: intentOf(q) })).filter((r) => r.got !== r.want);
  assert.deepEqual(wrong, [], wrong.map((r) => `"${r.q}": wanted ${r.want}, got ${r.got}`).join("\n"));
});

test(`at least 100 intents, each with two or more example phrasings`, () => {
  assert.ok(INTENTS.length >= 100, `only ${INTENTS.length} intents`);
  const counts = Object.fromEntries(INTENTS.map((i) => [i.id, 0]));
  for (const [, id] of EXAMPLES) {
    assert.ok(id in counts, `example for unknown intent ${id}`);
    counts[id] += 1;
  }
  assert.deepEqual(Object.entries(counts).filter(([, n]) => n < 2).map(([id]) => id), []);
});

const TYPOS = [
  ["how many custmers do we hav", "customer_count"], ["wich customers are pasued", "customer_paused"], ["newst requests", "request_newest"],
  ["lots withuot coordinates", "lots_no_coords"], ["how do i improt lots", "howto_import_lots"], ["unasigned lots", "lots_unassigned"],
  ["ofline curbs", "curbs_offline"], ["how do i add a platfrom admin", "howto_add_platform_admin"], ["custommer list", "customer_list"],
  ["tell me abuot Broward Mal", "customer_details"], ["how many requets this week", "request_this_week"], ["low batery by customer", "low_battery_by_customer"],
];
test("typos still reach the right intent", () => {
  const wrong = TYPOS.filter(([q, want]) => intentOf(q) !== want).map(([q, want]) => `"${q}": wanted ${want}, got ${intentOf(q)}`);
  assert.deepEqual(wrong, []);
});

test(`fresh held-out phrasings reach at least 80% (${CONSOLE_HOLDOUT.length} of them)`, () => {
  assert.ok(CONSOLE_HOLDOUT.length >= 80);
  // A multi-part reply counts when one of its answers is the expected intent.
  const misses = CONSOLE_HOLDOUT.filter(([q, want]) => !intentOf(q).split("+").includes(want));
  const rate = 1 - misses.length / CONSOLE_HOLDOUT.length;
  console.log(`  console held-out accuracy: ${CONSOLE_HOLDOUT.length - misses.length}/${CONSOLE_HOLDOUT.length} = ${(rate * 100).toFixed(1)}%`);
  if (misses.length) console.log(`  misses: ${misses.map(([q, w]) => `"${q}" (${w}, got ${intentOf(q)})`).join("; ")}`);
  assert.ok(rate >= 0.8, `held-out accuracy ${(rate * 100).toFixed(1)}%`);
});

// ---------- Conversation ----------

// [earlier messages, follow-up, expected intent, expected customer/lot/curb/request]
const FOLLOW_UPS = [
  [["tell me about Demo University"], "and Broward Mall?", "customer_details", "s2"],
  [["tell me about Demo University"], "what about its lots?", "customer_lots", "s1"],
  [["lots of Broward Mall"], "and Demo University?", "customer_lots", "s1"],
  [["who is the contact for Broward Mall"], "and for Harbor Point Hotel?", "customer_contact", "s3"],
  [["tell me about Broward Mall"], "who's the contact?", "customer_contact", "s2"],
  [["tell me about Broward Mall"], "any offline curbs there?", "customer_offline", "s2"],
  [["tell me about Broward Mall"], "how many curbs does it have", "customer_curbs", "s2"],
  [["tell me about lot 14"], "which customer owns it?", "lot_owner", "lot14"],
  [["tell me about lot 14"], "and lot 6?", "lot_details", "lot6"],
  [["who owns lot 14"], "what about North Garage", "lot_owner", "northgarage"],
  [["status of C-041"], "and C-002?", "curb_status", "C-002"],
  [["what did Priya Raman ask for"], "was it converted?", "request_converted", "l1"],
  [["was Dana Whitaker's request converted"], "and Marcus Bell?", "request_converted", "l2"],
  [["Broward Mall"], "and its lots", "customer_lots", "s2"],
];
test("follow-ups use the customer, lot, curb or request from earlier", () => {
  const wrong = [];
  for (const [before, q, want, entity] of FOLLOW_UPS) {
    const r = chat([...before, q]);
    const got = r.entities?.customerId || r.entities?.lotId || r.entities?.curbId || r.entities?.leadId || null;
    if (r.intent !== want || (entity && got !== entity)) wrong.push(`"${before.join(" / ")}" then "${q}": wanted ${want} ${entity || ""}, got ${r.intent} ${got || ""}`);
  }
  assert.deepEqual(wrong, []);
});

test("\"show me more\" pages through a long list", () => {
  const sites = {};
  for (let i = 1; i <= 20; i++) sites[`x${i}`] = { name: `Customer ${String(i).padStart(2, "0")}`, type: "other", status: "active", createdAt: NOW - i * D };
  const c = ctx({ sites });
  const first = respond("list customers", c);
  assert.match(first.text, /Customer 01[\s\S]*Customer 08/);
  assert.doesNotMatch(first.text, /Customer 09/);
  assert.match(first.text, /and 12 more/);
  const second = respond("show me more", c, first.state);
  assert.match(second.text, /Customer 09[\s\S]*Customer 16/);
  const third = respond("more", c, second.state);
  assert.match(third.text, /Customer 17[\s\S]*Customer 20/);
});

test("multi-part questions get every answer", () => {
  const r = respond("how many new requests and which curbs are offline", ctx());
  assert.deepEqual(r.intents, ["request_new_count", "curbs_offline"]);
  assert.match(r.text, /new[\s\S]*C-003/);
  // One source line, at the end.
  assert.equal((r.text.match(/From live data/g) || []).length, 1);
  const two = respond("tell me about Broward Mall and lots without coordinates", ctx());
  assert.deepEqual(two.intents, ["customer_details", "lots_no_coords"]);
});

const OUT_OF_SCOPE = [
  "what's the weather tomorrow", "who won the world cup", "recommend a movie", "write me a poem about cats", "what's the price of bitcoin",
  "translate hello into french", "book me a flight to paris", "order a pizza", "who is the president", "what is the capital of peru",
  "help me with my homework", "play some music", "what's a good recipe for pasta", "tell me the news", "how tall is mount everest",
  "what's my horoscope", "who is the richest celebrity", "can you write python code", "how do I bake bread", "what's the lottery number",
  "will it rain today", "what's the best video game", "what should I name my dog", "how far is the moon", "teach me guitar",
  "is pluto a planet", "find me a hotel in rome", "who invented the telephone", "what is quantum physics", "plan my vacation",
];
test(`${OUT_OF_SCOPE.length} out-of-scope questions get a friendly fallback with the topic menu`, () => {
  assert.ok(OUT_OF_SCOPE.length >= 30);
  const wrong = [];
  for (const q of OUT_OF_SCOPE) {
    const r = respond(q, ctx());
    if (!r.fallback) wrong.push(`"${q}" -> ${r.intent}`);
    else assert.deepEqual(r.chips, menuChips(ctx()), q);
  }
  assert.deepEqual(wrong, []);
});

// ---------- Names ----------

test("customer and lot names match loosely: partial, typos, number words, case", () => {
  for (const [q, id] of [["broward", "s2"], ["Browad Mall", "s2"], ["the demo uni", "s1"], ["harbor point", "s3"], ["riverside", "s4"], ["HARBOUR POINT HOTEL", "s3"]]) {
    assert.equal(findCustomer(`tell me about ${q}`, DATA.sites), id, q);
  }
  for (const [q, id] of [["lot fourteen", "lot14"], ["lot 6", "lot6"], ["north garage", "northgarage"], ["mall p 1", "mallp1"], ["nort garage", "northgarage"]]) {
    assert.equal(findLot(`tell me about ${q}`, DATA.lots), id, q);
  }
  // Everyday words alone don't pick a customer ("point" is a question word, not Harbor Point).
  assert.equal(findCustomer("how many lots point to a customer", DATA.sites), null);
  assert.equal(intentOf("tell me about broward"), "customer_details");
  assert.equal(intentOf("lots of the harbor point hotel"), "customer_lots");
});

test("a customer, lot or request that doesn't exist is named back with the real ones, never a total", () => {
  for (const q of ["tell me about Acme Corp", "how many lots does Acme have", "and Gotham Plaza?", "who is the contact for the customer called Initech", "Acme Corp's lots"]) {
    const r = respond(q, ctx());
    assert.equal(r.intent, "not_found", q);
    assert.match(r.text, /customer called|isn't one of the customers/, q);
    assert.match(r.text, /Customers in live data:\n• Broward Mall\n• Demo University\n• Harbor Point Hotel\n• Riverside Garage/, q);
    assert.doesNotMatch(r.text, /There are \d+ customers|in total/, q);
  }
  for (const q of ["tell me about lot 99", "who owns lot 7", "curbs in Garage Z"]) {
    const r = respond(q, ctx());
    assert.equal(r.intent, "not_found", q);
    assert.match(r.text, /lot called|isn't one of the lots/, q);
    assert.match(r.text, /Lots in live data:[\s\S]*• Lot 14[\s\S]*• North Garage/, q);
  }
  const lead = respond("was Bruce Wayne's request converted", ctx());
  assert.equal(lead.intent, "not_found");
  assert.match(lead.text, /(request from Bruce Wayne|No request comes from Bruce Wayne|Bruce Wayne hasn't sent a request)[\s\S]*Requests in live data[\s\S]*Elena Ortiz/);
  assert.match(respond("tell me about Acme", ctx({ mode: "sim" })).text, /Customers in the simulation:/);
  // The conversation keeps its topic: the next real name answers the same question.
  const state = respond("lots of Acme", ctx()).state;
  assert.equal(respond("and Broward Mall?", ctx(), state).intent, "customer_lots");
});

test("\"is C-041 free / occupied / taken?\" answers for that curb, with its lot and customer", () => {
  for (const q of ["is C-041 free", "is C-041 occupied?", "is c41 taken", "is curb 41 available"]) {
    const r = respond(q, ctx());
    assert.equal(r.intent, "curb_status", q);
    assert.match(r.text.split("\n")[0], /C-041[^\n]*occupied[^\n]*Lot 14[^\n]*Demo University|Lot 14[^\n]*Demo University[^\n]*occupied/, q);
  }
  assert.match(respond("is C-003 free", ctx()).text, /offline, so I can't tell/);
  assert.match(respond("is C-999 free", ctx()).text, /C-999/);
  assert.equal(intentOf("how many curbs are free"), "curb_total");
});

// ---------- Answers ----------

test("lot capacity comes from the curbs that report, never from totalSpots or openSpots", () => {
  // Reporting curbs: Lot 14 has 3 (1 free), Mall P1 1 of 2 (C-096 offline, free), North Garage 1 (free).
  // Lot 6's only curb is offline and Mall P2 has none. totalSpots (40, 20, 120, 80) must not appear.
  const total = respond("total spots across all lots", ctx()).text;
  assert.match(total, /5 spots of capacity|3 free of 5|Total capacity is 5 spots/);
  assert.match(total, /2 offline curbs not counted/);
  assert.match(total, /1 lot with no curbs yet/);
  assert.doesNotMatch(total, /260|\b120\b|\b80\b/);
  assert.match(respond("biggest lot", ctx()).text, /Lot 14/);
  assert.match(respond("tell me about lot 14", ctx()).text, /Capacity: 1 free of 3 \(from its curbs\)/);
  assert.match(respond("tell me about mall p1", ctx()).text, /Capacity: 1 free of 1/);
  assert.match(respond("tell me about lot 6", ctx()).text, /Capacity: No curbs reporting/);
  assert.match(respond("tell me about mall p2", ctx()).text, /Capacity: No curbs yet/);
  assert.match(respond("lots of Demo University", ctx()).text, /Lot 14: 3 curbs, 3 online · 1 free of 3/);
  assert.doesNotMatch(respond("lots of Demo University", ctx()).text, /40 spots|20 spots/);
});

test("answers use the data and say where it comes from and how fresh it is", () => {
  assert.match(respond("how many customers", ctx()).text, /4 customers[\s\S]*2 active, 1 prospect, 1 paused/);
  assert.match(respond("how many customers", ctx()).text, /From live data, read just now · newest curb reading 1 min ago\./);
  assert.match(respond("how many customers", ctx({ mode: "sim" })).text, /From the simulation \(demo data, not real customers\)/);
  assert.match(respond("lots without a customer", ctx()).text, /North Garage/);
  assert.match(respond("lots without coordinates", ctx()).text, /Lot 6[\s\S]*Mall P2[\s\S]*North Garage/);
  assert.match(respond("lots without a total size", ctx()).text, /Mall P2/);
  assert.doesNotMatch(respond("lots without a total size", ctx()).text, /Lot 14/);
  assert.match(respond("which customer has the most offline curbs", ctx()).text, /Broward Mall|Demo University/);
  assert.match(respond("requests older than 2 days with no contact", ctx()).text, /Priya Raman/);
  assert.doesNotMatch(respond("requests older than 2 days with no contact", ctx()).text, /Elena Ortiz/);
  assert.match(respond("was Dana Whitaker's request converted", ctx()).text, /Demo University/);
  assert.match(respond("customers without lots", ctx()).text, /Harbor Point Hotel[\s\S]*Riverside Garage/);
  assert.match(respond("tell me about Broward Mall", ctx()).text, /Type: mall · Status: active[\s\S]*Lee Park[\s\S]*Mall P1, Mall P2[\s\S]*2, 1 online, 1 offline/);
  assert.match(respond("which customers have real curbs", ctx()).text, /With curbs: Broward Mall \(2\), Demo University \(4\)/);
  assert.match(respond("curbs not in a lot", ctx()).text, /C-200/);
  assert.match(respond("show low batteries", ctx()).text, /C-003: 5%[\s\S]*C-002: 12%/);
  assert.match(respond("how do I import lots", ctx()).text, /id, name, customer, totalSpots, latitude, longitude[\s\S]*(optional|blank or left out)/);
  assert.doesNotMatch(respond("how do I import lots", ctx()).text, /without (it|totalSpots) (are|is) refused/);
  assert.match(respond("how do I add a platform admin", ctx()).text, /platformAdmins\/<(their )?UID>/);
  assert.match(respond("how do I delete a customer", ctx()).text, /no lots point to the customer|unassign/i);
});

test("nothing loaded says so instead of reporting zeros", () => {
  const blank = ctx({ sites: {}, lots: {}, units: {}, leads: {} });
  assert.match(respond("how many customers", blank).text, /no customers, requests, lots or curbs yet|don't see any live customers|no live data/i);
  assert.match(respond("how many customers", { ...blank, mode: "sim" }).text, /Reload demo customers/);
});

test("no answer calls a typical day \"yesterday\" or claims recorded history", () => {
  for (const q of ["compared to yesterday", "is it busier than yesterday", "how did requests trend last month", "customer growth over time"]) {
    const r = respond(q, ctx());
    assert.equal(r.intent, "history_not_recorded", q);
    assert.match(r.text, /doesn't keep history|can't do trends|No recorded history/, q);
  }
  // Across every intent's answers, "yesterday" only ever appears to say it can't be compared.
  for (const intent of INTENTS) {
    const out = intent.say instanceof Function ? intent.say(ctx(), { customerId: "s2", lotId: "lot14", curbId: "C-041", leadId: "l1", math: { expr: "2 + 2", value: 4 } }) : intent.say;
    const variants = Array.isArray(out) ? out : out.variants;
    for (const v of variants) if (/yesterday/i.test(v)) assert.match(v, /can't compare with yesterday/, intent.id);
  }
});

test("the welcome greets by time of day and name, names the assistant, then offers the topic menu", () => {
  const morning = welcome(ctx({ now: new Date(2026, 9, 28, 9).getTime() }));
  assert.match(morning.text, new RegExp(`^Good morning, Sam! I'm the ${ASSISTANT_NAME}\\.`));
  assert.match(welcome(ctx({ now: new Date(2026, 9, 28, 20).getTime(), firstName: null })).text, /^Good evening! /);
  assert.match(welcome(ctx({ mode: "sim" })).text, /simulated customers/);
  assert.deepEqual(morning.chips, menuChips(ctx()));
});

test("every chip leads to a real intent, and replies offer \"Something else\"", () => {
  const chips = new Set([...menuChips(ctx()), ...menuChips(ctx({ mode: "sim" })), ...INTENTS.flatMap((i) => i.next || [])]);
  for (const chip of chips) assert.ok(!respond(chip, ctx()).fallback, `chip "${chip}" falls back`);
  assert.equal(intentOf(SOMETHING_ELSE), "menu");
  assert.ok(respond("which curbs are offline", ctx()).chips.includes(SOMETHING_ELSE));
});

// Content intents (jokes, facts, stories) have more than five variants on purpose.
const MANY = new Set(["joke", "fun_fact", "story"]);
const ENT = { customerId: "s2", lotId: "lot14", curbId: "C-041", leadId: "l1", math: { expr: "2 + 2", value: 4 } };
test(`all ${INTENTS.length} intents have 3-5 answer variants`, () => {
  for (const intent of INTENTS) {
    for (const ent of [ENT, {}]) {
      const out = intent.say instanceof Function ? intent.say(ctx(), ent) : intent.say;
      const n = (Array.isArray(out) ? out : out.variants).length;
      if (MANY.has(intent.id)) assert.ok(n >= 5, intent.id);
      else assert.ok(n >= 3 && n <= 5, `${intent.id} has ${n} variants`);
    }
  }
});

test("no intent repeats the same reply twice in a row", () => {
  for (const intent of INTENTS) {
    const ask = EXAMPLES.find(([, id]) => id === intent.id)?.[0];
    if (!ask || intent.id === "more" || intent.id === "repeat") continue;
    let state = {};
    let last = null;
    const c = ctx({ random: seeded(11) });
    for (let i = 0; i < 6; i++) {
      const r = respond(ask, c, state);
      if (r.intent !== intent.id) break;
      assert.notEqual(r.text, last, `${intent.id} repeated "${r.text.slice(0, 40)}"`);
      last = r.text;
      state = r.state;
    }
  }
});

// ---------- Boundaries ----------

const CONSOLE_DIR = fileURLToPath(new URL("../src/assistant/console/", import.meta.url));
const ENGINE_DIR = fileURLToPath(new URL("../src/assistant/engine/", import.meta.url));
const UNIT_STATUS = fileURLToPath(new URL("../src/unitStatus.js", import.meta.url));
async function sources(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await sources(p));
    else if (/\.(js|jsx)$/.test(e.name)) out.push([p, await readFile(p, "utf8")]);
  }
  return out;
}
test("the console assistant never writes, imports Firebase, calls the network, or uses the dashboard Assistant's files", async () => {
  for (const [file, src] of [...await sources(CONSOLE_DIR), ...await sources(ENGINE_DIR)]) {
    assert.doesNotMatch(src, /from\s+["'][^"']*firebase|\bfetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|indexedDB/, file);
    // Only the console assistant's own files, the shared engine, and the pure unitStatus.js.
    for (const [, from] of src.matchAll(/from\s+["']([^"']+)["']/g)) {
      const target = resolve(dirname(file), from);
      assert.ok(target.startsWith(CONSOLE_DIR) || target.startsWith(ENGINE_DIR) || target === UNIT_STATUS, `${file} imports ${from}`);
    }
  }
});

test("intent ids are unique", () => {
  assert.equal(Object.keys(INTENT_BY_ID).length, INTENTS.length);
});

// Tests the company console's lot import (src/console/lotImport.js) without a
// database: CSV parsing, the checks on every row, and writing in batches through a
// fake writer that applies the same lot rules as database.rules.json.
//
//   npm run test:import
import { test } from "node:test";
import assert from "node:assert/strict";
import { BATCH_SIZE, parseCsv, planImport, rowUpdates, runImport } from "../src/console/lotImport.js";

const SITES = { s1: { name: "Northfield University" }, s2: { name: "Harbor Mall" }, s3: { name: "Twin" }, s4: { name: "Twin" } };
const LOTS = {
  lot14: { name: "Lot 14", totalSpots: 40, openSpots: 12, siteId: "s1", latitude: 1, longitude: 2, units: { "C-041": true } },
  lot6: { name: "Lot 6", totalSpots: 20, openSpots: 5, siteId: "s1" },
  loose: { name: "Loose lot", totalSpots: 8, openSpots: 8 },
  mall1: { name: "Mall P1", totalSpots: 100, openSpots: 60, siteId: "s2" },
};
const HEADER = "id,name,customer,totalSpots,latitude,longitude";
const csv = (...lines) => [HEADER, ...lines].join("\n");
const plan = (text, lots = LOTS) => planImport(text, lots, SITES);
const byId = (p) => Object.fromEntries(p.rows.map((r) => [r.id || `line${r.line}`, r]));

// ---------- Parsing ----------

test("parses quoted values with commas, quotes and newlines, CRLF, a BOM and blank lines", () => {
  const p = parseCsv(`\uFEFF${HEADER}\r\nga2,"Garage A, Level 2","Harbor Mall",50,,\r\n\r\nq1,"Say ""hi""",Harbor Mall,5,1,2\nml,"Two\nlines",Harbor Mall,5,,\n`);
  assert.deepEqual(p.header, ["id", "name", "customer", "totalSpots", "latitude", "longitude"]);
  assert.deepEqual(p.rows.map((r) => r.cells[1]), ["Garage A, Level 2", 'Say "hi"', "Two\nlines"]);
  // Each row keeps the line it starts on (the header is line 1).
  assert.deepEqual(p.rows.map((r) => r.line), [2, 4, 5]);
});

test("the header may be in any order and any case; missing, unknown or doubled columns are refused", () => {
  assert.deepEqual(parseCsv("Total Spots,ID,Name,Customer\n5,a,A,Harbor Mall").header, ["totalSpots", "id", "name", "customer"]);
  // totalSpots is optional, so its column may be left out; id, name and customer may not.
  assert.deepEqual(parseCsv("id,name,customer\na,A,Harbor Mall").header, ["id", "name", "customer"]);
  assert.match(parseCsv("name,customer\nA,Harbor Mall").error, /needs id/);
  assert.match(parseCsv(`${HEADER},colour\n`).error, /Unknown column "colour"/);
  assert.match(parseCsv("id,name,customer,totalSpots,id\n").error, /"id" twice/);
  assert.match(parseCsv("").error, /Paste CSV text/);
  assert.match(parseCsv(HEADER).error, /no rows/);
  assert.match(parseCsv(`${HEADER}\na,"open quote,Harbor Mall,5,,`).error, /never closed/);
  assert.match(parseCsv(`${HEADER}\n${"a,A,Harbor Mall,5,,\n".repeat(2001)}`).error, /up to 2,000 rows/);
});

// ---------- Checks on each row ----------

test("a clean paste: new lots and updates, with the right fields", () => {
  const p = plan(csv("newlot,New Lot,Harbor Mall,30,10.5,-20.25", "lot14,Lot 14,Northfield University,45,,", "lot6,Lot 6,Northfield University,20,3,4"));
  const r = byId(p);
  assert.equal(r.newlot.status, "new");
  assert.deepEqual(r.newlot.fields, { name: "New Lot", totalSpots: 30, siteId: "s2", latitude: 10.5, longitude: -20.25 });
  assert.equal(r.lot14.status, "update");
  // A blank location keeps the current one: only totalSpots changes.
  assert.deepEqual(r.lot14.fields, { totalSpots: 45 });
  assert.deepEqual(r.lot6.fields, { latitude: 3, longitude: 4 });
  assert.ok(p.rows.every((x) => x.status !== "error"));
});

test("a new lot gets only what the row gives: never openSpots, and no totalSpots or location when blank", () => {
  const r = byId(plan(csv("nolocation,No Location,Harbor Mall,7,,", "nosize,No Size,Harbor Mall,,1,2", "bare,Bare,Harbor Mall,,,")));
  assert.deepEqual(r.nolocation.fields, { name: "No Location", totalSpots: 7, siteId: "s2" });
  assert.deepEqual(r.nosize.fields, { name: "No Size", siteId: "s2", latitude: 1, longitude: 2 });
  assert.deepEqual(r.bare.fields, { name: "Bare", siteId: "s2" });
  assert.ok(Object.values(r).every((x) => x.status === "new" && !("openSpots" in x.fields)));
});

test("ids: lowercase letters and numbers only, at most 80, and not twice in one paste", () => {
  const r = byId(plan(csv("Lot1,A,Harbor Mall,5,,", "lot-1,A,Harbor Mall,5,,", "lot_1,A,Harbor Mall,5,,", ",A,Harbor Mall,5,,",
    `${"a".repeat(81)},A,Harbor Mall,5,,`, "dup,A,Harbor Mall,5,,", "ok1,A,Harbor Mall,5,,", "dup,B,Harbor Mall,6,,")));
  for (const id of ["Lot1", "lot-1", "lot_1"]) assert.match(r[id].errors.join(" "), /lowercase letters and numbers/, id);
  assert.match(r.line5.errors.join(" "), /id is missing/);
  assert.match(r["a".repeat(81)].errors.join(" "), /longer than 80/);
  // Both copies of a duplicate are errors, naming the lines.
  const dups = plan(csv("dup,A,Harbor Mall,5,,", "dup,B,Harbor Mall,6,,")).rows;
  assert.ok(dups.every((x) => x.status === "error" && /on more than one line \(2, 3\)/.test(x.errors.join(" "))));
  assert.equal(r.ok1.status, "new");
});

test("names: 1 to 80 characters", () => {
  const p = plan(csv("a1,,Harbor Mall,5,,", `a2,${"n".repeat(81)},Harbor Mall,5,,`, `a3,${"n".repeat(80)},Harbor Mall,5,,`));
  const [a1, a2, a3] = p.rows;
  assert.match(a1.errors.join(" "), /name is missing/);
  assert.match(a2.errors.join(" "), /longer than 80/);
  assert.equal(a3.status, "new");
});

test("totalSpots: optional (capacity comes from the curbs), and a whole number from 1 to 5000 when given", () => {
  for (const bad of ["0", "5001", "1.5", "-3", "ten", "12.0", "1e3"]) {
    const [row] = plan(csv(`t,T,Harbor Mall,${bad},,`)).rows;
    assert.equal(row.status, "error", `"${bad}"`);
    assert.match(row.errors.join(" "), /whole number from 1 to 5,000/, `"${bad}"`);
  }
  for (const good of ["1", "5000", "0042", ""]) assert.equal(plan(csv(`t,T,Harbor Mall,${good},,`)).rows[0].status, "new", good);
  // A header without a totalSpots column imports too: new lots get no totalSpots.
  const p = plan("id,name,customer\nt,T,Harbor Mall\nlot6,Lot 6,Northfield University");
  assert.equal(p.error, undefined);
  const r = byId(p);
  assert.deepEqual(r.t.fields, { name: "T", siteId: "s2" });
  // An existing lot keeps its totalSpots when the row has none.
  assert.equal(r.lot6.status, "update");
  assert.deepEqual(r.lot6.fields, {});
});

test("latitude -90..90 and longitude -180..180, both or neither", () => {
  const errs = (lat, lng) => plan(csv(`g,G,Harbor Mall,5,${lat},${lng}`)).rows[0].errors?.join(" ") || "";
  assert.match(errs("90.1", "0"), /latitude must be/);
  assert.match(errs("-91", "0"), /latitude must be/);
  assert.match(errs("0", "180.5"), /longitude must be/);
  assert.match(errs("abc", "0"), /latitude must be/);
  assert.match(errs("10", ""), /both latitude and longitude/);
  assert.match(errs("", "10"), /both latitude and longitude/);
  assert.equal(errs("-90", "180"), "");
  assert.equal(errs("90", "-180"), "");
  assert.equal(errs(".5", "+1."), "");
});

test("customer: an existing customer, by exact name", () => {
  const r = byId(plan(csv("c1,C,harbor mall,5,,", "c2,C,Nobody Inc,5,,", "c3,C,Twin,5,,", "c4,C,,5,,", "c5,C,  Harbor Mall  ,5,,")));
  assert.match(r.c1.errors.join(" "), /No customer is called "harbor mall" \(did you mean "Harbor Mall"\?\)/);
  assert.match(r.c2.errors.join(" "), /No customer is called "Nobody Inc"\./);
  assert.match(r.c3.errors.join(" "), /More than one customer is called "Twin"/);
  assert.match(r.c4.errors.join(" "), /customer is missing/);
  assert.equal(r.c5.siteId, "s2");
});

test("a row with more values than the header is an error; fewer means the rest are empty", () => {
  const [extra, short] = plan(csv("x1,Garage A, Level 2,Harbor Mall,5,,", "x2,X,Harbor Mall,5")).rows;
  assert.match(extra.errors.join(" "), /7 values but the header has 6/);
  assert.equal(short.status, "new");
});

test("every problem on a row is listed, not just the first", () => {
  const [row] = plan(csv("BAD,,Nobody,0,100,")).rows;
  assert.equal(row.errors.length, 6);
});

test("existing lots: only totalSpots and location change, never the name, siteId or customer", () => {
  const r = byId(plan(csv("lot14,Renamed Lot,Northfield University,40,1,2", "loose,Loose,Harbor Mall,9,,", "mall1,Mall P1,Northfield University,100,,")));
  // Nothing differs except the name, which is never written.
  assert.equal(r.lot14.status, "update");
  assert.deepEqual(r.lot14.fields, {});
  assert.deepEqual(r.lot14.notes, ['Name stays "Lot 14".', "Nothing to change."]);
  // A lot without a customer keeps none.
  assert.deepEqual(r.loose.fields, { totalSpots: 9 });
  assert.match(r.loose.notes.join(" "), /Stays without a customer/);
  // A lot that belongs to someone else isn't touched.
  assert.equal(r.mall1.status, "error");
  assert.match(r.mall1.errors.join(" "), /belongs to "Harbor Mall"; an import can't move it/);
});

test("the paths written: one whole new lot, or single fields of an existing one", () => {
  const r = byId(plan(csv("newlot,New,Harbor Mall,5,1,2", "lot14,Lot 14,Northfield University,41,5,6", "lot6,Lot 6,Northfield University,20,,")));
  assert.deepEqual(rowUpdates(r.newlot), { "lots/newlot": { name: "New", totalSpots: 5, siteId: "s2", latitude: 1, longitude: 2 } });
  assert.deepEqual(rowUpdates(r.lot14), { "lots/lot14/totalSpots": 41, "lots/lot14/latitude": 5, "lots/lot14/longitude": 6 });
  assert.deepEqual(rowUpdates(r.lot6), {});
  for (const path of Object.keys(rowUpdates(r.lot14))) assert.match(path, /^lots\/lot14\/(totalSpots|latitude|longitude)$/);
});

// ---------- Writing in batches ----------

// A fake database with the lot rules: a new lot only where none exists, with name
// and siteId, and openSpots only alongside an equal totalSpots; an existing lot only gets totalSpots, latitude and
// longitude; nothing is deleted; siteId must be an existing customer. A multi-path
// write is all or nothing, like the Realtime Database.
function fakeDb(lots, { refuse = () => false } = {}) {
  const db = structuredClone(lots);
  const calls = [];
  const write = async (updates) => {
    calls.push(Object.keys(updates).length);
    const next = structuredClone(db);
    for (const [path, value] of Object.entries(updates)) {
      const [root, id, field, ...rest] = path.split("/");
      const fail = (why) => { throw Object.assign(new Error(`PERMISSION_DENIED: ${path} ${why}`), { code: "PERMISSION_DENIED" }); };
      if (root !== "lots" || rest.length || value === null || refuse(id)) fail("refused");
      if (!field) {
        if (db[id]) fail("exists");
        if (!value.name || ("openSpots" in value && value.openSpots !== value.totalSpots) || !SITES[value.siteId]) fail("invalid");
        next[id] = value;
      } else {
        if (!db[id]) fail("missing");
        if (!["totalSpots", "latitude", "longitude"].includes(field)) fail("field");
        next[id][field] = value;
      }
    }
    for (const k of Object.keys(next)) db[k] = next[k];
  };
  return { db, write, calls };
}

const manyNew = (n, start = 0) => Array.from({ length: n }, (_, i) => `bulk${start + i},Bulk ${start + i},Harbor Mall,${10 + i},,`);

test(`51+ rows go in batches of ${BATCH_SIZE}, and every lot lands`, async () => {
  const p = plan(csv(...manyNew(60), "lot14,Lot 14,Northfield University,99,,"));
  const { db, write, calls } = fakeDb(LOTS);
  const progress = [];
  const { summary, results } = await runImport(p.rows, write, { onProgress: (x) => progress.push(x) });
  assert.deepEqual(calls, [25, 25, 11]);
  assert.deepEqual(progress.map((x) => x.done), [25, 50, 61]);
  assert.deepEqual(summary, { created: 60, updated: 1, unchanged: 0, failed: 0, skipped: 0, notWritten: 0 });
  assert.equal(Object.keys(db).length, Object.keys(LOTS).length + 60);
  assert.deepEqual(db.bulk59, { name: "Bulk 59", totalSpots: 69, siteId: "s2" });
  assert.ok(results.every((x) => x.outcome === "created" || x.outcome === "updated"));
});

test("an existing lot keeps its name, openSpots, siteId, units and everything else", async () => {
  const p = plan(csv("lot14,Something Else,Northfield University,77,8.5,9.5"));
  const { db, write } = fakeDb(LOTS);
  await runImport(p.rows, write);
  assert.deepEqual(db.lot14, { ...LOTS.lot14, totalSpots: 77, latitude: 8.5, longitude: 9.5 });
});

test("a row the database refuses fails alone; the rest of its batch and later batches still land", async () => {
  const p = plan(csv(...manyNew(30), "bad1,Bad,Harbor Mall,5,,", ...manyNew(20, 30)));
  const { db, write, calls } = fakeDb(LOTS, { refuse: (id) => id === "bad1" });
  const { summary, results } = await runImport(p.rows, write);
  assert.deepEqual(summary, { created: 50, updated: 0, unchanged: 0, failed: 1, skipped: 0, notWritten: 0 });
  const failed = results.find((x) => x.outcome === "failed");
  assert.equal(failed.row.id, "bad1");
  assert.match(failed.error, /database refused it/);
  assert.equal(db.bad1, undefined);
  assert.ok(db.bulk49);
  // Batch 1 lands whole, batch 2 is refused and retried row by row (25 single writes), batch 3 lands whole.
  assert.deepEqual(calls, [25, 25, ...Array(25).fill(1), 1]);
});

test("a lot created by someone else after the preview is refused, not overwritten", async () => {
  const p = plan(csv("race,Race,Harbor Mall,5,,", "fine,Fine,Harbor Mall,5,,"));
  const { db, write } = fakeDb({ ...LOTS, race: { name: "Theirs", totalSpots: 3, openSpots: 1, siteId: "s1" } });
  const { summary } = await runImport(p.rows, write);
  assert.deepEqual(db.race, { name: "Theirs", totalSpots: 3, openSpots: 1, siteId: "s1" });
  assert.equal(summary.failed, 1);
  assert.equal(summary.created, 1);
});

test("error rows are skipped, unchanged rows aren't written, and nothing is ever deleted", async () => {
  const p = plan(csv("BAD,X,Harbor Mall,5,,", "lot6,Lot 6,Northfield University,20,,", "fresh,Fresh,Harbor Mall,5,,"));
  const { db, write, calls } = fakeDb(LOTS);
  const { summary } = await runImport(p.rows, write);
  assert.deepEqual(summary, { created: 1, updated: 0, unchanged: 1, failed: 0, skipped: 1, notWritten: 0 });
  assert.deepEqual(calls, [1]);
  for (const id of Object.keys(LOTS)) assert.ok(db[id], id);
});

test("stopping (the page closed or the mode changed) leaves later batches unwritten", async () => {
  const p = plan(csv(...manyNew(60)));
  const { write, calls } = fakeDb(LOTS);
  let n = 0;
  const { summary, stopped } = await runImport(p.rows, write, { shouldStop: () => n++ >= 1 });
  assert.equal(stopped, true);
  assert.deepEqual(calls, [25]);
  assert.deepEqual({ created: summary.created, notWritten: summary.notWritten }, { created: 25, notWritten: 35 });
});

test("the import module stays free of Firebase and the network", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../src/console/lotImport.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /from\s+["'](firebase|\.\.?\/)/);
  assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|WebSocket/);
});

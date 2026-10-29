// The customer dashboard's scoping (src/scope.js). Plain Node, no network.
//   npm run test:scope
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ALL, NONE, isPartial, resolveScope, scopeByCurb, scopeData, scopeUsers } from "../src/scope.js";

// Two customers (FAU, Broward), a lot with no customer, and curbs in each, in a
// lot that's gone, and in no lot at all.
const LOTS = {
  fau1: { name: "FAU Lot 1", siteId: "fau" },
  fau2: { name: "FAU Garage", siteId: "fau" },
  mall1: { name: "Mall P1", siteId: "broward" },
  loose: { name: "Loose lot" },
  other: { name: "Someone else", siteId: "elsewhere" },
};
const UNITS = {
  "C-001": { lot: "fau1", online: true },
  "C-002": { lot: "fau2", online: false },
  "C-095": { lot: "mall1", online: true },
  "C-096": { lot: "mall1", online: true },
  "C-100": { lot: "loose", online: true },
  "C-200": { lot: "gone", online: true },
  "C-300": { online: true },
  "C-400": { lot: "other", online: true },
};
const DATA = { lots: LOTS, units: UNITS };
const ids = (o) => Object.keys(o).sort();

test("a platform admin sees every customer by default, or the one chosen", () => {
  assert.deepEqual(resolveScope({ mode: "live", isPlatformAdmin: true }), ALL);
  assert.deepEqual(resolveScope({ mode: "live", isPlatformAdmin: true, viewing: "all" }), ALL);
  assert.deepEqual(resolveScope({ mode: "live", isPlatformAdmin: true, viewing: "broward" }), { kind: "site", siteId: "broward" });
  // Their own users/<uid>/siteId doesn't narrow it; their pick does.
  assert.deepEqual(resolveScope({ mode: "live", isPlatformAdmin: true, siteId: "fau" }), ALL);
  // A broken pick falls back to all.
  assert.deepEqual(resolveScope({ mode: "live", isPlatformAdmin: true, viewing: "a/b" }), ALL);

  const all = scopeData(DATA, ALL);
  assert.deepEqual(all, DATA);
  const broward = scopeData(DATA, resolveScope({ mode: "live", isPlatformAdmin: true, viewing: "broward" }));
  assert.deepEqual(ids(broward.lots), ["mall1"]);
  assert.deepEqual(ids(broward.units), ["C-095", "C-096"]);
});

test("an account with a siteId sees only that customer's lots and their curbs", () => {
  const scope = resolveScope({ mode: "live", isPlatformAdmin: false, siteId: "fau" });
  assert.deepEqual(scope, { kind: "site", siteId: "fau" });
  // A non-admin can't widen it by "viewing" something else.
  assert.deepEqual(resolveScope({ mode: "live", siteId: "fau", viewing: "all" }), scope);
  assert.deepEqual(resolveScope({ mode: "live", siteId: "fau", viewing: "broward" }), scope);
  const fau = scopeData(DATA, scope);
  assert.deepEqual(ids(fau.lots), ["fau1", "fau2"]);
  assert.deepEqual(ids(fau.units), ["C-001", "C-002"]);
});

test("lots with another siteId or none, and curbs whose lot is missing, are left out", () => {
  const { lots, units } = scopeData(DATA, { kind: "site", siteId: "broward" });
  for (const id of ["fau1", "fau2", "loose", "other"]) assert.ok(!(id in lots), id);
  // C-200's lot doesn't exist, C-300 has none, C-100 is in a lot with no customer.
  for (const id of ["C-001", "C-002", "C-100", "C-200", "C-300", "C-400"]) assert.ok(!(id in units), id);
  // A customer with no lots gets nothing, not everything.
  assert.deepEqual(scopeData(DATA, { kind: "site", siteId: "nobody" }), { lots: {}, units: {} });
  // With every customer in view, curbs outside any lot still show (as unassigned).
  assert.ok("C-200" in scopeData(DATA, ALL).units && "C-300" in scopeData(DATA, ALL).units);
});

test("an account that isn't linked sees nothing", () => {
  for (const siteId of [undefined, null, "", 5, "a/b", { id: "fau" }]) {
    assert.deepEqual(resolveScope({ mode: "live", isPlatformAdmin: false, siteId }), NONE, String(siteId));
  }
  assert.deepEqual(scopeData(DATA, NONE), { lots: {}, units: {} });
  assert.deepEqual(scopeUsers({ a: { siteId: "fau" } }, NONE), {});
  assert.deepEqual(scopeByCurb({ "C-001": {} }, {}, NONE), {});
});

test("Simulation is unscoped for everyone, even unlinked accounts", () => {
  for (const who of [{ isPlatformAdmin: true, viewing: "broward" }, { siteId: "fau" }, {}]) {
    assert.deepEqual(resolveScope({ mode: "sim", ...who }), ALL, JSON.stringify(who));
  }
});

test("bad data never widens the scope", () => {
  const messy = { lots: { a: null, b: "x", c: { siteId: "fau" } }, units: { u1: null, u2: { lot: "c" }, u3: { lot: "constructor" }, u4: { lot: "toString" } } };
  const { lots, units } = scopeData(messy, { kind: "site", siteId: "fau" });
  assert.deepEqual(ids(lots), ["c"]);
  assert.deepEqual(ids(units), ["u2"]);
  assert.deepEqual(scopeData({ lots: null, units: undefined }, { kind: "site", siteId: "fau" }), { lots: {}, units: {} });
});

test("per-curb records and the Users list follow the same scope", () => {
  const scope = { kind: "site", siteId: "broward" };
  const { units } = scopeData(DATA, scope);
  assert.deepEqual(ids(scopeByCurb({ "C-001": 1, "C-095": 2, "C-999": 3 }, units, scope)), ["C-095"]);
  const users = { a: { siteId: "broward" }, b: { siteId: "fau" }, c: { role: "viewer" } };
  // One customer's staff, plus accounts not linked yet (just invited).
  assert.deepEqual(ids(scopeUsers(users, scope)), ["a", "c"]);
  assert.deepEqual(ids(scopeUsers(users, ALL)), ["a", "b", "c"]);
  assert.equal(isPartial(ALL), false);
  assert.equal(isPartial(scope), true);
});

test("the scope module stays free of Firebase and the network", async () => {
  const src = await readFile(new URL("../src/scope.js", import.meta.url), "utf8");
  const code = src.replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /^import /m);
  assert.doesNotMatch(code, /fetch\(|firebase|XMLHttpRequest/i);
});

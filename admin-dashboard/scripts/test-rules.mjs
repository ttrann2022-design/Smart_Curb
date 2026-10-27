// Tests database.rules.json against the local Realtime Database emulator.
// It never talks to the real database: the host must be localhost, and every
// request goes to a throwaway emulator namespace.
//
//   1. Start the emulator:   npm run emulators   (needs Java 21)
//   2. In another terminal:  npm run test:rules
//
// Uses the emulator's REST API with unsigned mock tokens, so it needs no extra packages.
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9000";
if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(HOST)) {
  throw new Error(`Refusing to run rules tests against ${HOST}: only a local emulator is allowed.`);
}
const NS = "sws-rules-test";
const RULES = new URL("../database.rules.json", import.meta.url);

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");

// Unsigned token the emulator accepts as a signed-in user.
function mockToken(uid, email) {
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: "none", typ: "JWT" })}.${b64({
    iss: `https://securetoken.google.com/${NS}`, aud: NS, iat: now, exp: now + 3600, auth_time: now,
    sub: uid, user_id: uid, email, email_verified: true,
    firebase: { sign_in_provider: "password", identities: {} },
  })}.`;
}

const OWNER = "owner"; // emulator admin: bypasses rules, used only for setup
const AS = {
  manager: mockToken("mgr", "mgr@example.com"),
  operator: mockToken("op", "op@example.com"),
  viewer: mockToken("view", "view@example.com"),
  driver: mockToken("driver", "driver@example.com"), // signed in, but not staff
  signedOut: null,
};

// The emulator treats any "Authorization: Bearer" token as an admin, so the owner
// uses that header and users send their token as ?auth= (checked against the rules).
async function call(method, path, token, body) {
  const auth = token && token !== OWNER ? `&auth=${token}` : "";
  const res = await fetch(`http://${HOST}/${path}.json?ns=${NS}${auth}`, {
    method,
    headers: token === OWNER ? { Authorization: `Bearer ${OWNER}` } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : null };
}

const RECEIVER_FIELDS = { occupied: true, lastUpdated: 1760000000000, lastSnapshot: "snap.jpg" };
const SAMPLE = { eventAgeMs: 210, rxToWriteMs: 48, lastUpdated: 1760000000000 };

async function seed() {
  const res = await call("PUT", "", OWNER, {
    users: {
      mgr: { email: "mgr@example.com", role: "manager" },
      op: { email: "op@example.com", role: "operator" },
      view: { email: "view@example.com", role: "viewer" },
    },
    units: {
      "C-001": { lot: "lot14", ledColor: "blue", panelText: "LOT 14", ...RECEIVER_FIELDS },
      "C-002": { lot: "lot14", ledColor: "red", panelText: "LOT 14", ledBrightness: 40, ...RECEIVER_FIELDS },
    },
    latency: { "C-001": { s1: SAMPLE } },
  });
  assert.ok(res.ok, `seeding failed: ${res.status}`);
}

// update() in the SDK is a PATCH: it only touches the fields it names.
const patchUnit = (who, fields, id = "C-001") => call("PATCH", `units/${id}`, AS[who], fields);
const allowed = (r) => assert.ok(r.ok, `expected allowed, got ${r.status} ${JSON.stringify(r.body)}`);
const denied = (r) => assert.ok(!r.ok, `expected denied, got ${r.status}`);

before(async () => {
  try {
    await fetch(`http://${HOST}/.json?ns=${NS}`);
  } catch {
    throw new Error(`No database emulator at ${HOST}. Start it with: npm run emulators`);
  }
  const res = await fetch(`http://${HOST}/.settings/rules.json?ns=${NS}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${OWNER}` },
    body: await readFile(RULES, "utf8"),
  });
  assert.ok(res.ok, `loading rules failed: ${res.status} ${await res.text()}`);
});

beforeEach(seed);

// ---------- ledBrightness ----------

test("operator can set ledBrightness to a valid value", async () => {
  allowed(await patchUnit("operator", { ledBrightness: 50 }));
  assert.equal((await call("GET", "units/C-001/ledBrightness", null)).body, 50);
});

test("manager can set ledBrightness to the 0 and 100 limits", async () => {
  allowed(await patchUnit("manager", { ledBrightness: 0 }));
  allowed(await patchUnit("manager", { ledBrightness: 100 }));
});

test("ledBrightness 101 is rejected", async () => {
  denied(await patchUnit("manager", { ledBrightness: 101 }));
});

test("ledBrightness -1 is rejected", async () => {
  denied(await patchUnit("manager", { ledBrightness: -1 }));
});

test("ledBrightness as a string is rejected", async () => {
  denied(await patchUnit("manager", { ledBrightness: "50" }));
});

test("ledBrightness must be a whole number", async () => {
  denied(await patchUnit("manager", { ledBrightness: 50.5 }));
});

test("viewer cannot write ledBrightness", async () => {
  denied(await patchUnit("viewer", { ledBrightness: 50 }));
  assert.equal((await call("GET", "units/C-002/ledBrightness", null)).body, 40);
  denied(await patchUnit("viewer", { ledBrightness: 50 }, "C-002"));
  assert.equal((await call("GET", "units/C-002/ledBrightness", null)).body, 40);
});

test("signed-out users and driver accounts cannot write ledBrightness", async () => {
  denied(await patchUnit("signedOut", { ledBrightness: 50 }));
  denied(await patchUnit("driver", { ledBrightness: 50 }));
});

test("writing ledBrightness keeps the Receiver's fields", async () => {
  allowed(await patchUnit("operator", { ledBrightness: 75 }));
  const unit = (await call("GET", "units/C-001", null)).body;
  assert.equal(unit.ledBrightness, 75);
  assert.equal(unit.occupied, RECEIVER_FIELDS.occupied);
  assert.equal(unit.lastUpdated, RECEIVER_FIELDS.lastUpdated);
  assert.equal(unit.lastSnapshot, RECEIVER_FIELDS.lastSnapshot);
  assert.equal(unit.ledColor, "blue");
});

test("replacing a whole unit with set() is rejected", async () => {
  denied(await call("PUT", "units/C-001", AS.manager, { ledColor: "blue", ledBrightness: 50 }));
});

// ---------- Existing unit rules (regression) ----------

test("operator can still set ledColor and panelText together", async () => {
  allowed(await patchUnit("operator", { ledColor: "gold", panelText: "LOT 6" }));
});

test("ledColor outside the zone list is rejected", async () => {
  denied(await patchUnit("manager", { ledColor: "purple" }));
});

test("panelText over 16 characters is rejected", async () => {
  denied(await patchUnit("manager", { panelText: "THIS IS TOO LONG!" }));
});

test("viewer cannot write ledColor or panelText", async () => {
  denied(await patchUnit("viewer", { ledColor: "red" }));
  denied(await patchUnit("viewer", { panelText: "HI" }));
});

test("staff cannot write the Receiver's fields", async () => {
  denied(await patchUnit("manager", { occupied: false }));
  denied(await patchUnit("manager", { lastUpdated: 1 }));
  denied(await patchUnit("manager", { lastSnapshot: "x" }));
});

test("anyone can read units (the lot sign runs signed out)", async () => {
  allowed(await call("GET", "units", null));
});

// ---------- Latency samples (read-only) ----------

test("staff can read latency samples", async () => {
  for (const who of ["viewer", "operator", "manager"]) {
    const r = await call("GET", "latency", AS[who]);
    allowed(r);
    assert.deepEqual(r.body["C-001"].s1, SAMPLE);
    allowed(await call("GET", "latency/C-001/s1", AS[who]));
  }
});

test("signed-out users and driver accounts cannot read latency samples", async () => {
  denied(await call("GET", "latency", AS.signedOut));
  denied(await call("GET", "latency/C-001", AS.signedOut));
  denied(await call("GET", "latency", AS.driver));
  denied(await call("GET", "latency/C-001/s1", AS.driver));
});

test("no client can write latency samples, even a manager", async () => {
  for (const who of ["manager", "operator", "viewer", "driver", "signedOut"]) {
    denied(await call("PUT", "latency/C-001/s2", AS[who], SAMPLE));
    denied(await call("PATCH", "latency/C-001/s1", AS[who], { rxToWriteMs: 1 }));
    denied(await call("DELETE", "latency/C-001", AS[who]));
    denied(await call("PUT", "latency", AS[who], {}));
  }
  assert.deepEqual((await call("GET", "latency/C-001/s1", OWNER)).body, SAMPLE);
});

// ---------- Simulation area ----------

test("staff can write simulated latency under demo/latency, others cannot", async () => {
  allowed(await call("PUT", "demo/latency/C-001/s0", AS.viewer, SAMPLE));
  denied(await call("PUT", "demo/latency/C-001/s1", null, SAMPLE));
  denied(await call("PUT", "demo/latency/C-001/s1", AS.driver, SAMPLE));
});

test("staff can write ledBrightness under demo/, signed-out users cannot", async () => {
  allowed(await call("PATCH", "demo/units/C-001", AS.viewer, { ledBrightness: 30 }));
  denied(await call("PATCH", "demo/units/C-001", null, { ledBrightness: 30 }));
});

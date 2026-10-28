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
import { THEME_IDS } from "../src/themes.js";

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
  // Vendor account for the company console: platformAdmins/pa = true, no users/ record.
  platformAdmin: mockToken("pa", "pa@example.com"),
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
const SITE = {
  siteName: "North Campus",
  contact: { name: "Dana Ops", email: "dana@example.com", phone: "555 0100" },
  facilityType: "university",
  modules: { permitTiers: true, semesterCalendar: true, eventMode: false },
  setupComplete: true,
};
// The REST equivalent of serverTimestamp().
const SERVER_TIME = { ".sv": "timestamp" };
// What the website form sends for a new quote request.
const LEAD = {
  name: "Priya Raman", email: "priya@example.com", organization: "Westbrook University",
  facilityType: "university", message: "Two lots to start.", status: "new", createdAt: SERVER_TIME,
};
const LEAD_SAVED = { ...LEAD, createdAt: 1760000000000 };
// A customer site as the company console saves it.
const CUSTOMER = {
  name: "Westbrook University", type: "campus", status: "prospect",
  contactName: "Priya Raman", contactEmail: "priya@example.com", notes: "Two lots to start.",
  fromLeadId: "lead1", createdAt: 1760000000000,
};
const { fromLeadId: _unused, ...DEMO_CUSTOMER } = CUSTOMER;

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
      // Reported in, but not in a lot yet.
      "C-050": { online: true, ...RECEIVER_FIELDS },
    },
    lots: { lot14: { name: "Lot 14" }, lot06: { name: "Lot 6" } },
    latency: { "C-001": { s1: SAMPLE } },
    config: { site: SITE },
    leads: { lead1: LEAD_SAVED },
    platformAdmins: { pa: true },
    sites: { site1: CUSTOMER },
    // Only the console's simulated sites; demo/leads stays empty (tests below rely on it).
    demo: { sites: { site1: DEMO_CUSTOMER } },
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

// ---------- Assigning curbs to lots (Setup, Connect curbs) ----------

test("a manager can put a reported curb into a lot", async () => {
  allowed(await patchUnit("manager", { lot: "lot06" }, "C-050"));
  const unit = (await call("GET", "units/C-050", null)).body;
  assert.equal(unit.lot, "lot06");
  assert.equal(unit.occupied, RECEIVER_FIELDS.occupied);
  assert.equal(unit.lastUpdated, RECEIVER_FIELDS.lastUpdated);
});

test("a manager can move a curb to another lot", async () => {
  allowed(await patchUnit("manager", { lot: "lot06" }, "C-001"));
});

test("operators and viewers cannot change a curb's lot", async () => {
  denied(await patchUnit("operator", { lot: "lot06" }, "C-050"));
  denied(await patchUnit("viewer", { lot: "lot06" }, "C-050"));
  denied(await patchUnit("signedOut", { lot: "lot06" }, "C-050"));
  denied(await patchUnit("driver", { lot: "lot06" }, "C-050"));
  assert.equal((await call("GET", "units/C-050/lot", null)).body, null);
});

test("a curb can only go into a lot that exists", async () => {
  denied(await patchUnit("manager", { lot: "lot99" }, "C-050"));
  denied(await patchUnit("manager", { lot: 6 }, "C-050"));
});

test("assigning a lot can't create a unit that never reported", async () => {
  denied(await patchUnit("manager", { lot: "lot06" }, "C-999"));
  assert.equal((await call("GET", "units/C-999", null)).body, null);
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

// ---------- Site config (Setup wizard) ----------

const patchSite = (who, fields) => call("PATCH", "config/site", AS[who], fields);

test("staff can read the site config", async () => {
  for (const who of ["viewer", "operator", "manager"]) {
    const r = await call("GET", "config/site", AS[who]);
    allowed(r);
    assert.deepEqual(r.body, SITE);
  }
});

test("signed-out users and driver accounts cannot read the site config", async () => {
  denied(await call("GET", "config/site", AS.signedOut));
  denied(await call("GET", "config", AS.signedOut));
  denied(await call("GET", "config/site", AS.driver));
});

test("a manager can write the whole site config", async () => {
  allowed(await call("PUT", "config/site", AS.manager, { ...SITE, siteName: "Stadium Lots", facilityType: "stadium", modules: { eventMode: true } }));
  const site = (await call("GET", "config/site", OWNER)).body;
  assert.equal(site.siteName, "Stadium Lots");
  assert.deepEqual(site.modules, { eventMode: true });
});

test("a manager can save one wizard step at a time", async () => {
  await call("DELETE", "config/site", OWNER);
  allowed(await patchSite("manager", { siteName: "North Campus", contact: { name: "Dana Ops", email: "dana@example.com" }, setupComplete: false }));
  allowed(await patchSite("manager", { facilityType: "hospital", modules: { patientPriority: true, staffShifts: false } }));
  allowed(await patchSite("manager", { setupComplete: true }));
});

test("operators and viewers cannot write the site config", async () => {
  for (const who of ["operator", "viewer"]) {
    denied(await patchSite(who, { siteName: "Mine now" }));
    denied(await patchSite(who, { setupComplete: false }));
    denied(await call("PUT", "config/site", AS[who], SITE));
    denied(await call("DELETE", "config/site", AS[who]));
  }
  assert.deepEqual((await call("GET", "config/site", OWNER)).body, SITE);
});

test("signed-out users and driver accounts cannot write the site config", async () => {
  denied(await patchSite("signedOut", { siteName: "x" }));
  denied(await patchSite("driver", { siteName: "x" }));
});

test("nothing else under config is writable, even by a manager", async () => {
  denied(await call("PUT", "config/other", AS.manager, { a: 1 }));
  denied(await call("PUT", "config", AS.manager, { site: SITE }));
});

test("site config fields are validated", async () => {
  denied(await patchSite("manager", { siteName: "" }));
  denied(await patchSite("manager", { siteName: "x".repeat(81) }));
  denied(await patchSite("manager", { siteName: 7 }));
  denied(await patchSite("manager", { facilityType: "casino" }));
  denied(await patchSite("manager", { modules: { teleporter: true } }));
  denied(await patchSite("manager", { modules: { eventMode: "yes" } }));
  denied(await patchSite("manager", { setupComplete: "true" }));
  denied(await patchSite("manager", { contact: { name: "Dana Ops", email: "not an email" } }));
  denied(await patchSite("manager", { contact: { name: "Dana Ops" } }));
  denied(await patchSite("manager", { contact: { ...SITE.contact, fax: "555" } }));
  denied(await patchSite("manager", { logoUrl: "https://example.com/logo.png" }));
});

test("setupComplete can't turn true before the site has a name and facility type", async () => {
  await call("DELETE", "config/site", OWNER);
  denied(await patchSite("manager", { setupComplete: true }));
  allowed(await patchSite("manager", { siteName: "North Campus", setupComplete: false }));
  denied(await patchSite("manager", { setupComplete: true }));
  allowed(await patchSite("manager", { facilityType: "city" }));
  allowed(await patchSite("manager", { setupComplete: true }));
});

// ---------- Site theme ----------

// Each site config (live and simulated) gets the same theme checks.
for (const [label, path] of [["config/site", "config/site"], ["demo/config/site", "demo/config/site"]]) {
  test(`a manager can set every theme at ${label}`, async () => {
    for (const theme of THEME_IDS) {
      allowed(await call("PATCH", path, AS.manager, { theme }));
      assert.equal((await call("GET", `${path}/theme`, OWNER)).body, theme);
      allowed(await call("PUT", `${path}/theme`, AS.manager, theme));
    }
  });

  test(`viewers, operators, drivers and signed-out users can't set the theme at ${label}`, async () => {
    allowed(await call("PATCH", path, AS.manager, { theme: "ember" }));
    for (const who of ["operator", "viewer", "driver", "signedOut"]) {
      denied(await call("PATCH", path, AS[who], { theme: "mint" }));
      denied(await call("PUT", `${path}/theme`, AS[who], "mint"));
      denied(await call("DELETE", `${path}/theme`, AS[who]));
    }
    assert.equal((await call("GET", `${path}/theme`, OWNER)).body, "ember");
  });

  test(`only the six theme names are accepted at ${label}`, async () => {
    for (const theme of ["red", "Lime", "LIME", " lime", "lime ", "", "midnight-blue", "default"]) {
      denied(await call("PATCH", path, AS.manager, { theme }));
    }
    for (const theme of [7, true, { name: "lime" }, ["lime"]]) {
      denied(await call("PATCH", path, AS.manager, { theme }));
    }
  });
}

test("the theme saves alongside the wizard's fields and doesn't upset setupComplete", async () => {
  await call("DELETE", "config/site", OWNER);
  // Theme alone, before anything else exists: fine, and setup is still not complete.
  allowed(await patchSite("manager", { theme: "paper" }));
  denied(await patchSite("manager", { setupComplete: true }));
  // The wizard's last step saves the theme with setupComplete in one write.
  allowed(await patchSite("manager", { siteName: "North Campus", facilityType: "city", setupComplete: false }));
  allowed(await patchSite("manager", { theme: "violet", setupComplete: true }));
  const site = (await call("GET", "config/site", OWNER)).body;
  assert.equal(site.theme, "violet");
  assert.equal(site.setupComplete, true);
  // A bad theme fails the whole write, setupComplete included.
  allowed(await patchSite("manager", { setupComplete: false }));
  denied(await patchSite("manager", { theme: "red", setupComplete: true }));
  assert.equal((await call("GET", "config/site/setupComplete", OWNER)).body, false);
});

// ---------- Quote requests (leads) ----------

const ALL = ["platformAdmin", "manager", "operator", "viewer", "driver", "signedOut"];
const createLead = (who, lead, id = "new1") => call("PUT", `leads/${id}`, AS[who], lead);
const savedLead = async (id) => (await call("GET", `leads/${id}`, OWNER)).body;

test("anyone, even signed out, can create a valid lead", async () => {
  for (const [i, who] of ALL.entries()) allowed(await createLead(who, LEAD, `new${i}`));
  const lead = await savedLead("new5");
  assert.equal(lead.status, "new");
  assert.equal(typeof lead.createdAt, "number");
});

test("organization and message are optional", async () => {
  const minimal = { ...LEAD };
  delete minimal.organization;
  delete minimal.message;
  allowed(await createLead("signedOut", minimal));
});

test("a lead's name must be 1 to 80 characters", async () => {
  denied(await createLead("signedOut", { ...LEAD, name: "" }, "a"));
  allowed(await createLead("signedOut", { ...LEAD, name: "x".repeat(80) }, "b"));
  denied(await createLead("signedOut", { ...LEAD, name: "x".repeat(81) }, "c"));
  denied(await createLead("signedOut", { ...LEAD, name: 42 }, "d"));
});

test("a lead's email must look like an email and be under 120 characters", async () => {
  for (const email of ["not an email", "a@b", "@example.com", "a b@example.com", 7]) {
    denied(await createLead("signedOut", { ...LEAD, email }));
  }
  const local = "x".repeat(107); // 107 + "@example.com" = 119
  allowed(await createLead("signedOut", { ...LEAD, email: `${local}@example.com` }, "ok119"));
  denied(await createLead("signedOut", { ...LEAD, email: `${local}x@example.com` }, "no120"));
});

test("organization must be under 120 and message under 1000 characters", async () => {
  allowed(await createLead("signedOut", { ...LEAD, organization: "o".repeat(119) }, "a"));
  denied(await createLead("signedOut", { ...LEAD, organization: "o".repeat(120) }, "b"));
  allowed(await createLead("signedOut", { ...LEAD, message: "m".repeat(999) }, "c"));
  denied(await createLead("signedOut", { ...LEAD, message: "m".repeat(1000) }, "d"));
  denied(await createLead("signedOut", { ...LEAD, message: 5 }, "e"));
});

test("facilityType must be one of the presets", async () => {
  for (const facilityType of ["university", "stadium", "airport", "hospital", "shopping", "city"]) {
    allowed(await createLead("signedOut", { ...LEAD, facilityType }, `ft-${facilityType}`));
  }
  denied(await createLead("signedOut", { ...LEAD, facilityType: "casino" }));
  denied(await createLead("signedOut", { ...LEAD, facilityType: "University" }));
});

test("a new lead's status must be \"new\"", async () => {
  denied(await createLead("signedOut", { ...LEAD, status: "contacted" }, "a"));
  denied(await createLead("signedOut", { ...LEAD, status: "closed" }, "b"));
  denied(await createLead("manager", { ...LEAD, status: "closed" }, "c"));
});

test("createdAt must be the server timestamp", async () => {
  denied(await createLead("signedOut", { ...LEAD, createdAt: 1760000000000 }, "a"));
  denied(await createLead("signedOut", { ...LEAD, createdAt: Date.now() + 86400000 }, "b"));
  denied(await createLead("signedOut", { ...LEAD, createdAt: "now" }, "c"));
});

test("required fields can't be left out and extra fields are rejected", async () => {
  for (const field of ["name", "email", "facilityType", "status", "createdAt"]) {
    const lead = { ...LEAD };
    delete lead[field];
    denied(await createLead("signedOut", lead, `missing-${field}`));
  }
  denied(await createLead("signedOut", { ...LEAD, phone: "555 0100" }));
  denied(await createLead("signedOut", { ...LEAD, status: "new", priority: "high" }));
  // A lone field at a new key isn't a lead.
  denied(await call("PUT", "leads/lone/status", AS.signedOut, "new"));
});

test("a lead can't be overwritten, even by a manager or platform admin", async () => {
  for (const who of ALL) {
    denied(await createLead(who, LEAD, "lead1"));
    denied(await call("PATCH", "leads/lead1", AS[who], { name: "Changed", message: "Changed" }));
    denied(await call("PUT", "leads/lead1/email", AS[who], "changed@example.com"));
  }
  denied(await call("PUT", "leads", AS.manager, { lead1: LEAD }));
  denied(await call("PUT", "leads", AS.platformAdmin, { lead1: LEAD }));
  assert.deepEqual(await savedLead("lead1"), LEAD_SAVED);
});

test("only platform admins can read leads, not even managers", async () => {
  const r = await call("GET", "leads", AS.platformAdmin);
  allowed(r);
  assert.deepEqual(r.body.lead1, LEAD_SAVED);
  allowed(await call("GET", "leads/lead1", AS.platformAdmin));
  for (const who of ["manager", "operator", "viewer", "driver", "signedOut"]) {
    denied(await call("GET", "leads", AS[who]));
    denied(await call("GET", "leads/lead1", AS[who]));
    denied(await call("GET", "leads/lead1/email", AS[who]));
  }
});

test("platform admins move a lead between new, contacted and closed", async () => {
  for (const status of ["contacted", "closed", "new"]) {
    allowed(await call("PATCH", "leads/lead1", AS.platformAdmin, { status }));
    assert.equal((await savedLead("lead1")).status, status);
  }
  allowed(await call("PUT", "leads/lead1/status", AS.platformAdmin, "contacted"));
  denied(await call("PATCH", "leads/lead1", AS.platformAdmin, { status: "archived" }));
  denied(await call("DELETE", "leads/lead1/status", AS.platformAdmin));
  denied(await call("PATCH", "leads/lead1", AS.platformAdmin, { status: "closed", name: "Changed" }));
  denied(await call("PATCH", "leads/ghost", AS.platformAdmin, { status: "contacted" }));
});

test("only platform admins can change a lead's status, not even managers", async () => {
  for (const who of ["manager", "operator", "viewer", "driver", "signedOut"]) {
    denied(await call("PATCH", "leads/lead1", AS[who], { status: "closed" }));
    denied(await call("PUT", "leads/lead1/status", AS[who], "contacted"));
  }
  assert.equal((await savedLead("lead1")).status, "new");
});

test("only platform admins can delete a lead, not even managers", async () => {
  for (const who of ["manager", "operator", "viewer", "driver", "signedOut"]) {
    denied(await call("DELETE", "leads/lead1", AS[who]));
  }
  assert.ok(await savedLead("lead1"));
  allowed(await call("DELETE", "leads/lead1", AS.platformAdmin));
  assert.equal(await savedLead("lead1"), null);
  denied(await call("DELETE", "leads", AS.manager));
  denied(await call("DELETE", "leads", AS.platformAdmin));
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

test("staff can still write the rest of the simulation area", async () => {
  allowed(await call("PATCH", "", AS.operator, {
    "demo/lots/lot06": { name: "Lot 6", units: { "C-001": true } },
    "demo/units/C-001": { lot: "lot06", occupied: true, online: true },
    "demo/history/week": { Mon: [1, 2] },
    "demo/simLock": { owner: "x", heartbeat: 1 },
  }));
  allowed(await call("PATCH", "demo/units/C-090", AS.manager, { lot: "lot06" }));
  denied(await call("PATCH", "demo/units/C-090", AS.driver, { lot: "lot06" }));
});

test("only managers write the simulated site config, with the same validation", async () => {
  allowed(await call("PUT", "demo/config/site", AS.manager, SITE));
  allowed(await call("PATCH", "demo/config/site", AS.manager, { setupComplete: false }));
  for (const who of ["operator", "viewer", "driver", "signedOut"]) {
    denied(await call("PATCH", "demo/config/site", AS[who], { siteName: "Mine now" }));
  }
  denied(await call("PATCH", "demo/config/site", AS.manager, { facilityType: "casino" }));
  denied(await call("PATCH", "demo/config/site", AS.manager, { logoUrl: "https://example.com/logo.png" }));
  denied(await call("PUT", "demo/config/other", AS.manager, { a: 1 }));
  // A staff write to the whole demo/ node would skip these rules, so it's refused.
  denied(await call("PUT", "demo", AS.manager, { config: { site: { siteName: "x" } } }));
});

test("signed-out visitors and driver accounts cannot write demo/leads at all", async () => {
  for (const who of ["signedOut", "driver"]) {
    denied(await call("PUT", "demo/leads/v1", AS[who], LEAD));
    denied(await call("PATCH", "", AS[who], { "demo/leads/v2": LEAD }));
    denied(await call("PUT", "demo/leads", AS[who], { x: LEAD }));
  }
  assert.equal((await call("GET", "demo/leads", OWNER)).body, null);
});

test("staff can still send fake quote requests and change their status in Simulation", async () => {
  // Same shapes as the simulator: a whole fake list on reset, or one new request.
  allowed(await call("PATCH", "", AS.operator, { "demo/leads": { lead00: { ...LEAD_SAVED, status: "contacted" } } }));
  allowed(await call("PATCH", "", AS.operator, { "demo/leads/k1": { ...LEAD_SAVED, createdAt: 1760000500000 } }));
  allowed(await call("PATCH", "demo/leads/lead00", AS.manager, { status: "closed" }));
  assert.equal((await call("GET", "demo/leads/lead00/status", null)).body, "closed");
  assert.equal(await savedLead("k1"), null, "a simulated lead must not reach the real leads/");
});

test("simulated site config never reaches the real config/site", async () => {
  allowed(await call("PATCH", "demo/config/site", AS.manager, { siteName: "Simulated Site" }));
  assert.deepEqual((await call("GET", "config/site", OWNER)).body, SITE);
});

// ---------- Company console: platform admins ----------

const STAFF = ["manager", "operator", "viewer"];
const NOT_ADMIN = [...STAFF, "driver", "signedOut"];

for (const root of ["", "demo/"]) {
  test(`a signed-in user can read only their own ${root}platformAdmins entry`, async () => {
    if (root) await call("PUT", "demo/platformAdmins", OWNER, { pa: true });
    const r = await call("GET", `${root}platformAdmins/pa`, AS.platformAdmin);
    allowed(r);
    assert.equal(r.body, true);
    // A non-admin reading their own (missing) entry gets null, which is how the console says no.
    for (const who of ["manager", "operator", "viewer", "driver"]) {
      const uid = { manager: "mgr", operator: "op", viewer: "view", driver: "driver" }[who];
      const own = await call("GET", `${root}platformAdmins/${uid}`, AS[who]);
      allowed(own);
      assert.equal(own.body, null);
      denied(await call("GET", `${root}platformAdmins/pa`, AS[who]));
    }
    denied(await call("GET", `${root}platformAdmins/pa`, AS.signedOut));
    // Nobody lists the whole set, not even a platform admin.
    for (const who of ["platformAdmin", ...NOT_ADMIN]) denied(await call("GET", `${root}platformAdmins`, AS[who]));
  });

  test(`no client can write ${root}platformAdmins, not even a platform admin`, async () => {
    for (const who of ["platformAdmin", ...NOT_ADMIN]) {
      const uid = who === "platformAdmin" ? "pa" : "mgr";
      denied(await call("PUT", `${root}platformAdmins/${uid}`, AS[who], true));
      denied(await call("PUT", `${root}platformAdmins/someoneElse`, AS[who], true));
      denied(await call("PATCH", "", AS[who], { [`${root}platformAdmins/${uid}`]: true }));
      denied(await call("DELETE", `${root}platformAdmins/pa`, AS[who]));
      denied(await call("PUT", `${root}platformAdmins`, AS[who], { [uid]: true }));
    }
    assert.equal((await call("GET", "platformAdmins/mgr", OWNER)).body, null);
    assert.equal((await call("GET", "platformAdmins/pa", OWNER)).body, true);
  });
}

test("a platformAdmins entry that isn't exactly true grants nothing", async () => {
  await call("PUT", "platformAdmins/pa", OWNER, "true");
  denied(await call("GET", "sites", AS.platformAdmin));
  denied(await call("GET", "leads", AS.platformAdmin));
  await call("PUT", "platformAdmins/pa", OWNER, 1);
  denied(await call("GET", "sites", AS.platformAdmin));
});

test("a demo/platformAdmins entry alone doesn't open the console's data", async () => {
  await call("PUT", "demo/platformAdmins/mgr", OWNER, true);
  denied(await call("GET", "demo/sites", AS.manager));
  denied(await call("GET", "sites", AS.manager));
  denied(await call("PUT", "demo/sites/s2", AS.manager, { ...DEMO_CUSTOMER, createdAt: SERVER_TIME }));
});

// ---------- Company console: sites (live and simulated) ----------

for (const root of ["", "demo/"]) {
  const base = root === "" ? CUSTOMER : DEMO_CUSTOMER;
  const fresh = { ...base, createdAt: SERVER_TIME };
  const saved = async (id) => (await call("GET", `${root}sites/${id}`, OWNER)).body;

  test(`only platform admins can read ${root}sites`, async () => {
    const r = await call("GET", `${root}sites`, AS.platformAdmin);
    allowed(r);
    assert.deepEqual(r.body.site1, base);
    allowed(await call("GET", `${root}sites/site1/name`, AS.platformAdmin));
    for (const who of NOT_ADMIN) {
      denied(await call("GET", `${root}sites`, AS[who]));
      denied(await call("GET", `${root}sites/site1`, AS[who]));
      denied(await call("GET", `${root}sites/site1/contactEmail`, AS[who]));
    }
  });

  test(`a platform admin can create, edit and delete ${root}sites`, async () => {
    allowed(await call("PUT", `${root}sites/s2`, AS.platformAdmin, fresh));
    assert.equal(typeof (await saved("s2")).createdAt, "number");
    for (const type of ["campus", "mall", "garage", "hotel", "other"]) allowed(await call("PATCH", `${root}sites/s2`, AS.platformAdmin, { type }));
    for (const status of ["prospect", "active", "paused"]) allowed(await call("PATCH", `${root}sites/s2`, AS.platformAdmin, { status }));
    allowed(await call("PATCH", `${root}sites/s2`, AS.platformAdmin, { name: "Renamed", notes: "", contactName: "" }));
    // Optional fields can be cleared, and a site needs only name, type, status and createdAt.
    allowed(await call("PATCH", `${root}sites/s2`, AS.platformAdmin, { contactName: null, contactEmail: null, notes: null, fromLeadId: null }));
    const minimal = { name: "Bare", type: "other", status: "prospect", createdAt: SERVER_TIME };
    allowed(await call("PUT", `${root}sites/s3`, AS.platformAdmin, minimal));
    allowed(await call("DELETE", `${root}sites/s3`, AS.platformAdmin));
    assert.equal(await saved("s3"), null);
    // Not the whole list at once.
    denied(await call("PUT", `${root}sites`, AS.platformAdmin, { s9: fresh }));
    denied(await call("DELETE", `${root}sites`, AS.platformAdmin));
  });

  test(`customer roles, drivers and signed-out users can't write ${root}sites`, async () => {
    for (const who of NOT_ADMIN) {
      denied(await call("PUT", `${root}sites/s2`, AS[who], fresh));
      denied(await call("PATCH", `${root}sites/site1`, AS[who], { status: "active" }));
      denied(await call("PUT", `${root}sites/site1/name`, AS[who], "Mine now"));
      denied(await call("DELETE", `${root}sites/site1`, AS[who]));
      denied(await call("PATCH", "", AS[who], { [`${root}sites/s4`]: fresh }));
    }
    assert.deepEqual(await saved("site1"), base);
    assert.equal(await saved("s2"), null);
  });

  test(`${root}sites type and status must be from the lists`, async () => {
    for (const type of ["university", "Campus", "", "parking", 3]) denied(await call("PATCH", `${root}sites/site1`, AS.platformAdmin, { type }));
    for (const status of ["closed", "Active", "", "deleted", true]) denied(await call("PATCH", `${root}sites/site1`, AS.platformAdmin, { status }));
    denied(await call("PUT", `${root}sites/s2`, AS.platformAdmin, { ...fresh, type: "stadium" }));
    denied(await call("PUT", `${root}sites/s2`, AS.platformAdmin, { ...fresh, status: "new" }));
  });

  test(`${root}sites text fields have length limits`, async () => {
    allowed(await call("PATCH", `${root}sites/site1`, AS.platformAdmin, { name: "x".repeat(80) }));
    denied(await call("PATCH", `${root}sites/site1`, AS.platformAdmin, { name: "x".repeat(81) }));
    denied(await call("PATCH", `${root}sites/site1`, AS.platformAdmin, { name: "" }));
    denied(await call("PATCH", `${root}sites/site1`, AS.platformAdmin, { name: 7 }));
    allowed(await call("PATCH", `${root}sites/site1`, AS.platformAdmin, { notes: "n".repeat(500) }));
    denied(await call("PATCH", `${root}sites/site1`, AS.platformAdmin, { notes: "n".repeat(501) }));
    allowed(await call("PATCH", `${root}sites/site1`, AS.platformAdmin, { contactName: "c".repeat(80) }));
    denied(await call("PATCH", `${root}sites/site1`, AS.platformAdmin, { contactName: "c".repeat(81) }));
    allowed(await call("PATCH", `${root}sites/site1`, AS.platformAdmin, { contactEmail: `${"e".repeat(108)}@example.com` }));
    denied(await call("PATCH", `${root}sites/site1`, AS.platformAdmin, { contactEmail: `${"e".repeat(109)}@example.com` }));
    for (const contactEmail of ["not an email", "a@b", "", 5]) denied(await call("PATCH", `${root}sites/site1`, AS.platformAdmin, { contactEmail }));
  });

  test(`${root}sites need their required fields, reject extras and keep createdAt`, async () => {
    for (const field of ["name", "type", "status", "createdAt"]) {
      const site = { ...fresh };
      delete site[field];
      denied(await call("PUT", `${root}sites/s2`, AS.platformAdmin, site));
    }
    denied(await call("PATCH", `${root}sites/site1`, AS.platformAdmin, { name: null }));
    denied(await call("PUT", `${root}sites/s2`, AS.platformAdmin, { ...fresh, phone: "555" }));
    denied(await call("PATCH", `${root}sites/site1`, AS.platformAdmin, { ownerUid: "mgr" }));
    // createdAt is server time on create, then can't change.
    denied(await call("PUT", `${root}sites/s2`, AS.platformAdmin, { ...fresh, createdAt: 1760000000000 }));
    denied(await call("PATCH", `${root}sites/site1`, AS.platformAdmin, { createdAt: SERVER_TIME }));
    denied(await call("PATCH", `${root}sites/site1`, AS.platformAdmin, { createdAt: 1 }));
    allowed(await call("PUT", `${root}sites/site1`, AS.platformAdmin, { ...base, status: "active" }));
  });

  test(`${root}sites fromLeadId must name an existing ${root}leads entry`, async () => {
    await call("PUT", `${root}leads/lead7`, OWNER, LEAD_SAVED);
    allowed(await call("PATCH", `${root}sites/site1`, AS.platformAdmin, { fromLeadId: "lead7" }));
    denied(await call("PATCH", `${root}sites/site1`, AS.platformAdmin, { fromLeadId: "ghost" }));
    denied(await call("PATCH", `${root}sites/site1`, AS.platformAdmin, { fromLeadId: 7 }));
    denied(await call("PATCH", `${root}sites/site1`, AS.platformAdmin, { fromLeadId: "lead7/email" }));
    denied(await call("PATCH", `${root}sites/site1`, AS.platformAdmin, { fromLeadId: "" }));
    denied(await call("PUT", `${root}sites/s2`, AS.platformAdmin, { ...fresh, fromLeadId: "ghost" }));
    // A site can still be saved after its lead is deleted, as long as fromLeadId doesn't change.
    await call("DELETE", `${root}leads/lead7`, OWNER);
    allowed(await call("PATCH", `${root}sites/site1`, AS.platformAdmin, { status: "active", fromLeadId: "lead7" }));
  });
}

test("live and simulated sites stay apart", async () => {
  allowed(await call("PUT", "demo/sites/sim1", AS.platformAdmin, { ...DEMO_CUSTOMER, createdAt: SERVER_TIME }));
  assert.equal((await call("GET", "sites/sim1", OWNER)).body, null);
  // A live lead doesn't satisfy a simulated site's fromLeadId.
  denied(await call("PATCH", "demo/sites/sim1", AS.platformAdmin, { fromLeadId: "lead1" }));
});

// ---------- Company console: lots/<id>/siteId ----------

for (const root of ["", "demo/"]) {
  const lotPath = `${root}lots/lot14`;

  test(`a platform admin can put a ${root}lot into an existing site, move it and remove it`, async () => {
    if (root) await call("PUT", "demo/lots", OWNER, { lot14: { name: "Lot 14" }, lot06: { name: "Lot 6" } });
    await call("PUT", `${root}sites/site2`, OWNER, { ...DEMO_CUSTOMER, name: "Second" });
    allowed(await call("PATCH", lotPath, AS.platformAdmin, { siteId: "site1" }));
    allowed(await call("PUT", `${lotPath}/siteId`, AS.platformAdmin, "site2"));
    assert.equal((await call("GET", `${lotPath}/siteId`, null)).body, "site2");
    allowed(await call("DELETE", `${lotPath}/siteId`, AS.platformAdmin));
    assert.deepEqual((await call("GET", lotPath, null)).body, { name: "Lot 14" });
  });

  test(`${root}lots siteId must be an existing site, and only on an existing lot`, async () => {
    if (root) await call("PUT", "demo/lots", OWNER, { lot14: { name: "Lot 14" } });
    denied(await call("PATCH", lotPath, AS.platformAdmin, { siteId: "ghost" }));
    denied(await call("PATCH", lotPath, AS.platformAdmin, { siteId: 1 }));
    denied(await call("PATCH", lotPath, AS.platformAdmin, { siteId: "" }));
    // Paths would reach other nodes (sites/site1/name exists), so only a single key passes.
    denied(await call("PATCH", lotPath, AS.platformAdmin, { siteId: "site1/name" }));
    denied(await call("PATCH", lotPath, AS.platformAdmin, { siteId: "site1/" }));
    denied(await call("PATCH", `${root}lots/lot99`, AS.platformAdmin, { siteId: "site1" }));
    assert.equal((await call("GET", `${root}lots/lot99`, OWNER)).body, null);
  });

  test(`customer roles, drivers and signed-out users can't set ${root}lots siteId`, async () => {
    if (root) await call("PUT", "demo/lots", OWNER, { lot14: { name: "Lot 14", siteId: "site1" } });
    else await call("PUT", `${lotPath}/siteId`, OWNER, "site1");
    await call("PUT", `${root}sites/site2`, OWNER, { ...DEMO_CUSTOMER, name: "Second" });
    for (const who of NOT_ADMIN) {
      denied(await call("PATCH", lotPath, AS[who], { siteId: "site2" }));
      denied(await call("PUT", `${lotPath}/siteId`, AS[who], "site2"));
      denied(await call("PATCH", "", AS[who], { [`${lotPath}/siteId`]: "site2" }));
    }
    assert.equal((await call("GET", `${lotPath}/siteId`, OWNER)).body, "site1");
  });

  test(`a platform admin can't touch the rest of a ${root}lot`, async () => {
    if (root) await call("PUT", "demo/lots", OWNER, { lot14: { name: "Lot 14" } });
    denied(await call("PATCH", lotPath, AS.platformAdmin, { name: "Mine" }));
    denied(await call("PUT", lotPath, AS.platformAdmin, { name: "Lot 14", siteId: "site1" }));
    denied(await call("PUT", `${root}lots/lot50`, AS.platformAdmin, { name: "New lot" }));
  });
}

test("live lots keep their rules: public read, no client writes", async () => {
  for (const who of ["platformAdmin", ...NOT_ADMIN]) allowed(await call("GET", "lots", AS[who]));
  for (const who of STAFF) {
    denied(await call("PATCH", "lots/lot14", AS[who], { name: "Changed" }));
    denied(await call("PUT", "lots/lot50", AS[who], { name: "New" }));
  }
  assert.deepEqual((await call("GET", "lots/lot14", OWNER)).body, { name: "Lot 14" });
});

test("Simulation lots keep their rules: public read, staff write, reset can drop siteId", async () => {
  await call("PUT", "demo/lots", OWNER, { lot14: { name: "Lot 14", siteId: "site1" } });
  for (const who of ["platformAdmin", ...NOT_ADMIN]) allowed(await call("GET", "demo/lots", AS[who]));
  for (const who of STAFF) allowed(await call("PATCH", "demo/lots/lot14", AS[who], { openSpots: 3, totalSpots: 9 }));
  // The simulator's reset rewrites demo/lots without siteId.
  allowed(await call("PATCH", "", AS.operator, { "demo/lots": { lot06: { name: "Lot 6", units: { "C-001": true } } } }));
  // But staff can't set siteId, even inside a whole-lot write.
  denied(await call("PATCH", "", AS.manager, { "demo/lots": { lot06: { name: "Lot 6", siteId: "site1" } } }));
  for (const who of ["driver", "signedOut"]) denied(await call("PATCH", "demo/lots/lot06", AS[who], { name: "x" }));
});

// ---------- Simulation reads after demo/ lost its blanket .read ----------

test("the public still reads every part of the simulation it read before", async () => {
  await call("PATCH", "demo", OWNER, { units: { "C-001": { lot: "lot06" } }, history: { week: { Mon: [1] } }, latency: { "C-001": { s0: SAMPLE } }, simLock: { owner: "x" }, config: { site: SITE }, leads: { l1: LEAD_SAVED } });
  for (const path of ["units", "lots", "history", "latency", "simLock", "config", "config/site", "leads", "leads/l1"]) {
    for (const who of ["signedOut", "driver", "viewer"]) allowed(await call("GET", `demo/${path}`, AS[who]));
  }
});

test("platform admins can change a simulated lead's status, but not create or edit one", async () => {
  await call("PUT", "demo/leads/l1", OWNER, LEAD_SAVED);
  for (const status of ["contacted", "closed", "new"]) allowed(await call("PATCH", "demo/leads/l1", AS.platformAdmin, { status }));
  denied(await call("PATCH", "demo/leads/l1", AS.platformAdmin, { status: "archived" }));
  denied(await call("PATCH", "demo/leads/ghost", AS.platformAdmin, { status: "new" }));
  denied(await call("PATCH", "demo/leads/l1", AS.platformAdmin, { name: "Changed" }));
  denied(await call("PUT", "demo/leads/l2", AS.platformAdmin, LEAD_SAVED));
});

import { ref, get, push, update, serverTimestamp } from "firebase/database";
import { database } from "../firebase";
import { SIM_ROOT, getDataMode } from "../dataMode";

// Fake customers and quote requests for the console's Simulation mode. Everything
// here reads and writes ONLY under demo/, never through dataPath(), so it can't
// touch live data even if the mode changes mid-write.
if (SIM_ROOT !== "demo/") throw new Error("Simulation root must be demo/.");
const sim = (path) => SIM_ROOT + path;

function writeSim(updates) {
  Object.keys(updates).forEach((k) => {
    if (!k.startsWith(SIM_ROOT)) throw new Error(`Refusing to write outside the simulation: ${k}`);
  });
  return update(ref(database), updates);
}

function requireSim() {
  if (getDataMode() !== "sim") throw new Error("Switch to Simulation to change simulated data.");
}

// Clearly fake customers, each given some of the dashboard simulator's lots (lot06..lot14).
const DEMO_CUSTOMERS = [
  {
    name: "Demo University", type: "campus", status: "active", contactName: "Dana Whitaker (fake)",
    contactEmail: "dana@demo-university.example", notes: "Simulated customer. Came in through the website form.",
    lots: ["lot06", "lot07"], fromLead: true,
  },
  {
    name: "Demo Mall", type: "mall", status: "active", contactName: "Lee Park (fake)",
    contactEmail: "lee@demo-mall.example", notes: "Simulated customer.", lots: ["lot12"],
  },
  {
    name: "Demo Hotel", type: "hotel", status: "prospect", contactName: "Robin Ames (fake)",
    contactEmail: "robin@demo-hotel.example", notes: "Simulated prospect, piloting one lot.", lots: ["lot14"],
  },
];
export const DEMO_LOT_IDS = DEMO_CUSTOMERS.flatMap((c) => c.lots);

// Fake quote requests. Every email is @example.com: none of these are real people.
const FAKE_LEADS = [
  { name: "Priya Raman", organization: "Westbrook University", facilityType: "university", message: "We have 14 surface lots and a permit system that nobody trusts. Could we pilot two lots next semester?" },
  { name: "Marcus Bell", organization: "Riverside Arena", facilityType: "stadium", message: "Interested in event mode and gate routing for about 3,000 spaces." },
  { name: "Elena Ortiz", organization: "St. Agnes Medical Center", facilityType: "hospital", message: "Accessible spaces near the ER entrance are always taken. What would a quote look like for one garage level?" },
  { name: "Tom Becker", organization: "Harbor Point Mall", facilityType: "shopping", message: "" },
  { name: "Aisha Khan", organization: "City of Fairview, Parking Services", facilityType: "city", message: "Looking at metered street parking downtown, roughly 400 spaces across six blocks." },
  { name: "Jordan Lee", organization: "", facilityType: "airport", message: "Do you support economy lots with shuttle stops?" },
  { name: "Sam Whitfield", organization: "Northgate College", facilityType: "university", message: "Visitor parking only, about 120 spaces." },
];
// The request Demo University came from (status "won").
const WON_LEAD = { name: "Dana Whitaker", organization: "Demo University", facilityType: "university", message: "Two surface lots to start, more next year if it works." };

function fakeLead(f, createdAt, status) {
  const lead = { name: f.name, email: f.name.toLowerCase().replace(/[^a-z]+/g, ".") + "@example.com", facilityType: f.facilityType, status, createdAt };
  if (f.organization) lead.organization = f.organization;
  if (f.message) lead.message = f.message;
  return lead;
}

const newKey = (path) => push(ref(database, sim(path))).key;

// Replaces demo/sites and demo/leads with the fake set and assigns the demo lots,
// in one write. Lots the dashboard's simulator hasn't created yet are skipped.
export async function seedDemoCustomers() {
  requireSim();
  const [sites, leads, lots] = await Promise.all(["sites", "leads", "lots"].map((p) => get(ref(database, sim(p))).then((s) => s.val() || {})));
  const updates = {};
  Object.keys(sites).forEach((id) => { updates[sim(`sites/${id}`)] = null; });
  Object.keys(leads).forEach((id) => { updates[sim(`leads/${id}`)] = null; });
  Object.entries(lots).forEach(([id, lot]) => { if (lot?.siteId) updates[sim(`lots/${id}/siteId`)] = null; });

  const now = Date.now();
  let assigned = 0;
  DEMO_CUSTOMERS.forEach(({ lots: lotIds, fromLead, ...customer }) => {
    const siteId = newKey("sites");
    const site = { ...customer, createdAt: serverTimestamp() };
    if (fromLead) {
      const leadId = newKey("leads");
      site.fromLeadId = leadId;
      updates[sim(`leads/${leadId}`)] = { ...fakeLead(WON_LEAD, now - 9 * 86400000, "won"), siteId };
    }
    updates[sim(`sites/${siteId}`)] = site;
    lotIds.forEach((lotId) => {
      if (!lots[lotId]) return;
      updates[sim(`lots/${lotId}/siteId`)] = siteId;
      assigned += 1;
    });
  });

  // A mix of statuses over the last two weeks, newest still "new".
  const ages = [0.3, 2, 5, 26, 50, 120, 300]; // hours ago
  const statuses = ["new", "new", "new", "contacted", "contacted", "closed", "closed"];
  FAKE_LEADS.forEach((f, i) => { updates[sim(`leads/${newKey("leads")}`)] = fakeLead(f, now - Math.round(ages[i] * 3600000), statuses[i]); });

  await writeSim(updates);
  const missing = DEMO_LOT_IDS.length - assigned;
  return `Loaded ${DEMO_CUSTOMERS.length} demo customers and ${FAKE_LEADS.length + 1} fake requests, and assigned ${assigned} demo ${assigned === 1 ? "lot" : "lots"}.` +
    (missing ? ` ${missing} demo ${missing === 1 ? "lot doesn't" : "lots don't"} exist yet: load simulated data on the dashboard's Simulation page, then reload these.` : "");
}

// Demo lots that exist but have lost their customer (for example after the
// dashboard's Simulation reset in an older version, or by hand).
export function unassignedDemoLots(lots) {
  return DEMO_LOT_IDS.filter((id) => lots[id] && !lots[id].siteId);
}

// One new fake quote request, as if someone just sent the website form.
export async function addFakeLead() {
  requireSim();
  const f = FAKE_LEADS[Math.floor(Math.random() * FAKE_LEADS.length)];
  const lead = fakeLead(f, serverTimestamp(), "new");
  await writeSim({ [sim(`leads/${newKey("leads")}`)]: lead });
  return `New quote request from ${lead.name}.`;
}

// Seeds once per page load, the first time Simulation shows no customers at all.
let autoSeeded = false;
export function autoSeedOnce() {
  if (autoSeeded) return null;
  autoSeeded = true;
  return seedDemoCustomers();
}

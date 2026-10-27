import { useEffect, useState } from "react";
import { ref, onValue, push, set, update, serverTimestamp } from "firebase/database";
import { database } from "./firebase";
import { SIM_ROOT, dataPath, getDataMode } from "./dataMode";

// Quote requests from the website:
//   leads/<autoId> = { name, email, organization, facilityType, message, createdAt, status }
// Anyone can create one (the public form is signed out); only managers read,
// change status or delete (see database.rules.json). In Simulation they live
// at demo/leads and hold fake data only.
export const LEADS_PATH = "leads";

export const LEAD_STATUSES = [
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "closed", label: "Closed" },
];

// Longest allowed length of each field, matching the rules (email, organization
// and message must be under 120, 120 and 1000).
export const LEAD_LIMITS = { name: 80, email: 119, organization: 119, message: 999 };
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Client-side checks, the same as the rules'. Returns { field: message } for each problem.
export function leadErrors({ name, email, organization, facilityType, message }, facilityIds) {
  const errors = {};
  if (!name.trim()) errors.name = "Enter your name.";
  else if (name.trim().length > LEAD_LIMITS.name) errors.name = `Keep your name under ${LEAD_LIMITS.name + 1} characters.`;
  if (!EMAIL_RE.test(email.trim())) errors.email = "Enter an email address like name@example.com.";
  else if (email.trim().length > LEAD_LIMITS.email) errors.email = "That email address is too long.";
  if (organization.trim().length > LEAD_LIMITS.organization) errors.organization = "Shorten the organization name.";
  if (!facilityIds.includes(facilityType)) errors.facilityType = "Choose the kind of facility.";
  if (message.trim().length > LEAD_LIMITS.message) errors.message = `Keep the message under ${LEAD_LIMITS.message + 1} characters.`;
  return errors;
}

// The exact shape the rules accept for a new lead. Empty optional fields are left out.
// Live site only: Simulation (including the public demo site) never stores what a
// visitor types. Fake requests for demo/leads come from the simulator instead.
export function createLead({ name, email, organization, facilityType, message }) {
  if (getDataMode() === "sim") return Promise.reject(new Error("Simulation doesn't store visitor requests."));
  const lead = { name: name.trim(), email: email.trim(), facilityType, status: "new", createdAt: serverTimestamp() };
  if (organization?.trim()) lead.organization = organization.trim();
  if (message?.trim()) lead.message = message.trim();
  return set(push(ref(database, LEADS_PATH)), lead);
}

// Status changes from the Requests page. In Simulation they may only touch demo/leads.
// The id must be a single key, so it can't point anywhere else.
export function setLeadStatus(id, status) {
  if (!/^[^./#$[\]]+$/.test(id)) return Promise.reject(new Error(`Not a request id: ${id}`));
  const full = dataPath(`${LEADS_PATH}/${id}`);
  if (getDataMode() === "sim" && !full.startsWith(SIM_ROOT + LEADS_PATH + "/")) {
    return Promise.reject(new Error(`Refusing to write outside the simulation: ${full}`));
  }
  return update(ref(database, full), { status });
}

// Leads for the current mode, newest first. Only subscribes when enabled
// (managers), since the database refuses everyone else.
export function useLeads(mode, enabled = true) {
  const [state, setState] = useState({ mode: null, leads: [], error: false });
  useEffect(() => {
    if (!enabled) return undefined;
    return onValue(
      ref(database, dataPath(LEADS_PATH)),
      (s) => {
        const leads = Object.entries(s.val() || {})
          .map(([id, l]) => ({ id, ...l }))
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setState({ mode, leads, error: false });
      },
      () => setState({ mode, leads: [], error: true }),
    );
  }, [mode, enabled]);
  const loaded = enabled && state.mode === mode;
  return { loaded, leads: loaded ? state.leads : [], error: loaded && state.error };
}

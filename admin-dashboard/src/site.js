import { useEffect, useState } from "react";
import { ref, onValue, update } from "firebase/database";
import { database } from "./firebase";
import { SIM_ROOT, dataPath, getDataMode } from "./dataMode";

// Site settings, written by the Setup wizard:
//   config/site = { siteName, contact: { name, email, phone }, facilityType, modules: { <id>: bool }, setupComplete }
// Managers write it; every staff account reads it (see database.rules.json).
// In Simulation it lives at demo/config/site instead, like all other curb data.
export const SITE_PATH = "config/site";

// Optional modules a facility type can turn on. They appear in the sidebar when on.
// None is built yet: each opens a page that says what it will do.
export const MODULES = {
  eventMode: { label: "Event mode scheduling", desc: "Switch lots into event signage and pricing on a schedule." },
  gateRouting: { label: "Gate and lane routing", desc: "Point drivers to the gate or lane with the most free curbs." },
  demandPricing: { label: "Demand-based pricing", desc: "Raise or lower rates as lots fill and empty." },
  tailgateZones: { label: "Tailgate zone controls", desc: "Mark tailgating areas and set when they open and close." },
  permitTiers: { label: "Permit tiers", desc: "Match zones to permit types and flag cars in the wrong one." },
  semesterCalendar: { label: "Semester calendar", desc: "Plan around term dates, exams and breaks." },
  rateTiers: { label: "Daily rate tiers", desc: "Short term, long term and economy rates by the day." },
  patientPriority: { label: "Patient priority", desc: "Keep spaces near entrances free for patients." },
  staffShifts: { label: "Staff shifts", desc: "Hold staff zones around shift changes." },
  dwellLimits: { label: "Dwell limits", desc: "Flag cars that stay past a zone's time limit." },
  meteredParking: { label: "Metered parking", desc: "Street spaces with meters and time limits." },
  enforcementRouting: { label: "Enforcement routing", desc: "Send enforcement staff to overstays in a sensible order." },
};

// zones: the default label and panel text for each LED zone colour (panel text is 16 characters at most).
// modules: what Setup offers for this facility type; true means on by default.
export const FACILITIES = [
  {
    id: "university",
    label: "University Campus",
    desc: "Permit tiers, semester patterns, faculty and visitor zones",
    modules: { permitTiers: true, semesterCalendar: true, eventMode: false, demandPricing: false },
    zones: {
      red: { label: "Faculty and staff", text: "FACULTY" },
      blue: { label: "Accessible", text: "ACCESSIBLE" },
      green: { label: "Visitor", text: "VISITOR" },
      gold: { label: "Student permit", text: "STUDENT PERMIT" },
      white: { label: "Loading", text: "LOADING ONLY" },
    },
  },
  {
    id: "stadium",
    label: "Stadium & Arena",
    desc: "Event mode, gate routing, tailgate zones, demand pricing",
    modules: { eventMode: true, gateRouting: true, demandPricing: true, tailgateZones: true, semesterCalendar: false, permitTiers: false },
    zones: {
      red: { label: "VIP", text: "VIP" },
      blue: { label: "Accessible", text: "ACCESSIBLE" },
      green: { label: "General", text: "GENERAL" },
      gold: { label: "Season pass", text: "SEASON PASS" },
      white: { label: "Tailgate", text: "TAILGATE" },
    },
  },
  {
    id: "airport",
    label: "Airport",
    desc: "Short term, long term and economy with daily rate tiers",
    modules: { rateTiers: true, gateRouting: true, demandPricing: false, permitTiers: false },
    zones: {
      red: { label: "Short term", text: "SHORT TERM" },
      blue: { label: "Accessible", text: "ACCESSIBLE" },
      green: { label: "Economy", text: "ECONOMY" },
      gold: { label: "Long term", text: "LONG TERM" },
      white: { label: "Pick-up", text: "PICK-UP ONLY" },
    },
  },
  {
    id: "hospital",
    label: "Hospital",
    desc: "Patient priority, staff shifts, accessible spaces near entry",
    modules: { patientPriority: true, staffShifts: true, permitTiers: false, dwellLimits: false },
    zones: {
      red: { label: "Emergency", text: "EMERGENCY" },
      blue: { label: "Accessible", text: "ACCESSIBLE" },
      green: { label: "Patient and visitor", text: "PATIENT/VISITOR" },
      gold: { label: "Staff", text: "STAFF ONLY" },
      white: { label: "Drop-off", text: "DROP-OFF" },
    },
  },
  {
    id: "shopping",
    label: "Shopping Center",
    desc: "Customer turnover, dwell limits, peak retail hours",
    modules: { dwellLimits: true, demandPricing: true, eventMode: false },
    zones: {
      red: { label: "Click and collect", text: "CLICK & COLLECT" },
      blue: { label: "Accessible", text: "ACCESSIBLE" },
      green: { label: "Customer", text: "CUSTOMER" },
      gold: { label: "Staff", text: "STAFF ONLY" },
      white: { label: "Loading", text: "LOADING ONLY" },
    },
  },
  {
    id: "city",
    label: "City & Municipal",
    desc: "Metered street parking, time limits, enforcement routing",
    modules: { meteredParking: true, dwellLimits: true, enforcementRouting: true, permitTiers: false },
    zones: {
      red: { label: "No parking", text: "NO PARKING" },
      blue: { label: "Accessible", text: "ACCESSIBLE" },
      green: { label: "Two-hour", text: "2 HOUR LIMIT" },
      gold: { label: "Permit holders", text: "PERMIT ONLY" },
      white: { label: "Loading", text: "LOADING ZONE" },
    },
  },
];

// Every write Setup makes goes through here. In Simulation it may only touch
// demo/config and demo/units; anything else is refused before it reaches the database.
const SIM_SETUP_ROOTS = [SIM_ROOT + "config/", SIM_ROOT + "units/"];

export function writeSetup(path, values) {
  const full = dataPath(path);
  if (getDataMode() === "sim" && !SIM_SETUP_ROOTS.some((root) => full.startsWith(root))) {
    return Promise.reject(new Error(`Refusing to write outside the simulation: ${full}`));
  }
  return update(ref(database, full), values);
}

export const facilityById = (id) => FACILITIES.find((f) => f.id === id) || null;

// Module ids that are on, in catalog order.
export function enabledModules(site) {
  const on = site?.modules || {};
  return Object.keys(MODULES).filter((id) => on[id] === true);
}

// Live site settings for the current data mode. Pass the mode so the
// subscription moves with it; until the new mode's value arrives, loaded is
// false rather than showing the other mode's settings. error: the database refused the read.
export function useSiteConfig(mode) {
  const [state, setState] = useState({ mode: null, site: null, error: false });
  useEffect(() => onValue(
    ref(database, dataPath(SITE_PATH)),
    (s) => setState({ mode, site: s.val(), error: false }),
    () => setState({ mode, site: null, error: true }),
  ), [mode]);
  const loaded = state.mode === mode;
  return { loaded, site: loaded ? state.site : null, error: loaded && state.error };
}

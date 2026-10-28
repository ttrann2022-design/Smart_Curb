import { useEffect, useState } from "react";
import { ref, onValue, push, set, update, remove, serverTimestamp } from "firebase/database";
import { database } from "../firebase";
import { dataPath } from "../dataMode";

// Everything the company console reads, for the current data mode (Live reads
// the root, Simulation reads demo/). ConsoleLayout subscribes once and hands the
// result to every page through the outlet context.
//   sites/<id>  customers     (platform admins only)
//   leads/<id>  quote requests (platform admins only)
//   lots/<id>, units/<id>     public, written by the hardware and the dashboard

function useNode(path, mode) {
  const [state, setState] = useState({ mode: null, data: {}, error: null });
  useEffect(() => onValue(
    ref(database, dataPath(path)),
    (s) => setState({ mode, data: s.val() || {}, error: null }),
    (error) => setState({ mode, data: {}, error }),
  ), [path, mode]);
  const loaded = state.mode === mode;
  return { loaded, data: loaded ? state.data : {}, error: loaded ? state.error : null };
}

export function useConsoleData(mode) {
  const sites = useNode("sites", mode);
  const leads = useNode("leads", mode);
  const lots = useNode("lots", mode);
  const units = useNode("units", mode);
  const parts = [sites, leads, lots, units];
  return {
    loaded: parts.every((p) => p.loaded),
    error: parts.find((p) => p.error)?.error || null,
    sites: sites.data, leads: leads.data, lots: lots.data, units: units.data,
  };
}

// ---------- Customers (sites/<id>) ----------

export const SITE_TYPES = [
  { id: "campus", label: "Campus" },
  { id: "mall", label: "Mall" },
  { id: "garage", label: "Garage" },
  { id: "hotel", label: "Hotel" },
  { id: "other", label: "Other" },
];
export const SITE_STATUSES = [
  { id: "prospect", label: "Prospect" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
];
export const typeLabel = (id) => SITE_TYPES.find((t) => t.id === id)?.label || "Unknown type";
export const statusLabel = (id) => SITE_STATUSES.find((s) => s.id === id)?.label || "Unknown";

// Longest allowed length of each field, as in database.rules.json.
export const SITE_LIMITS = { name: 80, contactName: 80, contactEmail: 120, notes: 500 };
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const EMPTY_SITE_FORM = { name: "", type: "campus", status: "prospect", contactName: "", contactEmail: "", notes: "" };

export const siteToForm = (site) => ({
  name: site.name || "", type: site.type || "other", status: site.status || "prospect",
  contactName: site.contactName || "", contactEmail: site.contactEmail || "", notes: site.notes || "",
});

// The rules' checks, in the form's words. Returns { field: message } for each problem.
export function siteErrors(form) {
  const errors = {};
  const name = form.name.trim();
  if (!name) errors.name = "Enter the customer's name.";
  else if (name.length > SITE_LIMITS.name) errors.name = `Keep the name to ${SITE_LIMITS.name} characters.`;
  if (!SITE_TYPES.some((t) => t.id === form.type)) errors.type = "Choose a type.";
  if (!SITE_STATUSES.some((s) => s.id === form.status)) errors.status = "Choose a status.";
  if (form.contactName.trim().length > SITE_LIMITS.contactName) errors.contactName = `Keep the contact name to ${SITE_LIMITS.contactName} characters.`;
  const email = form.contactEmail.trim();
  if (email && !EMAIL_RE.test(email)) errors.contactEmail = "Enter an email address like name@example.com, or leave it empty.";
  else if (email.length > SITE_LIMITS.contactEmail) errors.contactEmail = "That email address is too long.";
  if (form.notes.trim().length > SITE_LIMITS.notes) errors.notes = `Keep notes to ${SITE_LIMITS.notes} characters.`;
  return errors;
}

// Form -> database fields. Empty optional fields are left out of a new site and
// removed (null) from an existing one.
function siteFields(form, emptyAs) {
  const fields = { name: form.name.trim(), type: form.type, status: form.status };
  for (const key of ["contactName", "contactEmail", "notes"]) {
    const value = form[key].trim();
    if (value) fields[key] = value;
    else if (emptyAs !== undefined) fields[key] = emptyAs;
  }
  return fields;
}

// Keys come from the database or push(), but check anyway so a path can't be built from anything else.
const isKey = (id) => typeof id === "string" && /^[A-Za-z0-9_-]+$/.test(id);
function key(id) {
  if (!isKey(id)) throw new Error(`Not a valid id: ${id}`);
  return id;
}

export async function createSite(form) {
  const id = push(ref(database, dataPath("sites"))).key;
  await set(ref(database, dataPath(`sites/${id}`)), { ...siteFields(form), createdAt: serverTimestamp() });
  return id;
}

export const updateSite = (id, form) => update(ref(database, dataPath(`sites/${key(id)}`)), siteFields(form, null));
export const setSiteStatus = (id, status) => set(ref(database, dataPath(`sites/${key(id)}/status`)), status);
export const deleteSite = (id) => remove(ref(database, dataPath(`sites/${key(id)}`)));

// ---------- Lots (lots/<id>) ----------

// As in database.rules.json. Platform admins create a lot and later change only
// name, totalSpots, latitude and longitude; openSpots and units belong to the hardware.
export const LOT_LIMITS = { name: 80, minSpots: 1, maxSpots: 5000 };
export const EMPTY_LOT_FORM = { name: "", totalSpots: "", latitude: "", longitude: "" };

const asText = (v) => (typeof v === "number" ? String(v) : "");
export const lotToForm = (lot) => ({
  name: lot.name || "", totalSpots: asText(lot.totalSpots), latitude: asText(lot.latitude), longitude: asText(lot.longitude),
});

// "North Garage 2" -> "northgarage2". Empty when the name has no letters or numbers.
export const lotIdFromName = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "");

const number = (text) => (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(text.trim()) ? Number(text.trim()) : NaN);

// The rules' checks, in the form's words. `lots` is given for a new lot, to refuse an ID that's taken.
export function lotErrors(form, lots) {
  const errors = {};
  const name = form.name.trim();
  if (!name) errors.name = "Enter the lot's name.";
  else if (name.length > LOT_LIMITS.name) errors.name = `Keep the name to ${LOT_LIMITS.name} characters.`;
  else if (lots) {
    const id = lotIdFromName(name);
    if (!id) errors.name = "Use at least one letter or number: the lot's ID is made from them.";
    else if (lots[id]) errors.name = `A lot with the ID "${id}" already exists. Choose a different name.`;
  }
  const spots = form.totalSpots.trim();
  if (!/^\d+$/.test(spots) || Number(spots) < LOT_LIMITS.minSpots || Number(spots) > LOT_LIMITS.maxSpots) {
    errors.totalSpots = `Enter a whole number from ${LOT_LIMITS.minSpots} to ${LOT_LIMITS.maxSpots.toLocaleString()}.`;
  }
  const lat = form.latitude.trim();
  const lng = form.longitude.trim();
  if (lat && !(number(lat) >= -90 && number(lat) <= 90)) errors.latitude = "Enter a latitude from -90 to 90, or leave it empty.";
  if (lng && !(number(lng) >= -180 && number(lng) <= 180)) errors.longitude = "Enter a longitude from -180 to 180, or leave it empty.";
  if (!errors.latitude && !errors.longitude && !lat !== !lng) errors[lat ? "longitude" : "latitude"] = "Enter both latitude and longitude, or leave both empty.";
  return errors;
}

// Form -> the four fields platform admins may write. An empty location is left
// out of a new lot and removed (null) from an existing one.
function lotFields(form, emptyAs) {
  const fields = { name: form.name.trim(), totalSpots: Number(form.totalSpots.trim()) };
  for (const k of ["latitude", "longitude"]) {
    if (form[k].trim()) fields[k] = number(form[k]);
    else if (emptyAs !== undefined) fields[k] = emptyAs;
  }
  return fields;
}

// A new lot for a customer: every spot open until the hardware reports. The rules
// refuse it if the ID is already taken, even by a lot this page hasn't loaded.
export async function createLot(siteId, form) {
  const id = key(lotIdFromName(form.name.trim()));
  const fields = lotFields(form);
  await set(ref(database, dataPath(`lots/${id}`)), { ...fields, openSpots: fields.totalSpots, siteId: key(siteId) });
  return id;
}

export const updateLot = (lotId, form) => update(ref(database, dataPath(`lots/${key(lotId)}`)), lotFields(form, null));

// Assigning only ever writes siteId: the rest of a lot belongs to the hardware and the dashboard.
export const assignLot = (lotId, siteId) => set(ref(database, dataPath(`lots/${key(lotId)}/siteId`)), key(siteId));
export const unassignLot = (lotId) => remove(ref(database, dataPath(`lots/${key(lotId)}/siteId`)));

// ---------- Converting a quote request ----------

const TYPE_FROM_FACILITY = { university: "campus", shopping: "mall" };

// A new customer from a request: the organization (or the person) as the name,
// the person as the contact, status "prospect", and fromLeadId pointing back.
export function siteFromLead(lead) {
  const site = {
    name: (lead.organization?.trim() || lead.name.trim()).slice(0, SITE_LIMITS.name),
    type: TYPE_FROM_FACILITY[lead.facilityType] || "other",
    status: "prospect",
    contactName: lead.name.trim().slice(0, SITE_LIMITS.contactName),
    fromLeadId: lead.id,
    createdAt: serverTimestamp(),
  };
  if (EMAIL_RE.test(lead.email || "") && lead.email.length <= SITE_LIMITS.contactEmail) site.contactEmail = lead.email;
  return site;
}

// One write: the customer, the request's "won" status, and the request's siteId.
// The rules refuse it if the request was already converted.
export async function convertLead(lead) {
  if (lead.status === "won" || lead.siteId) throw new Error("This request is already a customer.");
  const id = push(ref(database, dataPath("sites"))).key;
  const leadPath = dataPath(`leads/${key(lead.id)}`);
  await update(ref(database), {
    [dataPath(`sites/${id}`)]: siteFromLead(lead),
    [`${leadPath}/status`]: "won",
    [`${leadPath}/siteId`]: id,
  });
  return id;
}

// ---------- Derived views ----------

export const isOnline = (u) => u?.online === true;

// Curbs grouped by the lot they report into (units/<id>/lot), with totals per lot and per customer.
export function summarize({ sites, lots, units }) {
  const lotUnits = {};
  const looseUnits = [];
  Object.entries(units).forEach(([id, u]) => {
    if (u && lots[u.lot]) (lotUnits[u.lot] ||= []).push([id, u]);
    else looseUnits.push([id, u || {}]);
  });
  Object.values(lotUnits).forEach((list) => list.sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })));

  const lotStats = {};
  Object.keys(lots).forEach((lotId) => {
    const list = lotUnits[lotId] || [];
    lotStats[lotId] = {
      curbs: list.length,
      online: list.filter(([, u]) => isOnline(u)).length,
      lastSeen: list.reduce((m, [, u]) => (typeof u.lastUpdated === "number" && u.lastUpdated > m ? u.lastUpdated : m), 0) || null,
    };
  });

  const siteStats = {};
  Object.keys(sites).forEach((siteId) => { siteStats[siteId] = { lots: [], curbs: 0, online: 0, lastSeen: null }; });
  const unassignedLots = [];
  Object.entries(lots).forEach(([lotId, lot]) => {
    const s = siteStats[lot?.siteId];
    if (!s) { unassignedLots.push(lotId); return; }
    const st = lotStats[lotId];
    s.lots.push(lotId);
    s.curbs += st.curbs;
    s.online += st.online;
    if (st.lastSeen && st.lastSeen > (s.lastSeen || 0)) s.lastSeen = st.lastSeen;
  });
  const byName = (a, b) => (lots[a]?.name || a).localeCompare(lots[b]?.name || b, undefined, { numeric: true });
  Object.values(siteStats).forEach((s) => s.lots.sort(byName));
  unassignedLots.sort(byName);

  return { lotUnits, looseUnits, lotStats, siteStats, unassignedLots };
}

export const lotName = (lots, lotId) => lots[lotId]?.name || lotId;

// Sites sorted by name for lists and pickers.
export const sortedSites = (sites) => Object.entries(sites).sort(([, a], [, b]) => (a.name || "").localeCompare(b.name || ""));

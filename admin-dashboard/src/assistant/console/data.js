// Views of the console's data (sites/, leads/, lots/, units/) for the Console
// Assistant's answers. Same links as the console pages: a lot belongs to the
// customer in its siteId, a curb to the lot in its lot field. Read-only.
import { DEFAULT_ALERTS, formatAgo, hasBattery } from "../../unitStatus.js";

const byText = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
const obj = (x) => (x && typeof x === "object" ? x : {});
export const LOW_BATTERY = DEFAULT_ALERTS.lowBattery;
export const DAY = 86400000;

export const TYPE_LABEL = { campus: "campus", mall: "mall", garage: "garage", hotel: "hotel", other: "other" };
export const STATUS_LABEL = { prospect: "prospect", active: "active", paused: "paused" };
// The facility a quote request asked about, as the website form offers them.
export const FACILITY_LABEL = { university: "a university campus", stadium: "a stadium or arena", airport: "an airport", hospital: "a hospital", shopping: "a shopping centre", city: "city or municipal parking" };
export const facilityText = (id) => FACILITY_LABEL[id] || "a site type they didn't pick";

export const plural = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
export const isOnline = (u) => u?.online === true;
export const isLow = (u) => hasBattery(u) && u.battery < LOW_BATTERY;

// [id, unit] pairs, sorted by ID.
export const curbEntries = (ctx) => Object.entries(obj(ctx.units)).filter(([, u]) => u && typeof u === "object").sort(([a], [b]) => byText(a, b));

// Every lot with its customer and curbs, sorted by name.
export function lotViews(ctx) {
  const curbs = curbEntries(ctx);
  const sites = obj(ctx.sites);
  return Object.entries(obj(ctx.lots)).filter(([, l]) => l && typeof l === "object").map(([id, l]) => {
    const mine = curbs.filter(([, u]) => u.lot === id);
    const online = mine.filter(([, u]) => isOnline(u)).length;
    return {
      id,
      name: typeof l.name === "string" && l.name ? l.name : id,
      siteId: sites[l.siteId] ? l.siteId : null,
      customer: sites[l.siteId]?.name || null,
      totalSpots: typeof l.totalSpots === "number" ? l.totalSpots : null,
      hasLocation: typeof l.latitude === "number" && typeof l.longitude === "number",
      latitude: l.latitude, longitude: l.longitude,
      curbs: mine, online, offline: mine.length - online,
      low: mine.filter(([, u]) => isLow(u)).length,
    };
  }).sort((a, b) => byText(a.name, b.name));
}

// Every customer with its lots and curb counts, sorted by name.
export function customerViews(ctx) {
  const lots = lotViews(ctx);
  return Object.entries(obj(ctx.sites)).filter(([, s]) => s && typeof s === "object").map(([id, s]) => {
    const mine = lots.filter((l) => l.siteId === id);
    const curbs = mine.flatMap((l) => l.curbs);
    const online = curbs.filter(([, u]) => isOnline(u)).length;
    return {
      id,
      name: typeof s.name === "string" && s.name ? s.name : "Unnamed customer",
      type: s.type, status: s.status, contactName: s.contactName, contactEmail: s.contactEmail,
      createdAt: s.createdAt, fromLeadId: s.fromLeadId,
      lots: mine, curbs, online, offline: curbs.length - online,
      low: curbs.filter(([, u]) => isLow(u)).length,
    };
  }).sort((a, b) => byText(a.name, b.name));
}

// Quote requests, newest first.
export function leadViews(ctx) {
  return Object.entries(obj(ctx.leads)).filter(([, l]) => l && typeof l === "object")
    .map(([id, l]) => ({ id, ...l, won: l.status === "won" || !!l.siteId }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export const leadName = (l) => `${l.name || "Someone"}${l.organization ? ` (${l.organization})` : ""}`;
export const ago = (ctx, ts) => formatAgo(ts, ctx.now) || "at an unknown time";

// Where an answer's data came from, and how fresh it is. The console reads the
// database in real time, so the data is as of now; the freshest curb reading says
// how recently the hardware (or the simulator) last reported.
export function sourceLine(ctx) {
  let latest = 0;
  for (const [, u] of curbEntries(ctx)) if (typeof u.lastUpdated === "number" && u.lastUpdated > latest) latest = u.lastUpdated;
  const where = ctx.mode === "sim" ? "From the simulation (demo data, not real customers)" : "From live data";
  const fresh = latest ? `newest curb reading ${formatAgo(latest, ctx.now)}` : "no curb readings yet";
  return `${where}, read just now · ${fresh}.`;
}
export const sourced = (ctx, variants) => variants.map((v) => `${v}\n\n${sourceLine(ctx)}`);

// The same body behind several openers: one variant per opener.
export const vary = (openers, body = "") => openers.map((o) => (body ? `${o}${body}` : o));

export const PAGE = 8;
// One page of bullet lines, then how many are left.
export function bullets(lines, page = 0) {
  const start = page * PAGE;
  const shown = lines.slice(start, start + PAGE).map((l) => `• ${l}`);
  const rest = lines.length - start - PAGE;
  if (rest > 0) shown.push(`…and ${rest} more. Say "show me more" for the next ${Math.min(rest, PAGE)}.`);
  return shown.join("\n");
}
export const hasMore = (lines, page = 0) => lines.length > (page + 1) * PAGE;

// Nothing loaded at all: say so instead of reporting zeros.
export function empty(ctx) {
  if (Object.keys(obj(ctx.sites)).length || Object.keys(obj(ctx.lots)).length || Object.keys(obj(ctx.leads)).length || curbEntries(ctx).length) return null;
  return ctx.mode === "sim"
    ? [
      "The simulation has no customers, requests or lots yet. Load simulated data on the dashboard's Simulation page, then use Reload demo customers on Home.",
      "Nothing in the simulation yet. Reload demo customers from Home once simulated lots exist, and ask me again.",
      "Simulation is empty right now, so there's nothing to count. Home has a Reload demo customers button to fill it.",
    ]
    : [
      "Live data is empty: no customers, requests, lots or curbs yet. They show up here as soon as they're added.",
      "I don't see any live customers, requests or lots yet, so there's nothing to count.",
      "There's no live data to answer from yet. Add a customer, or wait for the first quote request.",
    ];
}

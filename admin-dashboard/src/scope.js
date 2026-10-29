// Which customer's lots and curbs the customer dashboard shows. One dashboard
// build and one address: the signed-in account decides.
//
//   resolveScope({ mode, isPlatformAdmin, siteId, viewing })
//     -> { kind: "all" }                   every lot and curb (platform admins by
//                                          default, and everyone in Simulation)
//      | { kind: "site", siteId }          one customer's lots and their curbs
//      | { kind: "none" }                  an account not linked to a customer: nothing
//   scopeData({ lots, units }, scope)    -> { lots, units } the pages may show
//
// A lot is in scope when lots/<id>/siteId is the scope's customer. A curb is in
// scope when its lot is. Everything else is dropped before any page, the
// Assistant or the lot sign sees it. Pure: scripts/test-scope.mjs runs it under Node.
//
// This decides what each dashboard shows. It isn't access control: the database
// rules still let any signed-in staff account read every lot and curb (README,
// "Customer scoping").

export const ALL = Object.freeze({ kind: "all" });
export const NONE = Object.freeze({ kind: "none" });
export const ALL_CUSTOMERS = "all";

const isId = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const obj = (x) => (x && typeof x === "object" ? x : {});

// mode: "live" | "sim". siteId: users/<uid>/siteId. viewing: a platform admin's
// pick in the header ("all" or a customer id).
export function resolveScope({ mode, isPlatformAdmin, siteId, viewing }) {
  // The simulator's data is fake and shared, so Simulation is never scoped.
  if (mode === "sim") return ALL;
  if (isPlatformAdmin) return isId(viewing) && viewing !== ALL_CUSTOMERS ? { kind: "site", siteId: viewing } : ALL;
  return isId(siteId) ? { kind: "site", siteId } : NONE;
}

// True when the scope hides some customers' data, so site-wide totals that can't
// be split per customer (recorded history) mustn't be shown.
export const isPartial = (scope) => scope.kind !== "all";

export function scopeLots(lots, scope) {
  if (scope.kind === "all") return obj(lots);
  if (scope.kind !== "site") return {};
  return Object.fromEntries(Object.entries(obj(lots)).filter(([, l]) => l && typeof l === "object" && l.siteId === scope.siteId));
}

// Curbs whose lot is in `scopedLots`. With every customer in view, curbs that
// aren't in any lot stay too (pages show them as unassigned).
export function scopeUnits(units, scopedLots, scope) {
  if (scope.kind === "all") return obj(units);
  if (scope.kind !== "site") return {};
  return Object.fromEntries(Object.entries(obj(units)).filter(([, u]) => u && typeof u === "object" && Object.hasOwn(scopedLots, u.lot)));
}

export function scopeData({ lots, units }, scope) {
  const scopedLots = scopeLots(lots, scope);
  return { lots: scopedLots, units: scopeUnits(units, scopedLots, scope) };
}

// Per-curb records (latency samples) for curbs in scope only.
export function scopeByCurb(records, scopedUnits, scope) {
  if (scope.kind === "all") return obj(records);
  return Object.fromEntries(Object.entries(obj(records)).filter(([id]) => Object.hasOwn(scopedUnits, id)));
}

// Dashboard accounts on the Users page: one customer's staff, plus accounts that
// aren't linked yet (invited, waiting for a platform admin to link them).
export function scopeUsers(users, scope) {
  if (scope.kind === "all") return obj(users);
  if (scope.kind !== "site") return {};
  return Object.fromEntries(Object.entries(obj(users)).filter(([, u]) => u && typeof u === "object" && (u.siteId === scope.siteId || !u.siteId)));
}

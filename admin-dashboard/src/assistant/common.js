// Small helpers shared by the intent files: role notes, the data source line,
// and building answer variants. Pure JS.
import { DEFAULT_ALERTS } from "../unitStatus.js";
import { curbEntries, sourceLine } from "./data.js";

export const alertsOf = (ctx) => ({ ...DEFAULT_ALERTS, ...(ctx.alerts || {}) });

const ROLE_NAME = { viewer: "a viewer", operator: "an operator", manager: "a manager" };
export const roleText = (ctx) => ROLE_NAME[ctx.role] || "signed in without a role yet";
export const canOperate = (ctx) => ctx.role === "operator" || ctx.role === "manager";
export const isManager = (ctx) => ctx.role === "manager";

export const ASK_MANAGER = "Ask a manager: Users & roles lists who they are.";
export const needOperator = (ctx, what) =>
  canOperate(ctx) ? "" : `\n\nYou're ${roleText(ctx)}, so you can see ${what} but not change it. ${ASK_MANAGER} They can make you an operator.`;
export const needManager = (ctx, what) =>
  isManager(ctx) ? "" : `\n\nOnly managers can ${what}, and you're ${roleText(ctx)}. ${ASK_MANAGER}`;

// The same body behind several openers: one variant per opener.
export const vary = (openers, body = "") => openers.map((o) => (body ? `${o}${body}` : o));

// Appends the "where this came from" line to every variant.
export const sourced = (ctx, variants, entries) => variants.map((v) => `${v}\n\n${sourceLine(ctx, entries)}`);

// Status answers need some data first.
export function noData(ctx) {
  if (Object.keys(ctx.lots || {}).length || curbEntries(ctx.units).length) return null;
  return ctx.mode === "sim"
    ? [
      "I don't see any simulated lots or curbs yet. An operator or manager can load them on the Simulation page with Load fresh simulated data.",
      "The simulation is empty right now. Load fresh simulated data on the Simulation page and ask me again.",
      "No simulated curbs yet. Once someone loads them on the Simulation page, I can answer that.",
    ]
    : [
      "I don't see any lots or curbs in the live data yet. They appear once the Receiver reports and lots are added.",
      "There's no live curb data yet, so I can't answer that. It fills in as soon as the Receiver reports.",
      "The live data is empty for now. Once curbs report in, ask me again.",
    ];
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

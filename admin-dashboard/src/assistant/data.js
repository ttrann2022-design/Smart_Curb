// Views of the dashboard's live data (units/, lots/) for the assistant's answers.
// Same definitions as the dashboard pages: a spot is free when its curb is online
// and not occupied, and "needs attention" is unitIssues() from unitStatus.js.
import { formatAgo } from "../unitStatus.js";

const byId = (a, b) => a.localeCompare(b, undefined, { numeric: true });

export const lotName = (lots, id) => lots[id]?.name || id;

// [id, unit] pairs, sorted by ID.
export const curbEntries = (units) => Object.entries(units || {}).filter(([, u]) => u && typeof u === "object").sort(([a], [b]) => byId(a, b));

// One row per lot, sorted by name: its curbs and their counts.
export function lotViews({ lots, units }) {
  const entries = curbEntries(units);
  return Object.keys(lots || {})
    .map((id) => {
      const curbs = entries.filter(([, u]) => u.lot === id);
      const online = curbs.filter(([, u]) => u.online);
      const occupied = online.filter(([, u]) => u.occupied).length;
      return {
        id,
        name: lotName(lots, id),
        curbs,
        total: curbs.length,
        open: online.length - occupied,
        occupied,
        offline: curbs.length - online.length,
        // Share of reporting curbs that are occupied, as on Analytics.
        pctFull: online.length ? Math.round((occupied / online.length) * 100) : null,
      };
    })
    .sort((a, b) => byId(a.name, b.name));
}

// Curbs whose lot field doesn't name an existing lot.
export const curbsWithoutLot = ({ lots, units }) => curbEntries(units).filter(([, u]) => !u.lot || !lots?.[u.lot]);

export function latestReading(entries) {
  let latest = null;
  for (const [, u] of entries) if (typeof u.lastUpdated === "number" && u.lastUpdated > (latest || 0)) latest = u.lastUpdated;
  return latest;
}

// The closing line of every status answer: where the data came from and how fresh it is.
export function sourceLine(ctx, entries = curbEntries(ctx.units)) {
  const latest = latestReading(entries);
  const source = ctx.mode === "sim" ? "From simulated data, not the real curbs" : "From live data";
  return `${source} · ${latest ? `latest reading ${formatAgo(latest, ctx.now)}` : "no reading times yet"}.`;
}

export const PAGE = 8;

// "C-041 in Lot 14" lines for one page of `entries`, then a count of the rest.
export function listCurbs(ctx, entries, detail = () => "", page = 0) {
  const start = page * PAGE;
  const lines = entries.slice(start, start + PAGE).map(([id, u]) => {
    const where = ctx.lots?.[u.lot] ? lotName(ctx.lots, u.lot) : "no lot";
    const extra = detail(u);
    return `• ${id} in ${where}${extra ? `: ${extra}` : ""}`;
  });
  const rest = entries.length - start - PAGE;
  if (rest > 0) lines.push(`…and ${rest} more. Say "show me more" for the next ${Math.min(rest, PAGE)}.`);
  return lines.join("\n");
}

export const hasMore = (entries, page = 0) => entries.length > (page + 1) * PAGE;

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

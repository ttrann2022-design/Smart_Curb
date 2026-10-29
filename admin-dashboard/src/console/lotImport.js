// Import lots from pasted CSV: parse, check every row against the current lots and
// customers, then write in batches. No Firebase here, so scripts/test-import.mjs
// runs it under plain Node; the page passes in the function that writes.
//
//   parseCsv(text)                 -> { header, rows: [{ line, cells }] } or { error }
//   planImport(text, lots, sites)  -> { error } or { rows: [{ line, id, status, ... }] }
//   runImport(rows, write, opts)   -> { results, summary }
//
// The checks are the rules' (database.rules.json) in the page's words. A lot's
// capacity comes from its curbs, so totalSpots is optional (the column too), and
// checked only when given. A new lot gets name, siteId, an optional location and
// totalSpots only if the row has one; never openSpots. An existing lot only ever gets
// totalSpots, latitude and longitude, and only when the row gives them: never its
// name, openSpots, siteId or anything else, and nothing is ever deleted.

export const COLUMNS = ["id", "name", "customer", "totalSpots", "latitude", "longitude"];
const REQUIRED = ["id", "name", "customer"];
export const IMPORT_LIMITS = { name: 80, idLength: 80, minSpots: 1, maxSpots: 5000, rows: 2000 };
export const BATCH_SIZE = 25;

// "Total Spots", "total_spots" and "totalspots" all mean totalSpots.
const fold = (h) => h.toLowerCase().replace(/[\s_-]+/g, "");
const BY_FOLDED = Object.fromEntries(COLUMNS.map((c) => [fold(c), c]));

// RFC 4180 CSV: quoted fields may hold commas, newlines and doubled quotes. Each row
// keeps the line it starts on, so errors can point at the paste. Values are trimmed
// and blank lines skipped.
export function parseCsv(text) {
  const src = String(text || "").replace(/^\uFEFF/, "");
  const records = [];
  let cells = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let start = 1;
  const endCell = () => { cells.push(cell.trim()); cell = ""; };
  const endRow = () => {
    endCell();
    if (cells.some((c) => c !== "")) records.push({ line: start, cells });
    cells = [];
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false;
      else { if (ch === "\n") line++; cell += ch; }
    } else if (ch === '"' && cell.trim() === "") { quoted = true; cell = ""; }
    else if (ch === ",") endCell();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      endRow();
      line++;
      start = line;
    } else cell += ch;
  }
  if (quoted) return { error: `A quote opened on line ${start} is never closed.` };
  endRow();
  if (!records.length) return { error: "Paste CSV text, starting with the header line." };

  const [head, ...rows] = records;
  const header = [];
  for (const raw of head.cells) {
    const col = BY_FOLDED[fold(raw)];
    if (!col) return { error: `Unknown column "${raw}" in the header. Use: ${COLUMNS.join(", ")}.` };
    if (header.includes(col)) return { error: `The header has "${col}" twice.` };
    header.push(col);
  }
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) return { error: `The header needs ${missing.join(", ")}. Use: ${COLUMNS.join(", ")}.` };
  if (!rows.length) return { error: "There are no rows under the header." };
  if (rows.length > IMPORT_LIMITS.rows) return { error: `Paste up to ${IMPORT_LIMITS.rows.toLocaleString()} rows at a time (this has ${rows.length.toLocaleString()}).` };
  return { header, rows };
}

const number = (text) => (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(text) ? Number(text) : NaN);
const sameNumber = (a, b) => typeof a === "number" && a === b;

// Every row with its status: "new", "update" or "error" (with reasons), and for the
// others the fields to write. `lots` and `sites` are the current data.
export function planImport(text, lots = {}, sites = {}) {
  const parsed = parseCsv(text);
  if (parsed.error) return { error: parsed.error };
  const { header, rows } = parsed;

  const sitesByName = new Map();
  for (const [id, s] of Object.entries(sites)) {
    const name = typeof s?.name === "string" ? s.name.trim() : "";
    if (name) sitesByName.set(name, [...(sitesByName.get(name) || []), id]);
  }
  const lines = new Map();
  rows.forEach((r) => {
    const id = r.cells[header.indexOf("id")] || "";
    if (id) lines.set(id, [...(lines.get(id) || []), r.line]);
  });

  const planned = rows.map(({ line, cells }) => {
    const get = (col) => (header.includes(col) ? cells[header.indexOf(col)] ?? "" : "");
    const row = { line, id: get("id"), name: get("name"), customer: get("customer"), totalSpots: get("totalSpots"), latitude: get("latitude"), longitude: get("longitude") };
    const errors = [];
    if (cells.length > header.length) errors.push(`Has ${cells.length} values but the header has ${header.length}. Put quotes around values with commas.`);

    if (!row.id) errors.push("id is missing.");
    else if (!/^[a-z0-9]+$/.test(row.id)) errors.push("id may only use lowercase letters and numbers.");
    else if (row.id.length > IMPORT_LIMITS.idLength) errors.push(`id is longer than ${IMPORT_LIMITS.idLength} characters.`);
    else if (lines.get(row.id).length > 1) errors.push(`id ${row.id} is on more than one line (${lines.get(row.id).join(", ")}).`);

    if (!row.name) errors.push("name is missing.");
    else if (row.name.length > IMPORT_LIMITS.name) errors.push(`name is longer than ${IMPORT_LIMITS.name} characters.`);

    let spots = null;
    if (!row.totalSpots) { /* optional: capacity comes from the curbs */ }
    else if (!/^\d+$/.test(row.totalSpots) || Number(row.totalSpots) < IMPORT_LIMITS.minSpots || Number(row.totalSpots) > IMPORT_LIMITS.maxSpots) {
      errors.push(`totalSpots must be a whole number from ${IMPORT_LIMITS.minSpots} to ${IMPORT_LIMITS.maxSpots.toLocaleString()}.`);
    } else spots = Number(row.totalSpots);

    const lat = row.latitude ? number(row.latitude) : null;
    const lng = row.longitude ? number(row.longitude) : null;
    if (row.latitude && !(lat >= -90 && lat <= 90)) errors.push("latitude must be a number from -90 to 90.");
    if (row.longitude && !(lng >= -180 && lng <= 180)) errors.push("longitude must be a number from -180 to 180.");
    if (!row.latitude !== !row.longitude) errors.push("Give both latitude and longitude, or neither.");

    let siteId = null;
    const matches = sitesByName.get(row.customer) || [];
    if (!row.customer) errors.push("customer is missing.");
    else if (matches.length > 1) errors.push(`More than one customer is called "${row.customer}".`);
    else if (!matches.length) {
      const near = [...sitesByName.keys()].find((n) => n.toLowerCase() === row.customer.toLowerCase());
      errors.push(`No customer is called "${row.customer}"${near ? ` (did you mean "${near}"?)` : ""}.`);
    } else siteId = matches[0];

    const existing = row.id && Object.hasOwn(lots, row.id) ? lots[row.id] || {} : null;
    if (existing && siteId && existing.siteId && existing.siteId !== siteId) {
      errors.push(`Lot ${row.id} belongs to ${sites[existing.siteId]?.name ? `"${sites[existing.siteId].name}"` : "another customer"}; an import can't move it.`);
    }
    if (errors.length) return { ...row, status: "error", errors };

    const location = row.latitude ? { latitude: lat, longitude: lng } : {};
    if (!existing) {
      const size = spots === null ? {} : { totalSpots: spots };
      return { ...row, status: "new", siteId, fields: { name: row.name, ...size, siteId, ...location }, notes: [] };
    }
    // Existing: only what changes, of totalSpots and the location. A blank one keeps the current value.
    const fields = {};
    if (spots !== null && !sameNumber(existing.totalSpots, spots)) fields.totalSpots = spots;
    if (row.latitude && !(sameNumber(existing.latitude, lat) && sameNumber(existing.longitude, lng))) Object.assign(fields, location);
    const notes = [];
    if (existing.name && existing.name !== row.name) notes.push(`Name stays "${existing.name}".`);
    if (!existing.siteId) notes.push("Stays without a customer: assign it on the customer's page.");
    if (!Object.keys(fields).length) notes.push("Nothing to change.");
    return { ...row, status: "update", siteId, existing, fields, notes };
  });
  return { rows: planned };
}

// The database paths one row writes, relative to the data root. A new lot is one
// write of the whole lot; an existing one writes each changed field on its own,
// which is all the rules let a platform admin change.
export function rowUpdates(row) {
  if (row.status === "new") return { [`lots/${row.id}`]: row.fields };
  if (row.status === "update") return Object.fromEntries(Object.entries(row.fields).map(([k, v]) => [`lots/${row.id}/${k}`, v]));
  return {};
}

// Writes the new and update rows, `size` at a time, each batch as one multi-path
// update. A batch the database refuses is retried row by row, so one bad row fails
// alone and the others still land. `write(updates)` resolves or throws.
//   opts: { size, onProgress({ done, total }), shouldStop() }
export async function runImport(rows, write, { size = BATCH_SIZE, onProgress, shouldStop } = {}) {
  const todo = rows.filter((r) => (r.status === "new" || r.status === "update") && Object.keys(rowUpdates(r)).length);
  const results = new Map();
  let stopped = false;
  for (let i = 0; i < todo.length; i += size) {
    if (shouldStop?.()) { stopped = true; break; }
    const batch = todo.slice(i, i + size);
    try {
      await write(Object.assign({}, ...batch.map(rowUpdates)));
      for (const r of batch) results.set(r, { ok: true });
    } catch {
      for (const r of batch) {
        try {
          await write(rowUpdates(r));
          results.set(r, { ok: true });
        } catch (err) {
          results.set(r, { ok: false, error: writeError(err) });
        }
      }
    }
    onProgress?.({ done: Math.min(i + size, todo.length), total: todo.length });
  }
  const out = rows.map((r) => {
    if (r.status === "error") return { row: r, outcome: "skipped" };
    if (!todo.includes(r)) return { row: r, outcome: "unchanged" };
    const res = results.get(r);
    if (!res) return { row: r, outcome: "not written" };
    if (!res.ok) return { row: r, outcome: "failed", error: res.error };
    return { row: r, outcome: r.status === "new" ? "created" : "updated" };
  });
  const count = (o) => out.filter((x) => x.outcome === o).length;
  return {
    results: out,
    stopped,
    summary: { created: count("created"), updated: count("updated"), unchanged: count("unchanged"), failed: count("failed"), skipped: count("skipped"), notWritten: count("not written") },
  };
}

// The database's refusal, in the page's words.
export function writeError(err) {
  if (err?.code === "PERMISSION_DENIED" || /permission/i.test(err?.message || "")) {
    return "The database refused it: the lot may have been created or changed since the preview, or this account is no longer a platform admin.";
  }
  return `Couldn't write: ${err?.message || "unknown error"}`;
}

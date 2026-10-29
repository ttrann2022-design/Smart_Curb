import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { PageHeader, Card, Chips, Button, Notice } from "../components/ui";
import { sortedSites, writeLotImport } from "./data";
import { BATCH_SIZE, COLUMNS, IMPORT_LIMITS, planImport, runImport } from "./lotImport";
import { ConsoleEmpty, LoadError, LoadingCard } from "./parts";

const STATUS_LABEL = { new: "New", update: "Update", error: "Error" };
const OUTCOME = {
  created: { label: "Created", tone: "new" },
  updated: { label: "Updated", tone: "update" },
  unchanged: { label: "No change", tone: "plain" },
  failed: { label: "Failed", tone: "error" },
  skipped: { label: "Skipped", tone: "plain" },
  "not written": { label: "Not written", tone: "plain" },
};
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const pair = (lat, lng) => `${lat === "" || lat === undefined ? "–" : lat}, ${lng === "" || lng === undefined ? "–" : lng}`;

// The location cell: what the row gives, the old one → the new one for a moved lot,
// or the lot's current location when the row leaves it blank (it's kept).
function Location({ row }) {
  const old = row.existing && typeof row.existing.latitude === "number" ? pair(row.existing.latitude, row.existing.longitude) : null;
  if (!row.latitude && !row.longitude) {
    return old && row.status === "update" ? <span className="cn-dim" title="Left blank, so the current location is kept">{old} (kept)</span> : <span className="cn-dim">No location</span>;
  }
  const given = pair(row.latitude, row.longitude);
  return <><span className="cn-key">At </span>{row.status === "update" && row.fields.latitude !== undefined && old ? `${old} → ${given}` : given}</>;
}

// One row of the preview or the results: line, id, name, customer, spots, location, then status and why.
function Row({ row, badge, tone, detail }) {
  const spotsChange = row.status === "update" && row.fields.totalSpots !== undefined ? `${row.existing.totalSpots ?? "–"} → ${row.totalSpots}` : row.totalSpots;
  return (
    <div role="row" className={`cn-row im-row${tone === "error" ? " is-error" : ""}`}>
      <div role="cell" className="cn-c cn-num cn-dim im-line"><span className="cn-key">Line </span>{row.line}</div>
      <div role="cell" className="cn-c cn-num im-id" translate="no">{row.id || <span className="cn-dim">no id</span>}</div>
      <div role="cell" className="cn-c im-name" title={row.name}>{row.name || <span className="cn-dim">no name</span>}</div>
      <div role="cell" className="cn-c im-cust" title={row.customer}>{row.customer || <span className="cn-dim">no customer</span>}</div>
      <div role="cell" className="cn-c cn-num im-spots"><span className="cn-key">Spots </span>{spotsChange || "–"}</div>
      <div role="cell" className="cn-c cn-num im-loc"><Location row={row} /></div>
      <div role="cell" className="cn-c im-status">
        <span className={`sws-badge im-badge is-${tone}`}>{badge}</span>
        {detail?.length > 0 && <ul className="im-why">{detail.map((d) => <li key={d}>{d}</li>)}</ul>}
      </div>
    </div>
  );
}

function RowTable({ label, children }) {
  return (
    <div className="cn-list">
      <div role="table" aria-label={label}>
        <div role="row" className="cn-row im-row cn-head">
          {["Line", "ID", "Name", "Customer", "Spots", "Location", "Status"].map((h) => <div key={h} role="columnheader" className="sws-th">{h}</div>)}
        </div>
        <div role="rowgroup" className="cn-body">{children}</div>
      </div>
    </div>
  );
}

const PREVIEW_FILTERS = [
  { id: "all", label: "All rows" },
  { id: "error", label: "Errors" },
  { id: "new", label: "New" },
  { id: "update", label: "Updates" },
];

function ImportLots() {
  const { mode, data } = useOutletContext();
  const { loaded, error, sites, lots } = data;
  const [text, setText] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(null); // { done, total } while importing
  const [result, setResult] = useState(null);
  const stop = useRef(false);
  useEffect(() => () => { stop.current = true; }, []);

  // Typing stays quick on long pastes: the preview follows a step behind.
  const deferred = useDeferredValue(text);
  const plan = useMemo(() => (deferred.trim() && loaded ? planImport(deferred, lots, sites) : null), [deferred, loaded, lots, sites]);

  const head = (
    <PageHeader
      title="Import lots"
      live={loaded && !error}
      subtitle={mode === "sim" ? "Create and update simulated lots from CSV" : "Create and update lots from CSV, checked before anything is written"}
    />
  );
  if (error) return <>{head}<div className="sws-page-body sws-narrow"><LoadError error={error} /></div></>;
  if (!loaded) return <>{head}<div className="sws-page-body"><LoadingCard rows={3} /></div></>;

  const rows = plan?.rows || [];
  const count = (s) => rows.filter((r) => r.status === s).length;
  const counts = { new: count("new"), update: count("update"), error: count("error") };
  const writable = rows.filter((r) => r.status === "new" || (r.status === "update" && Object.keys(r.fields).length));
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const firstSite = sortedSites(sites)[0]?.[1]?.name;

  const start = async () => {
    stop.current = false;
    setBusy({ done: 0, total: writable.length });
    const out = await runImport(rows, (updates) => writeLotImport(mode, updates), {
      onProgress: (p) => { if (!stop.current) setBusy(p); },
      shouldStop: () => stop.current,
    });
    if (stop.current) return;
    setBusy(null);
    setResult(out);
    // The summary replaces the preview: start from the top, and let screen readers land on it.
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0 });
      document.getElementById("main")?.focus({ preventScroll: true });
    });
  };

  const reset = () => { setResult(null); setText(""); setFilter("all"); };

  if (result) {
    const s = result.summary;
    const failed = result.results.filter((x) => x.outcome === "failed");
    const parts = [s.created && `${plural(s.created, "lot")} created`, s.updated && `${plural(s.updated, "lot")} updated`, s.unchanged && `${s.unchanged.toLocaleString()} unchanged`, s.skipped && `${plural(s.skipped, "row")} with errors skipped`].filter(Boolean);
    return (
      <>
        {head}
        <div className="sws-page-body">
          <Notice tone={failed.length ? "warn" : "ok"} title={failed.length ? `Import finished: ${plural(failed.length, "row")} failed` : "Import finished"} role="status">
            {parts.length ? `${parts.join(" · ")}.` : "Nothing needed writing."}
            {failed.length > 0 && " The failed rows are listed first below; fix them and paste just those again."}
          </Notice>
          <Card title="Results" subtitle={`${plural(result.results.length, "row")} from the paste`} actions={<Button icon="arrowRight" onClick={reset}>New import</Button>}>
            <RowTable label="Import results">
              {[...failed, ...result.results.filter((x) => x.outcome !== "failed")].map(({ row, outcome, error: why }) => (
                <Row key={row.line} row={row} badge={OUTCOME[outcome].label} tone={OUTCOME[outcome].tone} detail={why ? [why] : row.errors} />
              ))}
            </RowTable>
          </Card>
          <p className="sws-note">See the lots on <Link to="/deployments" className="sws-link">Deployments</Link> or each customer's page.</p>
        </div>
      </>
    );
  }

  const options = PREVIEW_FILTERS.map((f) => ({ ...f, count: f.id === "all" ? rows.length : counts[f.id] }));
  const label = busy ? `Importing… ${busy.done} of ${busy.total}` : `Import ${plural(writable.length, "lot")}`;

  return (
    <>
      {head}
      <div className="sws-page-body">
        <Card title="Paste CSV" subtitle="Nothing is written until you press Import." className="im-paste">
          <div className="cn-field">
            <label htmlFor="im-csv" className="sws-field-label">CSV text</label>
            <textarea
              id="im-csv" className="sws-input cn-textarea im-text" rows={8} spellCheck={false} autoComplete="off"
              aria-describedby="im-csv-hint" value={text} disabled={!!busy}
              onChange={(e) => { setText(e.target.value); setFilter("all"); }}
              placeholder={`${COLUMNS.join(",")}\nnorthgarage,North Garage,${firstSite || "Customer name"},120,40.7128,-74.006`}
            />
            <div id="im-csv-hint" className="sws-field-hint im-hint">
              First line:<code translate="no" className="im-cols">{COLUMNS.join(", ")}</code>
              <ul className="im-rules">
                <li>IDs use lowercase letters and numbers; customer is a customer's exact name.</li>
                <li>totalSpots is 1 to {IMPORT_LIMITS.maxSpots.toLocaleString()}; give latitude and longitude together or leave both empty.</li>
                <li>Existing lots only get totalSpots and location; their name and customer never change, and nothing is deleted.</li>
              </ul>
            </div>
          </div>
        </Card>

        {plan?.error && <Notice tone="busy" title="Can't read this CSV" role="alert">{plan.error}</Notice>}

        {rows.length > 0 && (
          <Card
            title="Preview"
            subtitle={[counts.new && `${counts.new} new`, counts.update && `${plural(counts.update, "update")}`, counts.error && `${plural(counts.error, "error")}`].filter(Boolean).join(" · ")}
          >
            <div className="im-bar">
              <Chips label="Show rows" options={options} value={filter} onChange={setFilter} />
            </div>
            {shown.length ? (
              <RowTable label="Import preview">
                {shown.map((r) => (
                  <Row key={r.line} row={r} badge={STATUS_LABEL[r.status]} tone={r.status} detail={r.status === "error" ? r.errors : r.notes} />
                ))}
              </RowTable>
            ) : <p className="sws-note">No rows with this status.</p>}
            <div className="im-actions">
              <Button variant="primary" icon="check" busy={!!busy} disabled={!!busy || !writable.length} onClick={start}>{label}</Button>
              <span className="sws-note" role="status">
                {busy ? "Keep this page open until it finishes."
                  : !writable.length ? (counts.error ? "Fix the errors above: no row can be imported yet." : "Nothing to change: every lot already matches.")
                    : counts.error ? `${plural(counts.error, "row")} with errors will be skipped.` : `Writes in batches of ${BATCH_SIZE} to ${mode === "sim" ? "Simulation" : "Live"} data.`}
              </span>
            </div>
          </Card>
        )}

        {!rows.length && !plan?.error && (
          <ConsoleEmpty icon="lots" title="Paste rows to see a preview">
            Each row is marked new, update or error before anything is written. Up to {IMPORT_LIMITS.rows.toLocaleString()} rows at a time.
          </ConsoleEmpty>
        )}
      </div>
    </>
  );
}

export default ImportLots;

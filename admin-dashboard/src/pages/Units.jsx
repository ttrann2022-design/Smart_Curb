import { useEffect, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { useScoped } from "../useScope";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";
import { dataPath } from "../dataMode";
import { LED_HEX } from "../theme";
import { useAlertSettings, useNow, hasBattery, isLowBattery, unitIssues, statusKey, cleanText, formatAgo, formatExact, STALL_WORD } from "../units";
import Icon from "../components/Icon";
import { StallMark } from "../components/LotPlan";
import { PageHeader, Chips, SearchInput, EmptyState, Button } from "../components/ui";

const FILTERS = [
  { id: "all", label: "All units" },
  { id: "attention", label: "Needs attention" },
  { id: "offline", label: "Offline" },
  { id: "lowbattery", label: "Low battery" },
  { id: "open", label: "Free spots" },
];

const STATUS_RANK = { open: 0, occupied: 1, offline: 2 };

// Sortable columns: key -> value to compare. Missing values always sort last.
const SORTS = {
  id: (id) => id,
  lot: (id, u, lotName) => lotName.toLowerCase(),
  status: (id, u) => STATUS_RANK[statusKey(u)],
  battery: (id, u) => (hasBattery(u) ? u.battery : null),
  lastUpdated: (id, u) => (typeof u.lastUpdated === "number" ? u.lastUpdated : null),
};

const HEADERS = [
  { label: "Unit", sort: "id" },
  { label: "Lot", sort: "lot" },
  { label: "Status", sort: "status" },
  { label: "Battery", sort: "battery" },
  { label: "Last change", sort: "lastUpdated" },
  { label: "LED" },
  { label: "Panel text" },
];

function Units() {
  const [allLots, setLots] = useState({});
  const [rawUnits, setUnits] = useState({});
  // Only the lots and curbs this account may see (src/scope.js).
  const { lots, units } = useScoped(allLots, rawUnits);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "id", dir: 1 });
  const alerts = useAlertSettings();
  const now = useNow();
  const { mode } = useOutletContext();
  const filter = FILTERS.some((f) => f.id === params.get("filter")) ? params.get("filter") : "all";

  useEffect(() => {
    const stopLots = onValue(ref(database, dataPath("lots")), (snap) => setLots(snap.val() || {}));
    const stopUnits = onValue(ref(database, dataPath("units")), (snap) => setUnits(snap.val() || {}));
    return () => { stopLots(); stopUnits(); };
  }, []);

  const setFilter = (id) => setParams(id === "all" ? {} : { filter: id }, { replace: true });
  const lotName = (u) => lots[u.lot]?.name || (u.lot === undefined ? "Unassigned" : `Unknown lot (${u.lot})`);

  const matches = {
    all: () => true,
    attention: (u) => unitIssues(u, alerts, now).length > 0,
    offline: (u) => !u.online,
    lowbattery: (u) => isLowBattery(u, alerts),
    open: (u) => u.online && !u.occupied,
  };

  const allUnits = Object.entries(units);
  const q = search.trim().toLowerCase();
  const searched = allUnits.filter(([id, u]) => !q || id.toLowerCase().includes(q) || lotName(u).toLowerCase().includes(q));
  const pick = SORTS[sort.key];
  const rows = searched
    .filter(([, u]) => matches[filter](u))
    .sort(([ida, a], [idb, b]) => {
      const va = pick(ida, a, lotName(a));
      const vb = pick(idb, b, lotName(b));
      if (va === null && vb !== null) return 1;
      if (vb === null && va !== null) return -1;
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return cmp * sort.dir || ida.localeCompare(idb);
    });

  const chipOptions = FILTERS.map((f) => ({ ...f, count: searched.filter(([, u]) => matches[f.id](u)).length }));

  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: 1 }));

  return (
    <>
      <PageHeader
        title="Curb units"
        subtitle={mode === "sim" ? "Every simulated curb across every lot" : "Every curb across every lot, live from the hardware"}
      />

      <div className="sws-page-body">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-3)", flexWrap: "wrap" }}>
          <Chips label="Filter units" options={chipOptions} value={filter} onChange={setFilter} />
          <SearchInput label="Search by unit or lot" placeholder="Search unit or lot…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240, maxWidth: "100%" }} />
        </div>

        <div className="un-wrap sws-enter">
          <p className="un-meta" role="status">{rows.length} of {allUnits.length} {allUnits.length === 1 ? "unit" : "units"}</p>
          <div role="table" aria-label="Curb units" aria-rowcount={rows.length + 1}>
            <div role="rowgroup">
              <div role="row" className="un-row un-head">
                {HEADERS.map((h) => {
                  if (!h.sort) return <div key={h.label} role="columnheader" className="sws-th">{h.label}</div>;
                  const active = sort.key === h.sort;
                  const ariaSort = active ? (sort.dir === 1 ? "ascending" : "descending") : "none";
                  return (
                    <div key={h.label} role="columnheader" aria-sort={ariaSort}>
                      <button type="button" className="sws-th" data-active={active || undefined} onClick={() => toggleSort(h.sort)}>
                        {h.label}
                        <Icon name={active ? (sort.dir === 1 ? "arrowUp" : "arrowDown") : "sort"} size={11} strokeWidth={2.2} style={{ opacity: active ? 1 : 0.45 }} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div role="rowgroup" className="un-body">
              {rows.length === 0 && (
                <EmptyState
                  icon={allUnits.length ? "search" : "units"}
                  title={allUnits.length ? "No units match" : "No curbs yet"}
                  action={allUnits.length && (filter !== "all" || q) ? <Button size="sm" onClick={() => { setFilter("all"); setSearch(""); }}>Clear filters</Button> : null}
                >
                  {allUnits.length ? "Try a different filter or search." : "Curbs appear here as soon as they report in."}
                </EmptyState>
              )}

              {rows.map(([id, u]) => {
                const status = statusKey(u);
                const low = isLowBattery(u, alerts);
                const led = cleanText(u.ledColor);
                const ago = formatAgo(u.lastUpdated, now);
                const known = !!lots[u.lot];
                return (
                  <div key={id} role="row" className="un-row">
                    <div role="cell" className="un-c un-id">
                      {/* Same block as the lot plans: colour = status, amber ring = low battery. */}
                      <StallMark status={status} low={low} swatch />
                      <span className="sws-mono" translate="no">{id}</span>
                    </div>
                    <div role="cell" className={`un-c un-lot${known ? "" : " un-warn"}`} title={lotName(u)}>{lotName(u)}</div>
                    <div role="cell" className={`un-c un-status${status === "offline" ? " un-dim" : ""}`}>{STALL_WORD[status]}</div>
                    <div role="cell" className="un-c un-batt">
                      {hasBattery(u) ? (
                        <>
                          <span className={`un-bar${low ? " is-low" : ""}`} aria-hidden="true"><span style={{ width: `${u.battery}%` }} /></span>
                          <span className={`sws-mono${low ? " un-warn" : ""}`}>{u.battery}%</span>
                        </>
                      ) : (
                        <span className="un-dim">Not measured</span>
                      )}
                    </div>
                    <div role="cell" className={`un-c un-ago${ago ? "" : " un-dim"}`} title={formatExact(u.lastUpdated)}>{ago || "—"}</div>
                    <div role="cell" className={`un-c un-led${led ? "" : " is-unset"}`}>
                      {led ? (
                        <>
                          <span aria-hidden="true" className={`un-led-dot${LED_HEX[led] ? "" : " is-unknown"}`} style={LED_HEX[led] ? { background: LED_HEX[led] } : undefined} />
                          <span className={LED_HEX[led] ? undefined : "un-warn"}>{led}</span>
                        </>
                      ) : (
                        <span className="un-dim">LED not set</span>
                      )}
                    </div>
                    <div role="cell" className={`un-c un-text sws-mono${u.panelText ? "" : " un-dim is-unset"}`}>{u.panelText || "No text"}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default Units;

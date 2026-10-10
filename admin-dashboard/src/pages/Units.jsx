import { useEffect, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";
import { dataPath } from "../dataMode";
import { c, LED_HEX } from "../theme";
import { useAlertSettings, useNow, hasBattery, isLowBattery, unitIssues, statusKey, cleanText, formatAgo, formatExact } from "../units";
import Icon from "../components/Icon";
import { PageHeader, Card, Chips, SearchInput, StatusPill, EmptyState, Button } from "../components/ui";

const FILTERS = [
  { id: "all", label: "All units" },
  { id: "attention", label: "Needs attention" },
  { id: "offline", label: "Offline" },
  { id: "lowbattery", label: "Low battery" },
  { id: "open", label: "Open spots" },
];

const columns = "96px minmax(150px, 1.5fr) 120px 150px 110px 100px minmax(110px, 1fr)";

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

function batteryColor(b, alerts) {
  if (b < alerts.lowBattery) return c.busy;
  if (b < 50) return c.warn;
  return c.open;
}

function Units() {
  const [lots, setLots] = useState({});
  const [units, setUnits] = useState({});
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <Chips label="Filter units" options={chipOptions} value={filter} onChange={setFilter} />
          <SearchInput label="Search by unit or lot" placeholder="Search unit or lot" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} />
        </div>

        <Card title="Units" meta={`${rows.length} of ${allUnits.length} units`} body={false}>
          <div className="sws-table-scroll">
            <div role="table" aria-label="Curb units" aria-rowcount={rows.length + 1}>
              <div role="row" className="sws-trow sws-thead" style={{ gridTemplateColumns: columns }}>
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

              <div role="rowgroup" className="sws-tbody">
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
                  const led = cleanText(u.ledColor);
                  const ago = formatAgo(u.lastUpdated, now);
                  const known = !!lots[u.lot];
                  return (
                    <div key={id} role="row" className="sws-trow" style={{ gridTemplateColumns: columns }}>
                      <div role="cell" className="sws-mono" style={{ fontSize: 13, fontWeight: 600 }}>{id}</div>
                      <div role="cell" title={lotName(u)} style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: known ? c.text : c.warn }}>
                        {lotName(u)}
                      </div>
                      <div role="cell"><StatusPill status={statusKey(u)} /></div>
                      <div role="cell">
                        {hasBattery(u) ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                            <div aria-hidden="true" style={{ width: 64, height: 6, borderRadius: 3, background: c.line, overflow: "hidden" }}>
                              <div style={{ width: `${u.battery}%`, height: 6, background: batteryColor(u.battery, alerts) }} />
                            </div>
                            <span className="sws-mono" style={{ fontSize: 12.5, color: batteryColor(u.battery, alerts) }}>{u.battery}%</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12.5, color: c.dim }}>Not measured</span>
                        )}
                      </div>
                      <div role="cell" title={formatExact(u.lastUpdated)} style={{ fontSize: 12.5, color: ago ? c.text : c.dim }}>
                        {ago || "—"}
                      </div>
                      <div role="cell" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13 }}>
                        {led ? (
                          <>
                            <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: LED_HEX[led] || "transparent", border: LED_HEX[led] ? "none" : `1px dashed ${c.dim}`, display: "inline-block" }} />
                            <span style={{ color: LED_HEX[led] ? c.text : c.warn }}>{led}</span>
                          </>
                        ) : (
                          <span style={{ color: c.dim }}>Not set</span>
                        )}
                      </div>
                      <div role="cell" className="sws-mono" style={{ fontSize: 12.5, color: u.panelText ? c.text : c.dim }}>
                        {u.panelText || "Not set"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

export default Units;

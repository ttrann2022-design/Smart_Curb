import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";
import { dataPath } from "../dataMode";
import { c, LED_HEX } from "../theme";
import { useAlertSettings, useNow, hasBattery, isLowBattery, unitIssues, statusKey, cleanText, formatAgo, formatExact } from "../units";
import { PageHeader, Card, Chips, SearchInput, StatusPill, EmptyState } from "../components/ui";

const filters = [
  { id: "all", label: "All units" },
  { id: "attention", label: "Needs attention" },
  { id: "offline", label: "Offline" },
  { id: "lowbattery", label: "Low battery" },
  { id: "open", label: "Open spots" },
];

const columns = "96px minmax(150px, 1.5fr) 120px 150px 110px 100px minmax(110px, 1fr)";

function batteryColor(b, alerts) {
  if (b < alerts.lowBattery) return c.busy;
  if (b < 50) return c.warn;
  return c.open;
}

function Units() {
  const [lots, setLots] = useState({});
  const [units, setUnits] = useState({});
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const alerts = useAlertSettings();
  const now = useNow();

  useEffect(() => {
    const stopLots = onValue(ref(database, dataPath("lots")), (snap) => setLots(snap.val() || {}));
    const stopUnits = onValue(ref(database, dataPath("units")), (snap) => setUnits(snap.val() || {}));
    return () => { stopLots(); stopUnits(); };
  }, []);

  const allUnits = Object.entries(units);
  const rows = allUnits
    .filter(([id, u]) => {
      if (search && !id.toLowerCase().includes(search.toLowerCase())) return false;
      if (filter === "attention") return unitIssues(u, alerts, now).length > 0;
      if (filter === "offline") return !u.online;
      if (filter === "lowbattery") return isLowBattery(u, alerts);
      if (filter === "open") return u.online && !u.occupied;
      return true;
    })
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <>
      <PageHeader title="Curb units" subtitle="Every unit across every lot, live from Firebase" />

      <div className="sws-page-body">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <Chips label="Filter units" options={filters} value={filter} onChange={setFilter} />
          <SearchInput label="Search unit ID" placeholder="Search unit ID" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 230 }} />
        </div>

        <Card title="Units" meta={`${rows.length} of ${allUnits.length} units`} body={false}>
          <div className="sws-table-scroll">
            <div role="table" aria-label="Curb units">
              <div role="row" className="sws-trow sws-thead" style={{ gridTemplateColumns: columns }}>
                {["Unit", "Lot", "Status", "Battery", "Last change", "LED", "Panel text"].map((h) => (
                  <div key={h} role="columnheader" className="sws-th">{h}</div>
                ))}
              </div>

              <div role="rowgroup" className="sws-tbody">
                {rows.length === 0 && (
                  <EmptyState icon="search" title="No units match">Try a different filter or search.</EmptyState>
                )}

                {rows.map(([id, u]) => {
                  const led = cleanText(u.ledColor);
                  const ago = formatAgo(u.lastUpdated, now);
                  return (
                    <div key={id} role="row" className="sws-trow" style={{ gridTemplateColumns: columns }}>
                      <div role="cell" className="sws-mono" style={{ fontSize: 13, fontWeight: 600 }}>{id}</div>
                      <div role="cell" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lots[u.lot]?.name || u.lot}</div>
                      <div role="cell"><StatusPill status={statusKey(u)} /></div>
                      <div role="cell">
                        {hasBattery(u) ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                            <div style={{ width: 64, height: 6, borderRadius: 3, background: c.line, overflow: "hidden" }}>
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
                            <span style={{ width: 12, height: 12, borderRadius: 3, background: LED_HEX[led] || c.dim, display: "inline-block" }} />
                            {led}
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

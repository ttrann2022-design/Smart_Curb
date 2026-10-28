import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { facilityById } from "../site";
import { useNow, formatAgo, formatExact } from "../units";
import { LEAD_STATUSES } from "../leads";
import { PageHeader, Card, StatTile, EmptyState, Button, StatusText } from "../components/ui";
import { isOnline, summarize } from "./data";
import { addFakeLead, seedDemoCustomers, unassignedDemoLots } from "./demoSeed";
import { LoadError, LoadingCard } from "./parts";

const STATUS_LABEL = Object.fromEntries(LEAD_STATUSES.map((s) => [s.id, s.label]));

function Tile({ to, label, children, ...tile }) {
  return (
    <Link to={to} className="cn-tile-link">
      <StatTile label={label} {...tile} />
      <span className="sws-sr-only">{children}</span>
    </Link>
  );
}

// Simulation only: reload the fake customers, or send a fake request.
function SimulationCard({ lots }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const loose = unassignedDemoLots(lots);
  const run = async (fn) => {
    setBusy(true);
    setMsg(null);
    try { setMsg({ ok: true, text: await fn() }); } catch (err) { setMsg({ ok: false, text: err.message }); }
    setBusy(false);
  };
  return (
    <Card title="Simulated customers" subtitle="Demo University, Demo Mall and Demo Hotel, with the dashboard's simulated lots. Nothing here is real." delay={180}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {loose.length > 0 && (
          <div className="sws-note">{loose.length} simulated {loose.length === 1 ? "lot has" : "lots have"} no customer. Reload the demo customers to assign {loose.length === 1 ? "it" : "them"} again.</div>
        )}
        {confirm ? (
          <div role="alertdialog" aria-label="Confirm reload" className="sws-notice sws-notice-sim" style={{ alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ flex: "1 1 220px" }}>Replace every simulated customer and request with the fresh demo set?</span>
            <Button variant="sim" onClick={() => { setConfirm(false); run(seedDemoCustomers); }} disabled={busy} autoFocus>Yes, reload</Button>
            <Button onClick={() => setConfirm(false)}>Cancel</Button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button onClick={() => setConfirm(true)} disabled={busy}>Reload demo customers</Button>
            <Button onClick={() => run(addFakeLead)} disabled={busy}>Send a fake quote request</Button>
          </div>
        )}
        <StatusText msg={msg} />
      </div>
    </Card>
  );
}

function Home() {
  const { mode, data } = useOutletContext();
  const now = useNow();
  const { loaded, error, sites, leads, lots, units } = data;
  const sim = mode === "sim";

  const head = <PageHeader title="Home" subtitle={sim ? "Simulated customers, requests and curbs" : "Customers, quote requests and where the system is deployed"} live={loaded && !error} />;
  if (error) return <>{head}<div className="sws-page-body sws-narrow"><LoadError error={error} /></div></>;
  if (!loaded) {
    return (
      <>
        {head}
        <div className="sws-page-body">
          <div className="cn-tiles">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="sws-tile-stat"><div className="sws-skel" style={{ height: 52 }} /></div>)}</div>
          <LoadingCard />
        </div>
      </>
    );
  }

  const leadList = Object.entries(leads).map(([id, l]) => ({ id, ...l })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const newCount = leadList.filter((l) => l.status === "new").length;
  const siteList = Object.values(sites);
  const active = siteList.filter((s) => s.status === "active").length;
  const { unassignedLots } = summarize(data);
  const lotCount = Object.keys(lots).length;
  const unitList = Object.values(units);
  const online = unitList.filter(isOnline).length;
  const newest = leadList.slice(0, 5);

  return (
    <>
      {head}
      <div className="sws-page-body">
        <div className="cn-tiles sws-enter">
          <Tile to="/requests" label="New requests" value={newCount} sub={`of ${leadList.length}`} color={newCount ? "var(--brand)" : undefined}>Open requests</Tile>
          <Tile to="/customers" label="Customers" value={siteList.length}>Open customers</Tile>
          <Tile to="/customers" label="Active sites" value={active} sub={`of ${siteList.length}`}>Open customers</Tile>
          <Tile to="/deployments" label="Lots" value={lotCount} sub={unassignedLots.length ? `${unassignedLots.length} unassigned` : lotCount ? "all assigned" : undefined}>Open deployments</Tile>
          <Tile to="/deployments" label="Curbs online" value={online} sub={`of ${unitList.length}`} subColor={online < unitList.length ? "var(--attention)" : undefined}>Open deployments</Tile>
        </div>

        <Card title="Newest requests" delay={90} actions={leadList.length > 0 && <Link to="/requests" className="sws-link">All requests</Link>} body={false}>
          {newest.length === 0 ? (
            <EmptyState icon="inbox" title="No requests yet">
              {sim ? "Send a fake quote request below, or reload the demo customers." : "Quote requests from the website appear here as they arrive."}
            </EmptyState>
          ) : (
            <div className="cn-list">
              <ul className="cn-body" style={{ listStyle: "none", margin: 0, padding: "4px 6px" }} aria-label="Newest quote requests">
                {newest.map((l) => (
                  <li key={l.id}>
                    <Link to={`/requests#${l.id}`} className="cn-row cn-req" style={{ gridTemplateColumns: "minmax(0, 1fr) auto", padding: "10px 12px" }}>
                      <span className="cn-c">
                        <span className="cn-name">{l.name}</span>
                        <span className="cn-dim"> · {[l.organization, facilityById(l.facilityType)?.label].filter(Boolean).join(" · ") || "No organization"}</span>
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="cn-dim" style={{ fontSize: 12 }} title={formatExact(l.createdAt)}>{formatAgo(l.createdAt, now) || "Date unknown"}</span>
                        <span className={`sws-badge rq-badge is-${l.status}`}>{(STATUS_LABEL[l.status] || l.status || "").toUpperCase()}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {sim && <SimulationCard lots={lots} />}
      </div>
    </>
  );
}

export default Home;

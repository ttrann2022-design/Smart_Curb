import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { facilityById } from "../site";
import { useNow, formatAgo, formatExact } from "../units";
import { LEAD_STATUSES } from "../leads";
import Icon from "../components/Icon";
import { PageHeader, Card, Button, StatusText, Skeleton } from "../components/ui";
import { isOnline, sortedSites, summarize } from "./data";
import { addFakeLead, seedDemoCustomers, unassignedDemoLots } from "./demoSeed";
import { ConsoleEmpty, CustomerCards, LoadError } from "./parts";

const STATUS_LABEL = Object.fromEntries(LEAD_STATUSES.map((s) => [s.id, s.label]));
// Home shows this many customer cards; the rest are on Customers.
const MAX_CARDS = 6;
const STATUS_ORDER = { active: 0, prospect: 1, paused: 2 };

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

// Requests -> Prospect -> Active, each a link to where those live.
function Pipeline({ open, prospects, active }) {
  const steps = [
    { to: "/requests", n: open, label: "Requests", sub: "new or contacted" },
    { to: "/customers?status=prospect", n: prospects, label: "Prospect", sub: "customers not live yet" },
    { to: "/customers?status=active", n: active, label: "Active", sub: "customers with curbs live" },
  ];
  return (
    <nav className="cn-pipe" aria-label="Sales pipeline">
      <ol>
        {steps.map((s, i) => (
          <li key={s.label}>
            {i > 0 && <Icon name="arrowRight" size={16} className="cn-pipe-arrow" />}
            <Link to={s.to} className="cn-pipe-step">
              <span className="cn-pipe-n">{s.n}</span>
              <span className="cn-pipe-l">{s.label}</span>
              <span className="cn-pipe-s">{s.sub}</span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function HomeSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="cn-home">
      <div className="cn-hero">
        <div className="cn-hero-main">
          <span className="cn-hero-big cn-ghost sws-skel">00</span>
          <Skeleton width={280} height={14} style={{ marginTop: 20, maxWidth: "100%" }} />
        </div>
        <div className="cn-pipe"><Skeleton height={86} /></div>
      </div>
      <div className="cn-cards">{[0, 1, 2].map((i) => <Skeleton key={i} height={210} />)}</div>
    </div>
  );
}

function Home() {
  const { mode, data } = useOutletContext();
  const now = useNow();
  const { loaded, error, sites, leads, lots, units } = data;
  const sim = mode === "sim";

  const head = <PageHeader title="Home" subtitle={sim ? "Simulated customers, requests and curbs" : "Customers, quote requests and where the system is deployed"} live={loaded && !error} />;
  if (error) return <>{head}<div className="sws-page-body sws-narrow"><LoadError error={error} /></div></>;
  if (!loaded) return <>{head}<div className="sws-page-body"><HomeSkeleton /></div></>;

  const leadList = Object.entries(leads).map(([id, l]) => ({ id, ...l })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const newCount = leadList.filter((l) => l.status === "new").length;
  const openCount = leadList.filter((l) => l.status === "new" || l.status === "contacted").length;
  const siteList = Object.values(sites);
  const countOf = (status) => siteList.filter((s) => s.status === status).length;
  const { siteStats, unassignedLots } = summarize(data);
  const lotCount = Object.keys(lots).length;
  const unitList = Object.values(units);
  const online = unitList.filter(isOnline).length;
  const newest = leadList.slice(0, 5);
  const cards = sortedSites(sites).sort(([, a], [, b]) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3)).slice(0, MAX_CARDS);

  return (
    <>
      {head}
      <div className="sws-page-body cn-home">
        <section className="cn-hero sws-enter" aria-label="Quote requests">
          <div className="cn-hero-main">
            <div className="cn-hero-num">
              {/* Keyed by value: a new request rolls the number into place. */}
              <span className={`cn-hero-big${newCount ? " is-on" : ""}`}><span key={newCount} className="ov-num">{newCount}</span></span>
              <span className="cn-hero-word">new</span>
            </div>
            <p className="cn-hero-line">
              {newCount === 0
                ? "No quote requests are waiting for a reply."
                : `${newCount === 1 ? "Quote request" : "Quote requests"} waiting for a first reply.`}{" "}
              <Link to="/requests" className="sws-link">Open requests <span aria-hidden="true">→</span></Link>
            </p>
            <ul className="cn-hero-facts">
              <li><span className="cn-num">{lotCount}</span> {lotCount === 1 ? "lot" : "lots"}{unassignedLots.length ? <>, <Link to="/deployments" className="sws-link">{unassignedLots.length} without a customer</Link></> : ""}</li>
              <li><span className={`cn-num${online < unitList.length ? " cn-warn" : ""}`}>{online}</span> of <span className="cn-num">{unitList.length}</span> curbs online</li>
            </ul>
          </div>
          <Pipeline open={openCount} prospects={countOf("prospect")} active={countOf("active")} />
        </section>

        <section className="cn-section sws-enter" style={{ "--d": "60ms" }} aria-labelledby="home-cust-h">
          <div className="cn-section-head">
            <h2 id="home-cust-h" className="cn-h2">Customers</h2>
            {siteList.length > MAX_CARDS && <span className="sws-card-meta">{MAX_CARDS} of {siteList.length}</span>}
            {siteList.length > 0 && <Link to="/customers" className="sws-link cn-section-all">All customers <span aria-hidden="true">→</span></Link>}
          </div>
          {cards.length === 0 ? (
            <ConsoleEmpty icon="users" title="No customers yet" action={<Link to="/customers" className="sws-btn sws-btn-secondary sws-btn-sm">Add a customer</Link>}>
              {sim ? "Reload the demo customers below, or add one on Customers." : "Add one on Customers, or convert a quote request."}
            </ConsoleEmpty>
          ) : (
            <CustomerCards sites={cards} siteStats={siteStats} now={now} />
          )}
        </section>

        <section className="cn-section sws-enter" style={{ "--d": "120ms" }} aria-labelledby="home-req-h">
          <div className="cn-section-head">
            <h2 id="home-req-h" className="cn-h2">Newest requests</h2>
            {leadList.length > 0 && <Link to="/requests" className="sws-link cn-section-all">All requests <span aria-hidden="true">→</span></Link>}
          </div>
          {newest.length === 0 ? (
            <ConsoleEmpty icon="inbox" title="No requests yet">
              {sim ? "Send a fake quote request below, or reload the demo customers." : "Quote requests from the website appear here as they arrive."}
            </ConsoleEmpty>
          ) : (
            <div className="cn-list sws-card">
              <ul className="cn-body" style={{ listStyle: "none", margin: 0, padding: "4px 6px" }} aria-label="Newest quote requests">
                {newest.map((l) => (
                  <li key={l.id}>
                    <Link to={`/requests#${l.id}`} className="cn-row cn-req">
                      <span className="cn-c">
                        <span className="cn-name">{l.name}</span>
                        <span className="cn-dim"> · {[l.organization, facilityById(l.facilityType)?.label].filter(Boolean).join(" · ") || "No organization"}</span>
                      </span>
                      <span className="cn-req-end">
                        <span className="cn-dim" style={{ fontSize: 12 }} title={formatExact(l.createdAt)}>{formatAgo(l.createdAt, now) || "Date unknown"}</span>
                        <span className={`sws-badge rq-badge is-${l.status}`}>{(STATUS_LABEL[l.status] || l.status || "").toUpperCase()}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {sim && <SimulationCard lots={lots} />}
      </div>
    </>
  );
}

export default Home;

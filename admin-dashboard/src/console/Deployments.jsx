import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useNow } from "../units";
import { PageHeader, Card, Chips } from "../components/ui";
import { isLow, isOnline, lotName, sortedSites, summarize } from "./data";
import { ConsoleEmpty, CurbRows, LoadError, LoadingCard, LotRow, SiteStatusBadge } from "./parts";

const FILTERS = [
  { id: "all", label: "All curbs", test: () => true },
  { id: "offline", label: "Offline", test: (u) => !isOnline(u) },
  { id: "low", label: "Low battery", test: (u) => isOnline(u) && isLow(u) },
];

// A lot's size, for the row's meta line.
const spots = (lot) => (typeof lot?.totalSpots === "number" ? `${lot.totalSpots.toLocaleString()} ${lot.totalSpots === 1 ? "spot" : "spots"}` : "");

function Deployments() {
  const { mode, data } = useOutletContext();
  const now = useNow();
  const [filter, setFilter] = useState("all");
  const { loaded, error, sites, lots, units } = data;

  const head = <PageHeader title="Deployments" live={loaded && !error} subtitle={mode === "sim" ? "Simulated customers, their lots and curbs" : "Which customer each lot and curb belongs to, live from the hardware"} />;
  if (error) return <>{head}<div className="sws-page-body sws-narrow"><LoadError error={error} /></div></>;
  if (!loaded) return <>{head}<div className="sws-page-body"><LoadingCard rows={5} /></div></>;

  const { siteStats, lotStats, lotUnits, unassignedLots, looseUnits } = summarize(data);
  const active = FILTERS.find((f) => f.id === filter);
  const pick = (list) => list.filter(([, u]) => active.test(u || {}));
  const allUnits = Object.values(units);
  const options = FILTERS.map((f) => ({ id: f.id, label: f.label, count: allUnits.filter((u) => f.test(u || {})).length }));
  const sitesWithLots = sortedSites(sites).filter(([id]) => siteStats[id].lots.length > 0);
  const sitesWithout = sortedSites(sites).filter(([id]) => siteStats[id].lots.length === 0);
  // With a filter on, hide lots with nothing to show.
  const visibleLots = (ids) => (filter === "all" ? ids : ids.filter((id) => pick(lotUnits[id] || []).length));

  const lotRows = (ids) => (
    <div className="cn-lrows">
      {visibleLots(ids).map((lotId) => (
        <LotRow key={lotId} name={lotName(lots, lotId)} detail={spots(lots[lotId])} stats={lotStats[lotId]} curbs={pick(lotUnits[lotId] || [])} now={now} />
      ))}
    </div>
  );

  if (!Object.keys(lots).length && !allUnits.length) {
    return (
      <>
        {head}
        <div className="sws-page-body sws-narrow">
          <ConsoleEmpty icon="units" title="Nothing deployed yet">
            {mode === "sim" ? "Load simulated data on the dashboard's Simulation page, then reload the demo customers from Home." : "Lots and curbs appear here once the hardware reports in."}
          </ConsoleEmpty>
        </div>
      </>
    );
  }

  const shownSites = sitesWithLots.filter(([id]) => visibleLots(siteStats[id].lots).length);
  const shownFree = visibleLots(unassignedLots);
  const shownLoose = pick(looseUnits);
  const nothing = filter !== "all" && !shownSites.length && !shownFree.length && !shownLoose.length;
  // Cards fade in one after another (capped), in the order they appear.
  const delayAt = (i) => Math.min((i + 1) * 60, 360);
  const n = shownSites.length;

  return (
    <>
      {head}
      <div className="sws-page-body">
        <div className="sws-enter">
          <Chips label="Filter curbs" options={options} value={filter} onChange={setFilter} />
        </div>

        {nothing && (
          <ConsoleEmpty icon="check" tone="ok" title={filter === "offline" ? "Every curb is online" : "No batteries are low"}>
            Nothing to show with this filter.
          </ConsoleEmpty>
        )}

        {shownSites.map(([id, s], i) => {
          const st = siteStats[id];
          return (
            <Card
              key={id}
              delay={delayAt(i)}
              title={<Link to={`/customers/${id}`} className="sws-link" style={{ fontSize: "inherit" }}>{s.name}</Link>}
              subtitle={`${st.lots.length} ${st.lots.length === 1 ? "lot" : "lots"} · ${st.curbs ? `${st.online} of ${st.curbs} curbs online` : "no curbs yet"}`}
              actions={<SiteStatusBadge status={s.status} />}
            >
              {lotRows(st.lots)}
            </Card>
          );
        })}

        {shownFree.length > 0 && (
          <Card delay={delayAt(n)} title="Lots without a customer" subtitle="Assign them from a customer's page.">
            {lotRows(unassignedLots)}
          </Card>
        )}

        {shownLoose.length > 0 && (
          <Card delay={delayAt(n + 1)} title="Curbs not in a lot" subtitle="Reporting in, but not placed in a lot yet (the customer's manager does that in Setup).">
            <div className="cn-lot"><CurbRows curbs={shownLoose} now={now} /></div>
          </Card>
        )}

        {filter === "all" && sitesWithout.length > 0 && (
          <div className="sws-note sws-enter" style={{ "--d": `${delayAt(n + 2)}ms` }}>
            No lots yet: {sitesWithout.map(([id, s], i) => (
              <span key={id}>{i > 0 && ", "}<Link to={`/customers/${id}`} className="sws-link">{s.name}</Link></span>
            ))}.
          </div>
        )}
      </div>
    </>
  );
}

export default Deployments;

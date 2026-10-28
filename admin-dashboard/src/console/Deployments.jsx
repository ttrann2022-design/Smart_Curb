import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useNow } from "../units";
import { PageHeader, Card, Chips, EmptyState } from "../components/ui";
import { isOnline, lotName, sortedSites, summarize } from "./data";
import { CurbRows, LoadError, LoadingCard, LotBlock, SiteStatusBadge } from "./parts";

const FILTERS = [
  { id: "all", label: "All curbs" },
  { id: "offline", label: "Offline only" },
];

function Deployments() {
  const { mode, data } = useOutletContext();
  const now = useNow();
  const [filter, setFilter] = useState("all");
  const { loaded, error, sites, lots, units } = data;

  const head = <PageHeader title="Deployments" live={loaded && !error} subtitle={mode === "sim" ? "Simulated customers, their lots and curbs" : "Which customer each lot and curb belongs to, live from the hardware"} />;
  if (error) return <>{head}<div className="sws-page-body sws-narrow"><LoadError error={error} /></div></>;
  if (!loaded) return <>{head}<div className="sws-page-body"><LoadingCard rows={5} /></div></>;

  const { siteStats, lotStats, lotUnits, unassignedLots, looseUnits } = summarize(data);
  const pick = (list) => (filter === "offline" ? list.filter(([, u]) => !isOnline(u)) : list);
  const allUnits = Object.values(units);
  const offline = allUnits.filter((u) => !isOnline(u)).length;
  const options = [{ ...FILTERS[0], count: allUnits.length }, { ...FILTERS[1], count: offline }];
  const sitesWithLots = sortedSites(sites).filter(([id]) => siteStats[id].lots.length > 0);
  const sitesWithout = sortedSites(sites).filter(([id]) => siteStats[id].lots.length === 0);
  // With "Offline only", hide lots with nothing to show.
  const visibleLots = (ids) => (filter === "offline" ? ids.filter((id) => pick(lotUnits[id] || []).length) : ids);

  const lotBlocks = (ids) => visibleLots(ids).map((lotId) => (
    <LotBlock key={lotId} name={lotName(lots, lotId)} stats={lotStats[lotId]} curbs={pick(lotUnits[lotId] || [])} now={now} />
  ));

  if (!Object.keys(lots).length && !allUnits.length) {
    return (
      <>
        {head}
        <div className="sws-page-body sws-narrow">
          <Card>
            <EmptyState icon="units" title="Nothing deployed yet">
              {mode === "sim" ? "Load simulated data on the dashboard's Simulation page, then reload the demo customers from Home." : "Lots and curbs appear here once the hardware reports in."}
            </EmptyState>
          </Card>
        </div>
      </>
    );
  }

  const shownSites = sitesWithLots.filter(([id]) => visibleLots(siteStats[id].lots).length);
  const shownFree = visibleLots(unassignedLots);
  const shownLoose = pick(looseUnits);
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

        {filter === "offline" && offline === 0 && (
          <Card delay={60}><EmptyState icon="check" title="Every curb is online">Nothing to show with this filter.</EmptyState></Card>
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
              {lotBlocks(st.lots)}
            </Card>
          );
        })}

        {shownFree.length > 0 && (
          <Card delay={delayAt(n)} title="Lots without a customer" subtitle="Assign them from a customer's page.">
            {lotBlocks(unassignedLots)}
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

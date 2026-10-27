import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";
import { dataPath } from "../dataMode";
import { c } from "../theme";
import { useFlash } from "../motion";
import { useAlertSettings, useNow, unitIssues, formatAgo } from "../units";
import { PageHeader, Card, StatTile, Notice, EmptyState, Skeleton, LotMeter, Button } from "../components/ui";

// Unassigned curbs have no lot page, so only real lots become links.
function LotRow({ id, lot, stats }) {
  const flash = useFlash(stats.occupied);
  const meter = <LotMeter name={lot.name} {...stats} />;
  if (!id) return <div className={`sws-lot-row${flash ? " sws-flash" : ""}`}>{meter}</div>;
  return (
    <Link to={`/lots?lot=${encodeURIComponent(id)}`} className={`sws-lot-row sws-hover${flash ? " sws-flash" : ""}`}>
      {meter}
    </Link>
  );
}

// If neither data nor an error arrives in this long (e.g. no network), stop waiting.
const LOAD_TIMEOUT_MS = 15000;

const LOAD_ERROR_COPY = {
  denied: "Your account can’t read curb data. Check that you’re signed in with an account that has dashboard access, then try again.",
  timeout: "The database didn’t respond. Check your connection, then try again.",
  failed: "The database couldn’t be reached. Check your connection and sign-in, then try again.",
};

const ISSUE_ORDER = { offline: 0, stale: 1, lowBattery: 2 };
const MAX_ALERTS = 6;

const ALERT_COPY = {
  offline: { title: "Unit offline", tone: "busy" },
  stale: { title: "No recent report", tone: "warn" },
  lowBattery: { title: "Low battery", tone: "warn" },
};

function Overview() {
  const [lots, setLots] = useState({});
  const [units, setUnits] = useState({});
  const [loading, setLoading] = useState(true);
  // null, or a key of LOAD_ERROR_COPY. Bumping attempt re-subscribes.
  const [loadError, setLoadError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const alertSettings = useAlertSettings();
  const now = useNow();
  const { mode } = useOutletContext();

  useEffect(() => {
    const fail = (err) => {
      setLoadError(/permission/i.test(err?.message || "") ? "denied" : "failed");
      setLoading(false);
    };
    const timer = setTimeout(() => {
      setLoadError((e) => e || "timeout");
      setLoading(false);
    }, LOAD_TIMEOUT_MS);
    const stopLots = onValue(ref(database, dataPath("lots")), (snap) => {
      clearTimeout(timer);
      setLots(snap.val() || {});
      setLoadError((e) => (e === "timeout" ? null : e));
      setLoading(false);
    }, fail);
    const stopUnits = onValue(ref(database, dataPath("units")), (snap) => setUnits(snap.val() || {}), fail);
    return () => { clearTimeout(timer); stopLots(); stopUnits(); };
  }, [attempt]);

  const retry = () => {
    setLoadError(null);
    setLoading(true);
    setAttempt((n) => n + 1);
  };

  const unitList = Object.values(units);
  const stats = {};
  Object.keys(lots).forEach((id) => { stats[id] = { total: 0, occupied: 0, offline: 0 }; });
  // Curbs whose lot doesn't match any lot ID still count, under "Unassigned".
  const unassigned = { total: 0, occupied: 0, offline: 0 };
  unitList.forEach((u) => {
    const s = stats[u.lot] || unassigned;
    s.total += 1;
    if (!u.online) s.offline += 1;
    else if (u.occupied) s.occupied += 1;
  });

  const total = unitList.length;
  const reporting = unitList.filter((u) => u.online).length;
  const offline = total - reporting;
  const open = unitList.filter((u) => u.online && !u.occupied).length;
  const occupied = reporting - open;
  // Share of curbs that are actually reporting; offline curbs are neither open nor taken.
  const pct = (n) => (reporting ? Math.round((n / reporting) * 100) : 0);
  const alerts = Object.entries(units)
    .map(([id, u]) => [id, u, unitIssues(u, alertSettings, now)[0]])
    .filter(([, , issue]) => issue)
    .sort(([ida, a, ia], [idb, b, ib]) => (ISSUE_ORDER[ia] - ISSUE_ORDER[ib]) || ((a.battery ?? 0) - (b.battery ?? 0)) || ida.localeCompare(idb));
  const lotName = (u) => lots[u.lot]?.name || "an unassigned lot";

  return (
    <>
      <PageHeader title="Overview" subtitle={mode === "sim" ? "Simulated curbs, updating live" : "Live from the curbs"} live />

      <div className="sws-page-body">
        {loadError ? (
          <div role="alert">
            <Notice tone="busy" title="Couldn’t load curb data">
              {LOAD_ERROR_COPY[loadError]}
              <div style={{ marginTop: 10 }}><Button size="sm" onClick={retry}>Try again</Button></div>
            </Notice>
          </div>
        ) : loading ? (
          <>
            <p className="sws-sr-only" role="status">Loading…</p>
            <div className="sws-tiles" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="sws-tile-stat"><Skeleton width="55%" height={11} /><Skeleton width="40%" height={26} /></div>
              ))}
            </div>
            <div className="sws-stack" aria-busy="true" style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              <Card title="Parking lots" style={{ flex: 2 }}>
                <div className="sws-lot-grid">
                  {[0, 1].map((i) => (
                    <div key={i} className="sws-lot-row"><Skeleton width="45%" height={13} style={{ marginBottom: 10 }} /><Skeleton height={6} /></div>
                  ))}
                </div>
              </Card>
              <Card title="Active alerts" style={{ flex: 1 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {[0, 1].map((i) => <Skeleton key={i} height={58} />)}
                </div>
              </Card>
            </div>
          </>
        ) : (
          <>
            <p className="sws-sr-only" role="status">
              {alerts.length === 1 ? "1 unit needs attention" : `${alerts.length || "No"} units need attention`}
            </p>
            <div className="sws-enter sws-tiles">
              <StatTile label="Spots monitored" value={total} sub={offline ? `${offline} offline` : "all reporting"} subColor={offline ? c.warn : undefined} />
              <StatTile label="Available now" value={open} sub={`${pct(open)}%`} color={c.open} title="Share of curbs that are reporting" />
              <StatTile label="Occupied" value={occupied} sub={`${pct(occupied)}%`} color={c.busy} title="Share of curbs that are reporting" />
              <StatTile label="Needs attention" value={alerts.length} sub={`of ${total} units`} color={alerts.length ? c.warn : c.text} />
            </div>

            <div className="sws-stack" style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              <Card title="Parking lots" delay={80} style={{ flex: 2 }}>
                {Object.keys(lots).length === 0 && unassigned.total === 0 ? (
                  <EmptyState icon="lots" title="No lots yet">Lots appear here once they’re added to the database.</EmptyState>
                ) : (
                  <div className="sws-lot-grid">
                    {Object.entries(lots).map(([id, lot]) => (
                      <LotRow key={id} id={id} lot={lot} stats={stats[id] || { total: 0, occupied: 0, offline: 0 }} />
                    ))}
                    {unassigned.total > 0 && (
                      <LotRow lot={{ name: "Unassigned curbs" }} stats={unassigned} />
                    )}
                  </div>
                )}
              </Card>

              <Card
                title="Active alerts"
                meta={alerts.length > MAX_ALERTS ? `${MAX_ALERTS} of ${alerts.length}` : null}
                delay={160}
                style={{ flex: 1 }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {alerts.length === 0 && <EmptyState icon="check" title="All units healthy">Nothing needs attention right now.</EmptyState>}
                  {alerts.slice(0, MAX_ALERTS).map(([id, u, issue]) => {
                    // translate="no" keeps browser auto-translate away from the curb ID.
                    const curb = <>Curb <span translate="no">{id}</span> in {lotName(u)}</>;
                    const text = {
                      offline: <>{curb} is not reporting.</>,
                      stale: <>{curb} last reported {formatAgo(u.lastUpdated, now)}.</>,
                      lowBattery: <>{curb} is at {u.battery}%.</>,
                    }[issue];
                    return (
                      <div key={id} className="sws-enter">
                        <Notice tone={ALERT_COPY[issue].tone} icon={issue === "offline" ? "offline" : issue === "lowBattery" ? "battery" : "clock"} title={ALERT_COPY[issue].title}>
                          {text}
                        </Notice>
                      </div>
                    );
                  })}
                  {alerts.length > 0 && (
                    <Link to="/units?filter=attention" className="sws-link" style={{ marginTop: 4 }}>
                      {alerts.length > MAX_ALERTS ? `View all ${alerts.length} in Curb units` : "View in Curb units"} <span aria-hidden="true">→</span>
                    </Link>
                  )}
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default Overview;

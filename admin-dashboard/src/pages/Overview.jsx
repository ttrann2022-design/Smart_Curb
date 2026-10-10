import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";
import { dataPath } from "../dataMode";
import { c } from "../theme";
import AnimatedNumber from "../components/AnimatedNumber";
import { useFlash } from "../motion";
import { useAlertSettings, useNow, unitIssues, formatAgo } from "../units";
import { PageHeader, Card, StatTile, Notice, EmptyState, Skeleton } from "../components/ui";

function LotRow({ lot, stats }) {
  const fill = stats.total ? Math.round(((stats.total - stats.open) / stats.total) * 100) : 0;
  const tone = fill >= 90 ? c.busy : fill >= 70 ? c.warn : c.open;
  const flash = useFlash(stats.open);
  return (
    <div className={`sws-hover${flash ? " sws-flash" : ""}`} style={{ border: `1px solid ${c.line}`, borderRadius: 5, padding: "11px 13px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{lot.name}</span>
        <span style={{ fontSize: 12, color: c.dim, whiteSpace: "nowrap" }}>
          <span className="sws-mono" style={{ color: c.text }}><AnimatedNumber value={stats.open} /></span> of {stats.total} open
        </span>
      </div>
      <div
        role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={fill} aria-label={`${lot.name} ${fill}% full`}
        style={{ height: 6, borderRadius: 3, background: c.line, overflow: "hidden" }}
      >
        <div style={{ width: `${fill}%`, height: 6, background: tone, transition: "width 0.6s ease, background-color 0.6s ease" }} />
      </div>
    </div>
  );
}

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
  const alertSettings = useAlertSettings();
  const now = useNow();
  const { mode } = useOutletContext();

  useEffect(() => {
    const stopLots = onValue(ref(database, dataPath("lots")), (snap) => {
      setLots(snap.val() || {});
      setLoading(false);
    });
    const stopUnits = onValue(ref(database, dataPath("units")), (snap) => setUnits(snap.val() || {}));
    return () => { stopLots(); stopUnits(); };
  }, []);

  const unitList = Object.values(units);
  const stats = {};
  Object.keys(lots).forEach((id) => { stats[id] = { total: 0, open: 0 }; });
  // Curbs whose lot doesn't match any lot ID still count, under "Unassigned".
  const unassigned = { total: 0, open: 0 };
  unitList.forEach((u) => {
    const s = stats[u.lot] || unassigned;
    s.total += 1;
    if (u.online && !u.occupied) s.open += 1;
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
        {loading ? (
          <div className="sws-tiles" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="sws-tile-stat"><Skeleton width="55%" height={11} /><Skeleton width="40%" height={26} /></div>
            ))}
          </div>
        ) : (
          <>
            <div className="sws-enter sws-tiles">
              <StatTile label="Spots monitored" value={total} sub={offline ? `${offline} offline` : "all reporting"} />
              <StatTile label="Available now" value={open} sub={`${pct(open)}%`} color={c.open} title="Share of curbs that are reporting" />
              <StatTile label="Occupied" value={occupied} sub={`${pct(occupied)}%`} color={c.busy} title="Share of curbs that are reporting" />
              <StatTile label="Needs attention" value={alerts.length} sub={`of ${total} units`} color={alerts.length ? c.warn : c.text} />
            </div>

            <div className="sws-stack" style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              <Card title="Parking lots" delay={80} style={{ flex: 2 }}>
                {Object.keys(lots).length === 0 && unassigned.total === 0 ? (
                  <EmptyState icon="lots" title="No lots yet">Lots appear here once they're added to the database.</EmptyState>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {Object.entries(lots).map(([id, lot]) => (
                      <LotRow key={id} lot={lot} stats={stats[id] || { total: 0, open: 0 }} />
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
                    const text = {
                      offline: `Curb ${id} in ${lotName(u)} is not reporting.`,
                      stale: `Curb ${id} in ${lotName(u)} last reported ${formatAgo(u.lastUpdated, now)}.`,
                      lowBattery: `Curb ${id} in ${lotName(u)} is at ${u.battery}%.`,
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
                    <Link to="/units?filter=attention" style={{ fontSize: 12.5, fontWeight: 600, color: c.accent, textDecoration: "none", marginTop: 4 }}>
                      {alerts.length > MAX_ALERTS ? `View all ${alerts.length} in Curb units →` : "View in Curb units →"}
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

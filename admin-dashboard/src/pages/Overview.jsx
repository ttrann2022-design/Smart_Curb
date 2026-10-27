import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";
import { dataPath } from "../dataMode";
import { useAlertSettings, useNow, unitIssues, formatAgo, formatExact, statusKey, hasBattery, isLowBattery, STALL_WORD, ROOMY_MAX, planLayout } from "../units";
import AnimatedNumber from "../components/AnimatedNumber";
import LotPlan, { StallMark } from "../components/LotPlan";
import { PageHeader, Notice, Skeleton, Button } from "../components/ui";

// The curb wired to the real hardware Receiver. Live mode gives it its own card.
const HARDWARE_ID = "C-095";

// If neither data nor an error arrives in this long (e.g. no network), stop waiting.
const LOAD_TIMEOUT_MS = 15000;

const LOAD_ERROR_COPY = {
  denied: "Your account can’t read curb data. Check that you’re signed in with an account that has dashboard access, then try again.",
  timeout: "The database didn’t respond. Check your connection, then try again.",
  failed: "The database couldn’t be reached. Check your connection and sign-in, then try again.",
};

const ISSUE_ORDER = { offline: 0, stale: 1, lowBattery: 2 };
const MAX_ALERTS = 6;

const ALERT_TITLE = { offline: "Offline", stale: "No recent report", lowBattery: "Low battery" };

const byId = ([a], [b]) => a.localeCompare(b, undefined, { numeric: true });

function HardwareCard({ unit, lots, alerts, now }) {
  if (!unit) {
    return (
      <section className="ov-hw" aria-label={`Live hardware, curb ${HARDWARE_ID}`}>
        <div className="ov-hw-k"><span className="sws-live-dot" aria-hidden="true" />Live hardware</div>
        <div className="ov-hw-id" translate="no">{HARDWARE_ID}</div>
        <p className="ov-hw-meta">Hasn’t reported yet. It appears here as soon as the Receiver sends its first reading.</p>
      </section>
    );
  }
  const status = statusKey(unit);
  const ago = formatAgo(unit.lastUpdated, now);
  const lot = lots[unit.lot];
  return (
    <section className="ov-hw" aria-label={`Live hardware, curb ${HARDWARE_ID}`}>
      <div className="ov-hw-k"><span className="sws-live-dot" aria-hidden="true" />Live hardware</div>
      <div className="ov-hw-main">
        <StallMark status={status} low={isLowBattery(unit, alerts)} className="ov-hw-block" />
        <div style={{ minWidth: 0 }}>
          <div className="ov-hw-id" translate="no">{HARDWARE_ID}</div>
          <div className={`ov-hw-status ov-t-${status}`}>{STALL_WORD[status]}</div>
        </div>
      </div>
      <dl className="ov-hw-facts">
        {ago && <div><dt>Changed</dt><dd title={formatExact(unit.lastUpdated)}>{ago}</dd></div>}
        {hasBattery(unit) && <div><dt>Battery</dt><dd className={isLowBattery(unit, alerts) ? "ov-t-warn" : undefined}>{unit.battery}%</dd></div>}
        {lot && <div><dt>Lot</dt><dd><Link to={`/lots?lot=${encodeURIComponent(unit.lot)}`} className="sws-link">{lot.name} <span aria-hidden="true">→</span></Link></dd></div>}
      </dl>
    </section>
  );
}

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

  const entries = Object.entries(units).sort(byId);
  const unitsByLot = {};
  Object.keys(lots).forEach((id) => { unitsByLot[id] = []; });
  // Curbs whose lot doesn't match any lot ID still show, under "Unassigned".
  const unassigned = [];
  entries.forEach((e) => (unitsByLot[e[1].lot] || unassigned).push(e));
  const plannedLots = Object.entries(lots).filter(([id]) => unitsByLot[id].length > 0);
  const emptyLots = Object.entries(lots).filter(([id]) => unitsByLot[id].length === 0);
  // Few curbs (Live today): smaller lot columns so a short plan doesn't sit in a wide empty box.
  const compact = plannedLots.every(([id]) => unitsByLot[id].length <= ROOMY_MAX) && unassigned.length <= ROOMY_MAX;
  // Widest row on the page; every lot sizes its stalls from it so they all match.
  const maxCols = Math.max(1, planLayout(unassigned.length).perRow, ...plannedLots.map(([id]) => planLayout(unitsByLot[id].length).perRow));

  const total = entries.length;
  const reporting = entries.filter(([, u]) => u.online).length;
  const offline = total - reporting;
  const free = entries.filter(([, u]) => u.online && !u.occupied).length;
  const occupiedPct = reporting ? Math.round(((reporting - free) / reporting) * 100) : 0;
  const alerts = entries
    .map(([id, u]) => [id, u, unitIssues(u, alertSettings, now)[0]])
    .filter(([, , issue]) => issue)
    .sort(([ida, a, ia], [idb, b, ib]) => (ISSUE_ORDER[ia] - ISSUE_ORDER[ib]) || ((a.battery ?? 0) - (b.battery ?? 0)) || ida.localeCompare(idb));
  const lotName = (u) => lots[u.lot]?.name || "Unassigned";
  const lotCount = plannedLots.length + (unassigned.length ? 1 : 0);
  const live = mode !== "sim";

  return (
    <>
      <PageHeader title="Overview" subtitle={live ? "Live from the curbs" : "Simulated curbs, updating live"} live />

      <div className="sws-page-body ov-body">
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
            <div className="ov-hero" aria-busy="true">
              <div className="ov-summary">
                <Skeleton width={220} height={110} />
                <Skeleton width={260} height={14} style={{ marginTop: 14 }} />
              </div>
            </div>
            <div className="ov-lots" aria-busy="true">
              {[0, 1].map((i) => (
                <div key={i} className="ov-lot">
                  <Skeleton width={90} height={14} style={{ marginBottom: 12 }} />
                  <Skeleton height={150} />
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="sws-sr-only" role="status">
              {alerts.length === 1 ? "1 unit needs attention" : `${alerts.length || "No"} units need attention`}
            </p>

            <div className={`ov-hero sws-enter${live ? " has-hw" : ""}`}>
              <div className="ov-summary">
                <div className="ov-free">
                  <span className="ov-free-big"><AnimatedNumber value={free} /></span>
                  <span className="ov-free-word">free</span>
                </div>
                <p className="ov-free-label">
                  {total === 0
                    ? "No curbs are reporting yet"
                    : `${free === 1 ? "Spot" : "Spots"} open right now, across ${lotCount} ${lotCount === 1 ? "lot" : "lots"}`}
                </p>
                <ul className="ov-strip">
                  <li>
                    <StallMark status="occupied" />
                    <span className="ov-strip-n">{occupiedPct}%</span> <span className="ov-strip-l">occupied</span>
                  </li>
                  <li>
                    <StallMark status="occupied" low className="ov-mark-ring" />
                    <span className={`ov-strip-n${alerts.length ? " ov-t-warn" : ""}`}>{alerts.length}</span> <span className="ov-strip-l">need attention</span>
                  </li>
                  <li>
                    <StallMark status="offline" />
                    <span className="ov-strip-n">{offline}</span> <span className="ov-strip-l">offline</span>
                  </li>
                </ul>
              </div>
              {live && <HardwareCard unit={units[HARDWARE_ID]} lots={lots} alerts={alertSettings} now={now} />}
            </div>

            {total === 0 && Object.keys(lots).length === 0 ? (
              <p className="sws-note">No lots or curbs yet. They appear here once they’re added to the database.</p>
            ) : (
              <div className={`ov-lots sws-enter${compact ? " is-compact" : ""}`} style={{ "--d": "80ms", "--max-cols": maxCols }}>
                {plannedLots.map(([id, lot]) => (
                  <LotPlan key={id} lotId={id} name={lot.name} units={unitsByLot[id]} alerts={alertSettings} now={now} />
                ))}
                {unassigned.length > 0 && (
                  <LotPlan name="Unassigned curbs" units={unassigned} alerts={alertSettings} now={now} />
                )}
                {emptyLots.length > 0 && (
                  <div className="ov-empty-lots">
                    <span className="ov-empty-k">No curbs yet</span>
                    <ul>
                      {emptyLots.map(([id, lot]) => (
                        <li key={id}><Link to={`/lots?lot=${encodeURIComponent(id)}`} className="sws-link">{lot.name}</Link></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <section className="ov-attn sws-enter" style={{ "--d": "160ms" }} aria-labelledby="ov-attn-h">
              <div className="ov-attn-head">
                <h2 id="ov-attn-h" className="ov-h2">Needs attention</h2>
                {alerts.length > MAX_ALERTS && <span className="sws-card-meta">{MAX_ALERTS} of {alerts.length}</span>}
                {alerts.length > 0 && (
                  <Link to="/units?filter=attention" className="sws-link ov-attn-all">
                    {alerts.length > MAX_ALERTS ? `View all ${alerts.length}` : "View in Curb units"} <span aria-hidden="true">→</span>
                  </Link>
                )}
              </div>
              {alerts.length === 0 ? (
                <p className="sws-note">Every curb is reporting and charged.</p>
              ) : (
                <ul className="ov-attn-list">
                  {alerts.slice(0, MAX_ALERTS).map(([id, u, issue]) => (
                    <li key={id} className="sws-enter">
                      <StallMark status={statusKey(u)} low={isLowBattery(u, alertSettings)} />
                      {/* translate="no" keeps browser auto-translate away from the curb ID. */}
                      <span className="sws-mono ov-attn-id" translate="no">{id}</span>
                      <span className={issue === "offline" ? "ov-attn-what" : "ov-attn-what ov-t-warn"}>
                        {ALERT_TITLE[issue]}{issue === "lowBattery" ? `, ${u.battery}%` : issue === "stale" ? `, last report ${formatAgo(u.lastUpdated, now)}` : ", not reporting"}
                      </span>
                      <span className="ov-attn-lot">{lotName(u)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}

export default Overview;

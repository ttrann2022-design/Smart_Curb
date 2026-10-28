import { useEffect, useState } from "react";
import { Link, useLocation, useOutletContext } from "react-router-dom";
import { LEAD_STATUSES, setLeadStatus } from "../leads";
import { facilityById } from "../site";
import { useNow, formatAgo, formatExact } from "../units";
import Icon from "../components/Icon";
import { PageHeader, Card, Chips, EmptyState, Button, StatusText } from "../components/ui";
import { convertLead } from "./data";
import { LoadError, LoadingCard } from "./parts";

const STATUS_LABEL = Object.fromEntries(LEAD_STATUSES.map((s) => [s.id, s.label]));
// "won" is set by converting, never picked by hand.
const PICKABLE = LEAD_STATUSES.filter((s) => s.id !== "won");

const refusal = (err) => (err.code === "PERMISSION_DENIED" || /permission/i.test(err.message || ""));

// New, contacted, closed as native radios styled as a segmented control,
// so arrow keys and screen readers work as they do for any radio group.
// Not disabled while saving: that would drop keyboard focus mid-change.
function StatusControl({ lead, onChange, busy }) {
  return (
    <fieldset className="rq-seg" aria-busy={busy || undefined}>
      <legend className="sws-sr-only">Status for {lead.name}</legend>
      {PICKABLE.map((s) => (
        <label key={s.id} className={`rq-seg-opt is-${s.id}`}>
          <input type="radio" name={`status-${lead.id}`} value={s.id} checked={lead.status === s.id} onChange={() => onChange(s.id)} className="sws-sr-only" />
          {s.label}
        </label>
      ))}
    </fieldset>
  );
}

function LeadItem({ lead, site, now, index }) {
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [msg, setMsg] = useState(null);
  const facility = facilityById(lead.facilityType);
  const ago = formatAgo(lead.createdAt, now);
  const won = lead.status === "won" || !!lead.siteId;

  const change = async (status) => {
    setSaving(true);
    setMsg(null);
    try {
      await setLeadStatus(lead.id, status);
    } catch (err) {
      setMsg({ ok: false, text: refusal(err) ? "The database refused the change." : "Couldn't save: " + err.message });
    }
    setSaving(false);
  };

  const convert = async () => {
    setConverting(true);
    setMsg(null);
    try {
      await convertLead(lead);
      setMsg({ ok: true, text: "Customer created as a prospect." });
    } catch (err) {
      setMsg({ ok: false, text: refusal(err) ? "The database refused it. The request may already have been converted." : "Couldn't convert: " + err.message });
    }
    setConverting(false);
  };

  return (
    <li id={lead.id} className="rq-item sws-enter" style={{ "--d": `${Math.min(index, 8) * 40}ms`, scrollMarginTop: 72 }}>
      <div className="rq-main">
        <div className="rq-head">
          <h2 className="rq-name">{lead.name}</h2>
          <span className={`sws-badge rq-badge is-${lead.status}`}>{(STATUS_LABEL[lead.status] || lead.status || "").toUpperCase()}</span>
        </div>
        <div className="rq-meta">
          {lead.organization && <span>{lead.organization}</span>}
          {facility && <span>{facility.label}</span>}
          <span title={formatExact(lead.createdAt)}>{ago || "Date unknown"}</span>
        </div>
        <a className="sws-link rq-email" href={`mailto:${lead.email}`}>
          <Icon name="mail" size={14} />{lead.email}
        </a>
        {lead.message ? <p className="rq-msg">{lead.message}</p> : <p className="rq-msg is-empty">No message.</p>}
        <div className="rq-actions">
          {won ? (
            site
              ? <Link className="sws-link" to={`/customers/${lead.siteId}`}>Customer: {site.name}</Link>
              : <span className="sws-note">Converted. That customer has since been deleted.</span>
          ) : (
            <Button size="sm" icon="users" onClick={convert} busy={converting} disabled={converting}>Convert to customer</Button>
          )}
          <StatusText msg={msg} />
        </div>
      </div>
      {!won && <StatusControl lead={lead} onChange={change} busy={saving} />}
    </li>
  );
}

function Requests() {
  const { mode, data } = useOutletContext();
  const [filter, setFilter] = useState("all");
  const now = useNow();
  const { hash } = useLocation();
  const { loaded, error, leads: byId, sites } = data;

  // Home links to a request as /requests#<id>: scroll to it once the list renders.
  useEffect(() => {
    if (loaded && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [loaded, hash]);

  const head = <PageHeader title="Requests" live={loaded && !error} subtitle={mode === "sim" ? "Fake quote requests for Simulation, newest first" : "Quote requests from the website, newest first"} />;
  if (error) return <>{head}<div className="sws-page-body sws-narrow"><LoadError error={error} /></div></>;
  if (!loaded) return <>{head}<div className="sws-page-body sws-narrow"><LoadingCard rows={3} /></div></>;

  const leads = Object.entries(byId).map(([id, l]) => ({ id, ...l })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const counts = Object.fromEntries(LEAD_STATUSES.map((s) => [s.id, leads.filter((l) => l.status === s.id).length]));
  const shown = filter === "all" ? leads : leads.filter((l) => l.status === filter);
  const options = [{ id: "all", label: "All", count: leads.length }, ...LEAD_STATUSES.map((s) => ({ ...s, count: counts[s.id] }))];

  return (
    <>
      {head}
      <div className="sws-page-body sws-narrow">
        <div className="sws-enter">
          <Chips label="Filter by status" options={options} value={filter} onChange={setFilter} />
        </div>
        <p className="sws-sr-only" role="status">{shown.length} {shown.length === 1 ? "request" : "requests"} shown</p>
        {shown.length === 0 ? (
          <Card delay={60}>
            <EmptyState icon="inbox" title={leads.length ? `No ${STATUS_LABEL[filter]?.toLowerCase()} requests` : "No requests yet"}>
              {leads.length
                ? "Try another filter."
                : mode === "sim"
                  ? "Send a fake quote request, or reload the demo customers, from Home."
                  : "Quote requests from the website appear here as they arrive."}
            </EmptyState>
          </Card>
        ) : (
          <ul className="rq-list" aria-label="Quote requests">
            {shown.map((lead, i) => <LeadItem key={lead.id} lead={lead} site={lead.siteId ? sites[lead.siteId] : null} now={now} index={i} />)}
          </ul>
        )}
      </div>
    </>
  );
}

export default Requests;

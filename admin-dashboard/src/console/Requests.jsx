import { useState } from "react";
import { Navigate, useOutletContext } from "react-router-dom";
import { LEAD_STATUSES, setLeadStatus } from "../leads";
import { facilityById } from "../site";
import { useNow, formatAgo, formatExact } from "../units";
import Icon from "../components/Icon";
import { PageHeader, Card, Chips, EmptyState, Notice, Skeleton, StatusText } from "../components/ui";

const STATUS_LABEL = Object.fromEntries(LEAD_STATUSES.map((s) => [s.id, s.label]));

// New, contacted, closed as native radios styled as a segmented control,
// so arrow keys and screen readers work as they do for any radio group.
// Not disabled while saving: that would drop keyboard focus mid-change.
function StatusControl({ lead, onChange, busy }) {
  return (
    <fieldset className="rq-seg" aria-busy={busy || undefined}>
      <legend className="sws-sr-only">Status for {lead.name}</legend>
      {LEAD_STATUSES.map((s) => (
        <label key={s.id} className={`rq-seg-opt is-${s.id}`}>
          <input type="radio" name={`status-${lead.id}`} value={s.id} checked={lead.status === s.id} onChange={() => onChange(s.id)} className="sws-sr-only" />
          {s.label}
        </label>
      ))}
    </fieldset>
  );
}

function LeadItem({ lead, now, index }) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const facility = facilityById(lead.facilityType);
  const ago = formatAgo(lead.createdAt, now);

  const change = async (status) => {
    setSaving(true);
    setMsg(null);
    try {
      await setLeadStatus(lead.id, status);
    } catch (err) {
      setMsg({ ok: false, text: err.code === "PERMISSION_DENIED" ? "Only managers can change a request's status." : "Couldn't save: " + err.message });
    }
    setSaving(false);
  };

  return (
    <li className="rq-item sws-enter" style={{ "--d": `${Math.min(index, 8) * 40}ms` }}>
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
        <StatusText msg={msg} />
      </div>
      <StatusControl lead={lead} onChange={change} busy={saving} />
    </li>
  );
}

function Requests() {
  const { role, mode, leadsState } = useOutletContext();
  const [filter, setFilter] = useState("all");
  const now = useNow();
  if (role !== "manager") return <Navigate to="/overview" replace />;

  const { loaded, leads, error } = leadsState;
  const counts = Object.fromEntries(LEAD_STATUSES.map((s) => [s.id, leads.filter((l) => l.status === s.id).length]));
  const shown = filter === "all" ? leads : leads.filter((l) => l.status === filter);
  const options = [{ id: "all", label: "All", count: leads.length }, ...LEAD_STATUSES.map((s) => ({ ...s, count: counts[s.id] }))];

  return (
    <>
      <PageHeader
        title="Requests"
        live={loaded && !error}
        subtitle={mode === "sim" ? "Fake quote requests for Simulation, newest first" : "Quote requests from the website, newest first"}
      />
      <div className="sws-page-body sws-narrow">
        {error ? (
          <Notice tone="warn" title="Couldn't load requests">The database refused the read. Only managers can see requests, and the rules may not allow it yet.</Notice>
        ) : !loaded ? (
          <Card><div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={72} />)}</div></Card>
        ) : (
          <>
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
                      ? "Load fresh simulated data, or send a fake quote request, from the Simulation page."
                      : "Quote requests from the website appear here as they arrive."}
                </EmptyState>
              </Card>
            ) : (
              <ul className="rq-list" aria-label="Quote requests">
                {shown.map((lead, i) => <LeadItem key={lead.id} lead={lead} now={now} index={i} />)}
              </ul>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default Requests;

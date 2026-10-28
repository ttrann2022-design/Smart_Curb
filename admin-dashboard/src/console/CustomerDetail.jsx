import { useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useNow, formatExact } from "../units";
import Icon from "../components/Icon";
import { PageHeader, Card, EmptyState, Button, Field, Select, Notice, StatusText } from "../components/ui";
import {
  SITE_STATUSES, assignLot, deleteSite, lotName, setSiteStatus, siteToForm, summarize, typeLabel, unassignLot, updateSite,
} from "./data";
import { LoadError, LoadingCard, LotBlock, SiteForm, SiteStatusBadge } from "./parts";

const permissionText = (err) => (err.code === "PERMISSION_DENIED" || /permission/i.test(err.message) ? "The database refused the change." : err.message);

// Status as a segmented radio group, the same control Requests uses.
function StatusControl({ siteId, status }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const change = async (next) => {
    setBusy(true);
    setMsg(null);
    try { await setSiteStatus(siteId, next); } catch (err) { setMsg({ ok: false, text: "Couldn't change the status. " + permissionText(err) }); }
    setBusy(false);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
      <fieldset className="rq-seg" aria-busy={busy || undefined}>
        <legend className="sws-sr-only">Customer status</legend>
        {SITE_STATUSES.map((s) => (
          <label key={s.id} className="rq-seg-opt">
            <input type="radio" name="site-status" value={s.id} checked={status === s.id} onChange={() => change(s.id)} className="sws-sr-only" />
            {s.label}
          </label>
        ))}
      </fieldset>
      <StatusText msg={msg} />
    </div>
  );
}

function AssignLot({ siteId, freeLots, lots }) {
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const chosen = freeLots.includes(pick) ? pick : "";
  const assign = async () => {
    if (!chosen) return;
    setBusy(true);
    setMsg(null);
    try {
      await assignLot(chosen, siteId);
      setMsg({ ok: true, text: `${lotName(lots, chosen)} now belongs to this customer.` });
      setPick("");
    } catch (err) {
      setMsg({ ok: false, text: "Couldn't assign the lot. " + permissionText(err) });
    }
    setBusy(false);
  };
  // The message stays when the last free lot is taken and the picker goes away.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {freeLots.length ? (
        <div className="cn-inline">
          <Field label="Assign a lot">
            <Select value={chosen} onChange={(e) => { setPick(e.target.value); setMsg(null); }}>
              <option value="">Choose a lot…</option>
              {freeLots.map((id) => <option key={id} value={id}>{lotName(lots, id)}</option>)}
            </Select>
          </Field>
          <Button variant="primary" onClick={assign} busy={busy} disabled={busy || !chosen}>Assign lot</Button>
        </div>
      ) : null}
      {freeLots.length ? (
        <span className="sws-field-hint">Only lots without a customer are listed.</span>
      ) : (
        <div className="sws-note">Every lot already belongs to a customer. Unassign one from another customer first, or wait for new lots to report in.</div>
      )}
      <StatusText msg={msg} />
    </div>
  );
}

function UnassignButton({ lotId, name }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const run = async () => {
    setBusy(true);
    setErr(null);
    try { await unassignLot(lotId); } catch (e) { setErr(permissionText(e)); setBusy(false); }
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {err && <span className="cn-err" role="status"><Icon name="alert" size={13} />{err}</span>}
      <Button size="sm" onClick={run} busy={busy} disabled={busy} aria-label={`Unassign ${name}`}>Unassign</Button>
    </span>
  );
}

function DeleteCustomer({ siteId, name, lotCount }) {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const blocked = lotCount > 0;
  const run = async () => {
    setBusy(true);
    try {
      await deleteSite(siteId);
      navigate("/customers", { replace: true });
    } catch (err) {
      setMsg({ ok: false, text: "Couldn't delete. " + permissionText(err) });
      setBusy(false);
    }
  };
  return (
    <Card title="Delete customer" delay={180}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
        {blocked ? (
          <div className="sws-note" id="delete-why">
            {lotCount === 1 ? "1 lot still points" : `${lotCount} lots still point`} to this customer. Unassign {lotCount === 1 ? "it" : "them"} above first, so no lot is left pointing at a customer that no longer exists.
          </div>
        ) : (
          <div className="sws-note">Removes {name} and its details. Its lots and curbs aren't touched. This can't be undone.</div>
        )}
        {confirm && !blocked ? (
          <div role="alertdialog" aria-label="Confirm delete" className="sws-notice sws-notice-busy" style={{ alignItems: "center", flexWrap: "wrap", alignSelf: "stretch" }}>
            <span style={{ flex: "1 1 220px" }}>Delete {name}?</span>
            <Button variant="danger" onClick={run} busy={busy} disabled={busy} autoFocus>Yes, delete</Button>
            <Button onClick={() => setConfirm(false)} disabled={busy}>Cancel</Button>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirm(true)} disabled={blocked} aria-describedby={blocked ? "delete-why" : undefined}>Delete customer</Button>
        )}
        <StatusText msg={msg} />
      </div>
    </Card>
  );
}

function CustomerDetail() {
  const { id } = useParams();
  const { mode, data } = useOutletContext();
  const now = useNow();
  const [editing, setEditing] = useState(false);
  const { loaded, error, sites, leads, lots } = data;
  const site = sites[id];

  const back = <Link to="/customers" className="sws-link cn-back"><Icon name="arrowRight" size={13} style={{ transform: "rotate(180deg)" }} />All customers</Link>;
  if (error) return <><PageHeader title="Customer" /><div className="sws-page-body sws-narrow">{back}<LoadError error={error} /></div></>;
  if (!loaded) return <><PageHeader title="Customer" /><div className="sws-page-body sws-narrow">{back}<LoadingCard /></div></>;
  if (!site) {
    return (
      <>
        <PageHeader title="Customer not found" />
        <div className="sws-page-body sws-narrow">
          {back}
          <Card><EmptyState icon="users" title="No customer here">{mode === "sim" ? "It may have been replaced when the demo customers were reloaded." : "It may have been deleted."}</EmptyState></Card>
        </div>
      </>
    );
  }

  const { siteStats, lotStats, lotUnits, unassignedLots } = summarize(data);
  const st = siteStats[id];
  const lead = site.fromLeadId ? leads[site.fromLeadId] : null;

  return (
    <>
      <PageHeader title={site.name} subtitle={`${typeLabel(site.type)} · ${st.lots.length} ${st.lots.length === 1 ? "lot" : "lots"} · ${st.curbs ? `${st.online} of ${st.curbs} curbs online` : "no curbs yet"}`} />
      <div className="sws-page-body sws-narrow">
        <div className="cn-badges">{back}</div>

        <Card title="Status" delay={0} actions={<SiteStatusBadge status={site.status} />}>
          <StatusControl key={site.status} siteId={id} status={site.status} />
        </Card>

        <Card
          title="Details"
          delay={60}
          subtitle={site.createdAt ? `Added ${formatExact(site.createdAt)}` : undefined}
          actions={!editing && <Button size="sm" onClick={() => setEditing(true)}>Edit</Button>}
        >
          {editing ? (
            <SiteForm
              idPrefix="edit-site"
              initial={siteToForm(site)}
              submitLabel="Save changes"
              busyLabel="Saving…"
              onSubmit={async (form) => { await updateSite(id, form); setEditing(false); }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <dl className="cn-form" style={{ margin: 0 }}>
              {[
                ["Contact", site.contactName],
                ["Email", site.contactEmail && <a className="sws-link" href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>],
                ["From request", site.fromLeadId && (lead ? <Link className="sws-link" to={`/requests#${site.fromLeadId}`}>{lead.name}{lead.organization ? `, ${lead.organization}` : ""}</Link> : "A request that has since been deleted")],
                ["Notes", site.notes],
              ].map(([label, value]) => (
                <div key={label} className={label === "Notes" ? "is-wide" : undefined} style={{ minWidth: 0 }}>
                  <dt className="sws-field-label">{label}</dt>
                  <dd style={{ margin: "4px 0 0", fontSize: 13, overflowWrap: "anywhere", whiteSpace: "pre-wrap", color: value ? undefined : "var(--dim)" }}>{value || "Not set"}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>

        <Card title="Lots and curbs" subtitle="Only the lot's customer is changed here; the lot and its curbs stay as the hardware reports them." delay={120}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {st.lots.length === 0 ? (
              <Notice tone="info">No lots yet. Assign one below.</Notice>
            ) : (
              <div>
                {st.lots.map((lotId) => (
                  <LotBlock
                    key={lotId}
                    name={lotName(lots, lotId)}
                    stats={lotStats[lotId]}
                    curbs={lotUnits[lotId] || []}
                    now={now}
                    action={<UnassignButton lotId={lotId} name={lotName(lots, lotId)} />}
                  />
                ))}
              </div>
            )}
            <AssignLot siteId={id} freeLots={unassignedLots} lots={lots} />
          </div>
        </Card>

        <DeleteCustomer siteId={id} name={site.name} lotCount={st.lots.length} />
      </div>
    </>
  );
}

export default CustomerDetail;

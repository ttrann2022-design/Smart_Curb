import { useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useNow, formatAgo, formatExact } from "../units";
import Icon from "../components/Icon";
import { PageHeader, Card, Button, Field, Select, Notice, StatusText } from "../components/ui";
import {
  EMPTY_LOT_FORM, SITE_STATUSES, assignLot, createLot, deleteSite, lotName, lotToForm, setSiteStatus, siteToForm, summarize, typeLabel,
  unassignLot, updateLot, updateSite,
} from "./data";
import { ConsoleEmpty, HealthBar, LoadError, LoadingCard, LotBlock, LotForm, SiteForm, SiteStatusBadge } from "./parts";

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
            <Select id="assign-lot" value={chosen} onChange={(e) => { setPick(e.target.value); setMsg(null); }}>
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
        <div className="sws-note">Every lot already belongs to a customer. Add a new lot above, or unassign one from another customer first.</div>
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

// A short line for the lot head: its size and, if set, where it is.
function lotDetail(lot) {
  const parts = [];
  if (typeof lot?.totalSpots === "number") parts.push(`${lot.totalSpots.toLocaleString()} ${lot.totalSpots === 1 ? "spot" : "spots"}`);
  if (typeof lot?.latitude === "number" && typeof lot?.longitude === "number") parts.push(`${lot.latitude}, ${lot.longitude}`);
  return parts.join(" · ");
}

// One of the customer's lots, with Edit (name, size, location) and Unassign.
function LotItem({ lotId, lot, stats, curbs, now }) {
  const [editing, setEditing] = useState(false);
  const name = lot?.name || lotId;
  return (
    <LotBlock
      name={name}
      detail={lotDetail(lot)}
      stats={stats}
      curbs={curbs}
      now={now}
      plan
      action={
        <span className="cn-lot-actions">
          {!editing && <Button size="sm" onClick={() => setEditing(true)} aria-label={`Edit ${name}`}>Edit</Button>}
          <UnassignButton lotId={lotId} name={name} />
        </span>
      }
    >
      {editing && (
        <div className="cn-lot-edit">
          <LotForm
            idPrefix={`edit-lot-${lotId}`}
            initial={lotToForm(lot || {})}
            submitLabel="Save lot"
            busyLabel="Saving…"
            onSubmit={async (form) => { await updateLot(lotId, form); setEditing(false); }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
    </LotBlock>
  );
}

// A new lot for this customer, shown on demand under the lot list.
// Opened from the action bar or the button under the lots; the parent holds open/closed.
function AddLot({ siteId, lots, open, setOpen }) {
  const [msg, setMsg] = useState(null);
  if (!open) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
        <Button icon="lots" onClick={() => { setOpen(true); setMsg(null); }}>Add lot</Button>
        <StatusText msg={msg} />
      </div>
    );
  }
  return (
    <div className="cn-lot">
      <div className="cn-lot-head"><h3 className="cn-lot-name">New lot</h3></div>
      <div className="cn-lot-edit" style={{ borderBottom: 0 }}>
        <LotForm
          idPrefix="new-lot"
          initial={EMPTY_LOT_FORM}
          lots={lots}
          submitLabel="Add lot"
          busyLabel="Adding…"
          onSubmit={async (form) => {
            const id = await createLot(siteId, form);
            setMsg({ ok: true, text: `Added ${form.name.trim()} (ID ${id}).` });
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      </div>
    </div>
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

// Scrolls a section into view (instantly with reduced motion) and focuses a field in it.
function reveal(sectionId, focusId) {
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  requestAnimationFrame(() => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    document.getElementById(focusId)?.focus({ preventScroll: true });
  });
}

function CustomerDetail() {
  const { id } = useParams();
  const { mode, data } = useOutletContext();
  const now = useNow();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
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
          <ConsoleEmpty icon="users" title="No customer here" action={<Link to="/customers" className="sws-btn sws-btn-secondary sws-btn-sm">All customers</Link>}>
            {mode === "sim" ? "It may have been replaced when the demo customers were reloaded." : "It may have been deleted."}
          </ConsoleEmpty>
        </div>
      </>
    );
  }

  const { siteStats, lotStats, lotUnits, unassignedLots } = summarize(data);
  const st = siteStats[id];
  const lead = site.fromLeadId ? leads[site.fromLeadId] : null;
  const ago = formatAgo(st.lastSeen, now);
  const stats = [
    ["Lots", st.lots.length],
    ["Curbs", st.curbs],
    ["Online", st.curbs ? `${st.online} of ${st.curbs}` : "–", st.curbs && st.online < st.curbs],
    ["Free now", st.health.free],
  ];

  return (
    <>
      <PageHeader title={site.name} subtitle={`${typeLabel(site.type)}${site.createdAt ? ` · added ${formatExact(site.createdAt)}` : ""}`} actions={<SiteStatusBadge status={site.status} />} />
      <div className="sws-page-body">
        <div className="cn-badges">{back}</div>

        <section className="cn-sum sws-enter" aria-label="Summary">
          <dl className="cn-sum-stats">
            {stats.map(([label, value, warn]) => (
              <div key={label}><dt className="cn-k">{label}</dt><dd className={`cn-num${warn ? " cn-warn" : ""}`}>{value}</dd></div>
            ))}
            <div><dt className="cn-k">Last report</dt><dd className="cn-sum-ago" title={formatExact(st.lastSeen)}>{ago || "None yet"}</dd></div>
          </dl>
          <HealthBar health={st.health} label={`${site.name} curbs`} />
          <div className="cn-sum-actions" role="group" aria-label="Customer actions">
            <Button variant="primary" icon="lots" onClick={() => { setAdding(true); reveal("cd-lots", "new-lot-name"); }}>Add lot</Button>
            <Button icon="settings" onClick={() => { setEditing(true); reveal("cd-details", "edit-site-name"); }}>Edit details</Button>
            <Button icon="arrowRight" onClick={() => reveal("cd-assign", "assign-lot")}>Assign a lot</Button>
          </div>
        </section>

        <div className="cn-detail">
          <div className="cn-detail-main">
            <Card title="Lots and curbs" subtitle="Pick a curb on a plan to find it in the list. Open spots and curbs come from the hardware." delay={60}>
              <div id="cd-lots" className="cn-anchor" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {st.lots.length === 0 ? (
                  <Notice tone="info">No lots yet. Add one, or assign an existing lot below.</Notice>
                ) : (
                  <div>
                    {st.lots.map((lotId) => (
                      <LotItem key={lotId} lotId={lotId} lot={lots[lotId]} stats={lotStats[lotId]} curbs={lotUnits[lotId] || []} now={now} />
                    ))}
                  </div>
                )}
                <AddLot siteId={id} lots={lots} open={adding} setOpen={setAdding} />
                <div id="cd-assign" className="cn-anchor"><AssignLot siteId={id} freeLots={unassignedLots} lots={lots} /></div>
              </div>
            </Card>
          </div>

          <div className="cn-detail-side">
            <Card title="Status" delay={90}>
              <StatusControl key={site.status} siteId={id} status={site.status} />
            </Card>

            <Card
              title="Details"
              delay={120}
              actions={!editing && <Button size="sm" onClick={() => setEditing(true)}>Edit</Button>}
            >
              <div id="cd-details" className="cn-anchor">
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
                  <dl className="cn-facts">
                    {[
                      ["Contact", site.contactName],
                      ["Email", site.contactEmail && <a className="sws-link" href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>],
                      ["From request", site.fromLeadId && (lead ? <Link className="sws-link" to={`/requests#${site.fromLeadId}`}>{lead.name}{lead.organization ? `, ${lead.organization}` : ""}</Link> : "A request that has since been deleted")],
                      ["Notes", site.notes],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="sws-field-label">{label}</dt>
                        <dd className={value ? undefined : "cn-dim"}>{value || "Not set"}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </Card>

            <DeleteCustomer siteId={id} name={site.name} lotCount={st.lots.length} />
          </div>
        </div>
      </div>
    </>
  );
}

export default CustomerDetail;

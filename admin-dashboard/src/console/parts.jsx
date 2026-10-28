import { useState } from "react";
import { DEFAULT_ALERTS, formatAgo, formatExact, hasBattery } from "../units";
import Icon from "../components/Icon";
import { Button, Card, Input, Notice, Select, Skeleton, StatusText } from "../components/ui";
import { SITE_LIMITS, SITE_STATUSES, SITE_TYPES, isOnline, siteErrors, statusLabel } from "./data";

// Platform admins can't read settings/alerts (staff only), so the default threshold applies.
const LOW_BATTERY = DEFAULT_ALERTS.lowBattery;

export function SiteStatusBadge({ status }) {
  return <span className={`sws-badge cn-status is-${status}`}>{statusLabel(status).toUpperCase()}</span>;
}

// Skeleton rows while the four subscriptions load.
export function LoadingCard({ rows = 3 }) {
  return (
    <Card>
      <div role="status" aria-label="Loading" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {Array.from({ length: rows }, (_, i) => <Skeleton key={i} height={44} />)}
      </div>
    </Card>
  );
}

// Shown when the database refuses a read: usually the rules aren't published, or
// this account lost its platformAdmins entry.
export function LoadError({ error }) {
  return (
    <Notice tone="warn" title="Couldn't load console data">
      {error?.code === "PERMISSION_DENIED" || /permission/i.test(error?.message || "")
        ? "The database refused the read. Only platform admins can see customers and requests, and the rules may not be published yet."
        : "Check your connection and reload the page."}
    </Notice>
  );
}

function FormField({ id, label, optional, hint, error, children }) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="cn-field">
      <label htmlFor={id} className="sws-field-label">
        {label}{optional && <span className="cn-optional"> (optional)</span>}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {hint && <span id={`${id}-hint`} className="sws-field-hint">{hint}</span>}
      {error && <span id={`${id}-err`} className="cn-err"><Icon name="alert" size={13} />{error}</span>}
    </div>
  );
}

// New and edit customer form. Checks the same limits as the rules before saving,
// and shows the database's answer if it still refuses.
export function SiteForm({ idPrefix, initial, submitLabel, busyLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors((er) => ({ ...er, [key]: undefined }));
    setMsg(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    const found = siteErrors(form);
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(`${idPrefix}-${first}`)?.focus();
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const result = await onSubmit(form);
      if (result) setMsg({ ok: true, text: result });
    } catch (err) {
      setMsg({ ok: false, text: err.code === "PERMISSION_DENIED" || /permission/i.test(err.message) ? "The database refused the save. Check the fields, or that this account is still a platform admin." : "Couldn't save: " + err.message });
    }
    setBusy(false);
  };

  const id = (key) => `${idPrefix}-${key}`;
  return (
    <form className="cn-form" onSubmit={submit} noValidate>
      <FormField id={id("name")} label="Name" error={errors.name} hint={`The customer or site, as it should appear here. Up to ${SITE_LIMITS.name} characters.`}>
        {(a) => <Input {...a} maxLength={SITE_LIMITS.name} value={form.name} onChange={set("name")} autoComplete="organization" />}
      </FormField>
      <FormField id={id("type")} label="Type" error={errors.type}>
        {(a) => (
          <Select {...a} value={form.type} onChange={set("type")}>
            {SITE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </Select>
        )}
      </FormField>
      <FormField id={id("status")} label="Status" error={errors.status}>
        {(a) => (
          <Select {...a} value={form.status} onChange={set("status")}>
            {SITE_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        )}
      </FormField>
      <FormField id={id("contactName")} label="Contact name" optional error={errors.contactName}>
        {(a) => <Input {...a} maxLength={SITE_LIMITS.contactName} value={form.contactName} onChange={set("contactName")} autoComplete="off" />}
      </FormField>
      <FormField id={id("contactEmail")} label="Contact email" optional error={errors.contactEmail}>
        {(a) => <Input {...a} type="email" inputMode="email" spellCheck={false} maxLength={SITE_LIMITS.contactEmail} value={form.contactEmail} onChange={set("contactEmail")} autoComplete="off" />}
      </FormField>
      <div className="is-wide">
        <FormField id={id("notes")} label="Notes" optional error={errors.notes} hint={`${form.notes.length} of ${SITE_LIMITS.notes} characters.`}>
          {(a) => <textarea {...a} rows={3} maxLength={SITE_LIMITS.notes} className="sws-input cn-textarea" value={form.notes} onChange={set("notes")} />}
        </FormField>
      </div>
      <div className="cn-form-actions">
        <Button type="submit" variant="primary" busy={busy} disabled={busy}>{busy ? busyLabel : submitLabel}</Button>
        {onCancel && <Button onClick={onCancel} disabled={busy}>Cancel</Button>}
        <StatusText msg={msg} />
      </div>
    </form>
  );
}

// Online/offline, battery and last seen for each curb in a lot.
export function CurbRows({ curbs, now }) {
  if (!curbs.length) return <div className="cn-lot-empty">No curbs report into this lot yet.</div>;
  return (
    <div className="cn-list">
      <div role="table" aria-label="Curbs">
        <div role="row" className="cn-row cn-curb cn-head">
          {["Curb", "Status", "Battery", "Last seen"].map((h) => <div key={h} role="columnheader" className="sws-th">{h}</div>)}
        </div>
        <div role="rowgroup" className="cn-body">
          {curbs.map(([id, u]) => {
            const online = isOnline(u);
            const low = hasBattery(u) && u.battery < LOW_BATTERY;
            const ago = formatAgo(u.lastUpdated, now);
            return (
              <div key={id} role="row" className="cn-row cn-curb">
                <div role="cell" className="cn-c cn-id"><span className={`cn-dot${online ? "" : " is-off"}`} aria-hidden="true" /><span translate="no">{id}</span></div>
                <div role="cell" className={`cn-c${online ? "" : " cn-dim"}`}>{online ? "Online" : "Offline"}</div>
                <div role="cell" className="cn-c cn-batt">
                  {hasBattery(u) ? (
                    <>
                      <span className={`cn-bar${low ? " is-low" : ""}`} aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, u.battery))}%` }} /></span>
                      <span className={`cn-num${low ? " cn-warn" : ""}`}>{u.battery}%{low && <span className="sws-sr-only"> (low)</span>}</span>
                    </>
                  ) : <span className="cn-dim">Not measured</span>}
                </div>
                <div role="cell" className={`cn-c${ago ? "" : " cn-dim"}`} title={formatExact(u.lastUpdated)}>{ago || "Never"}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// One lot: name, online count, an optional action, then its curbs.
export function LotBlock({ name, stats, curbs, now, action, headingLevel = 3 }) {
  const H = `h${headingLevel}`;
  return (
    <div className="cn-lot">
      <div className="cn-lot-head">
        <H className="cn-lot-name">{name}</H>
        <span className="cn-lot-meta">
          {stats.curbs ? `${stats.online} of ${stats.curbs} curbs online` : "No curbs"}
          {stats.lastSeen ? ` · last seen ${formatAgo(stats.lastSeen, now)}` : ""}
        </span>
        {action}
      </div>
      <CurbRows curbs={curbs} now={now} />
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { DEFAULT_ALERTS, STALL_WORD, formatAgo, formatExact, hasBattery, statusKey } from "../units";
import Icon from "../components/Icon";
import LotPlan, { StallMark } from "../components/LotPlan";
import { Button, Card, Input, Notice, Select, Skeleton, StatusText } from "../components/ui";
import { HEALTH_KEYS, LOT_LIMITS, curbHealth, SITE_LIMITS, SITE_STATUSES, SITE_TYPES, isLow, isOnline, lotErrors, lotIdFromName, siteErrors, statusLabel, typeLabel } from "./data";

export function SiteStatusBadge({ status }) {
  return <span className={`sws-badge cn-status is-${status}`}>{statusLabel(status).toUpperCase()}</span>;
}

// Words and legend marks for each part of curbHealth(). Attention is a ring, as on the Overview.
const HEALTH = {
  free: { word: "free", mark: { status: "open" } },
  occupied: { word: "occupied", mark: { status: "occupied" } },
  attention: { word: "low battery", mark: { status: "ring", low: true } },
  offline: { word: "offline", mark: { status: "offline" } },
};
const healthText = (h) => HEALTH_KEYS.filter((k) => h[k]).map((k) => `${h[k]} ${HEALTH[k].word}`).join(", ");

// A bar of a customer's or lot's curbs in the fixed status colours, with a key underneath.
export function HealthBar({ health, label, keyed = true, empty = "No curbs reporting yet" }) {
  if (!health.total) return <div className="cn-health is-empty">{empty}</div>;
  const parts = HEALTH_KEYS.filter((k) => health[k]);
  return (
    <div className="cn-health">
      <div className="cn-health-bar" role="img" aria-label={`${label}: ${healthText(health)}`}>
        {parts.map((k) => <span key={k} className={`cn-seg is-${k}`} style={{ flexGrow: health[k] }} />)}
      </div>
      {keyed && (
        <ul className="cn-health-key" aria-hidden="true">
          {parts.map((k) => (
            <li key={k}><StallMark {...HEALTH[k].mark} swatch /><span className="cn-num">{health[k]}</span> {HEALTH[k].word}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Customers as a grid of cards. Each list item fades up in turn; the card inside
// lifts on hover (two elements, so the entrance doesn't hold its transform).
export function CustomerCards({ sites, siteStats, now, label = "Customers" }) {
  return (
    <ul className="cn-cards" aria-label={label}>
      {sites.map(([id, s], i) => (
        <li key={id} className="sws-enter" style={{ "--d": `${Math.min(i, 8) * 40}ms` }}>
          <CustomerCard id={id} site={s} stats={siteStats[id]} now={now} />
        </li>
      ))}
    </ul>
  );
}

// One customer as a card: the name links to its page and covers the card.
function CustomerCard({ id, site, stats, now }) {
  const ago = formatAgo(stats.lastSeen, now);
  return (
    <article className="cn-cc">
      <div className="cn-cc-head">
        <h3 className="cn-cc-name"><Link to={`/customers/${id}`} className="cn-cc-link">{site.name}</Link></h3>
        <SiteStatusBadge status={site.status} />
      </div>
      <div className="cn-cc-type">{typeLabel(site.type)}{site.contactName ? ` · ${site.contactName}` : ""}</div>
      <dl className="cn-cc-stats">
        <div><dt>Lots</dt><dd className="cn-num">{stats.lots.length}</dd></div>
        <div><dt>Curbs</dt><dd className="cn-num">{stats.curbs}</dd></div>
        <div><dt>Online</dt><dd className={`cn-num${stats.curbs && stats.online < stats.curbs ? " cn-warn" : ""}`}>{stats.curbs ? `${stats.online}/${stats.curbs}` : "–"}</dd></div>
      </dl>
      <HealthBar health={stats.health} label={`${site.name} curbs`} empty={stats.lots.length ? "No curbs reporting yet" : "No lots assigned yet"} />
      <div className="cn-cc-foot" title={formatExact(ago ? stats.lastSeen : site.createdAt)}>
        {ago ? `Last report ${ago}` : site.createdAt ? `Added ${formatAgo(site.createdAt, now)}` : "Waiting for its first report"}
      </div>
    </article>
  );
}

// Empty and all-clear states: an icon on a tinted disc, a title, a line and an action.
export function ConsoleEmpty({ icon = "info", tone, title, children, action }) {
  return (
    <div className={`cn-empty${tone ? ` is-${tone}` : ""}`}>
      <span className="cn-empty-icon" aria-hidden="true"><Icon name={icon} size={22} /></span>
      <div className="cn-empty-title">{title}</div>
      {children && <p className="cn-empty-text">{children}</p>}
      {action && <div className="cn-empty-actions">{action}</div>}
    </div>
  );
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

// Add and edit lot form. `lots` is given when adding, to show and check the ID
// made from the name; editing never changes the ID.
export function LotForm({ idPrefix, initial, lots, submitLabel, busyLabel, onSubmit, onCancel }) {
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
    const found = lotErrors(form, lots);
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
      setMsg({ ok: false, text: err.code === "PERMISSION_DENIED" || /permission/i.test(err.message) ? (lots ? "The database refused the lot. Another lot may already use that ID, or this account is no longer a platform admin." : "The database refused the save. Check the fields, or that this account is still a platform admin.") : "Couldn't save: " + err.message });
    }
    setBusy(false);
  };

  const id = (key) => `${idPrefix}-${key}`;
  const lotId = lotIdFromName(form.name.trim());
  const nameHint = lots ? (lotId ? `Lot ID: ${lotId}. Made from the name; it can't be changed later.` : "The lot's ID is made from the letters and numbers in its name.") : `Up to ${LOT_LIMITS.name} characters.`;
  return (
    <form className="cn-form" onSubmit={submit} noValidate>
      <FormField id={id("name")} label="Name" error={errors.name} hint={nameHint}>
        {(a) => <Input {...a} maxLength={LOT_LIMITS.name} value={form.name} onChange={set("name")} autoComplete="off" />}
      </FormField>
      <FormField id={id("totalSpots")} label="Total spots" error={errors.totalSpots} hint={lots ? "All of them start open, until the curbs report." : "Open spots keep coming from the curbs."}>
        {(a) => <Input {...a} inputMode="numeric" value={form.totalSpots} onChange={set("totalSpots")} autoComplete="off" />}
      </FormField>
      <FormField id={id("latitude")} label="Latitude" optional error={errors.latitude} hint="-90 to 90, for example 40.7128.">
        {(a) => <Input {...a} inputMode="decimal" value={form.latitude} onChange={set("latitude")} autoComplete="off" spellCheck={false} />}
      </FormField>
      <FormField id={id("longitude")} label="Longitude" optional error={errors.longitude} hint="-180 to 180, for example -74.006.">
        {(a) => <Input {...a} inputMode="decimal" value={form.longitude} onChange={set("longitude")} autoComplete="off" spellCheck={false} />}
      </FormField>
      <div className="cn-form-actions">
        <Button type="submit" variant="primary" busy={busy} disabled={busy}>{busy ? busyLabel : submitLabel}</Button>
        {onCancel && <Button onClick={onCancel} disabled={busy}>Cancel</Button>}
        <StatusText msg={msg} />
      </div>
    </form>
  );
}

// Online/offline, battery and last seen for each curb in a lot.
export function CurbRows({ curbs, now, selected }) {
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
            const low = isLow(u);
            const ago = formatAgo(u.lastUpdated, now);
            return (
              <div key={id} role="row" className={`cn-row cn-curb${id === selected ? " is-sel" : ""}`}>
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

// One lot: name, online count, an optional action, anything passed as children
// (the edit form), then its curbs. With `plan`, a compact lot plan sits beside the
// curb list; picking a stall highlights that curb's row.
export function LotBlock({ name, stats, curbs, now, action, detail, children, plan, headingLevel = 3 }) {
  const [picked, setPicked] = useState(null);
  const H = `h${headingLevel}`;
  const rows = <CurbRows curbs={curbs} now={now} selected={picked} />;
  return (
    <div className="cn-lot">
      <div className="cn-lot-head">
        <H className="cn-lot-name">{name}</H>
        <span className="cn-lot-meta">
          {detail ? `${detail} · ` : ""}
          {stats.curbs ? `${stats.online} of ${stats.curbs} curbs online` : "No curbs"}
          {stats.lastSeen ? ` · last seen ${formatAgo(stats.lastSeen, now)}` : ""}
        </span>
        {action}
      </div>
      {children}
      {plan && curbs.length > 0 ? (
        <div className="cn-lot-body">
          <div className="cn-lot-plan">
            <LotPlan size="compact" name={name} units={curbs} alerts={DEFAULT_ALERTS} now={now} selected={picked} onSelect={(id) => setPicked((p) => (p === id ? null : id))} />
          </div>
          {rows}
        </div>
      ) : rows}
    </div>
  );
}

// One lot on Deployments: its curbs as a row of stall marks, offline and low-battery
// call-outs, the curbs that need a look, and every curb's details folded away.
export function LotRow({ name, detail, stats, curbs, now, headingLevel = 3 }) {
  const H = `h${headingLevel}`;
  const off = curbs.filter(([, u]) => !isOnline(u));
  const low = curbs.filter(([, u]) => isOnline(u) && isLow(u));
  const issues = [...off, ...low];
  return (
    <div className="cn-lrow">
      <div className="cn-lrow-head">
        <H className="cn-lot-name">{name}</H>
        <span className="cn-lot-meta">
          {detail ? `${detail} · ` : ""}
          {stats.curbs ? `${stats.online} of ${stats.curbs} online` : "No curbs"}
          {stats.lastSeen ? ` · last seen ${formatAgo(stats.lastSeen, now)}` : ""}
        </span>
        <span className="cn-calls">
          {off.length > 0 && <span className="sws-badge cn-call is-off">{off.length} OFFLINE</span>}
          {low.length > 0 && <span className="sws-badge cn-call is-low">{low.length} LOW BATTERY</span>}
          {curbs.length > 0 && !issues.length && <span className="sws-badge cn-call is-ok">ALL REPORTING</span>}
        </span>
      </div>
      {curbs.length === 0 ? (
        <div className="cn-lot-empty" style={{ padding: 0 }}>No curbs report into this lot yet.</div>
      ) : (
        <>
          <ul className="cn-dots" role="img" aria-label={`${name}: ${healthText(curbHealth(curbs))}`}>
            {curbs.map(([id, u]) => (
              <li key={id} title={`${id}: ${STALL_WORD[statusKey(u)]}${isLow(u) ? `, battery ${u.battery}%` : ""}`}>
                <StallMark status={statusKey(u)} low={isLow(u)} swatch />
              </li>
            ))}
          </ul>
          {issues.length > 0 && (
            <ul className="cn-issues" aria-label={`Curbs that need a look in ${name}`}>
              {issues.map(([id, u]) => {
                const ago = formatAgo(u.lastUpdated, now);
                return (
                  <li key={id}>
                    <span className="sws-mono cn-issue-id" translate="no">{id}</span>
                    <span className={isOnline(u) ? "cn-warn" : "cn-issue-off"}>{isOnline(u) ? `Low battery, ${u.battery}%` : "Offline"}</span>
                    <span className="cn-dim" title={formatExact(u.lastUpdated)}>{ago ? `last seen ${ago}` : "never seen"}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <details className="cn-more">
            <summary>All {curbs.length} {curbs.length === 1 ? "curb" : "curbs"}: battery and last seen</summary>
            <div className="cn-lot"><CurbRows curbs={curbs} now={now} /></div>
          </details>
        </>
      )}
    </div>
  );
}

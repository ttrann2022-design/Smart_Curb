import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";
import { dataPath } from "../dataMode";
import { LED_HEX } from "../theme";
import { useNow } from "../units";
import { useScoped } from "../useScope";
import { applyNow, blankSettings, useSchedule } from "../schedules";
import { DEFAULT_RULE_ID, DEFAULT_TIMEZONE, effectiveLook, lookAtWall, lookKey, lotSummary, parseTime, wallClock } from "../../shared/schedule.js";
import { DAY_NAMES, EVERY_DAY, WEEKDAYS, daysText, formatInstant, formatMinutes, listOf, timezoneOptions } from "../scheduleText";
import LedPreview from "../components/LedPreview";
import LookEditor from "../components/LookEditor";
import ScheduleRuleForm from "../components/ScheduleRuleForm";
import ScheduleTimeline from "../components/ScheduleTimeline";
import { Button, Card, EmptyState, Field, Notice, PageHeader, Select, Skeleton, StatusText } from "../components/ui";
import "./schedules.css";

const DEFAULT_LABEL = "Default look";
const STARTING_LOOK = { ledColor: "blue", panelText: "", ledBrightness: 100 };

// Start a new timed state from one of these. Saving is still up to the manager. Dim keeps
// the site's usual colour and text, since only the brightness changes at night.
const TEMPLATES = [
  { id: "night", label: "Night dim", hint: "10 PM to 6 AM, 10%", rule: (base) => ({ name: "Night dim", days: EVERY_DAY, start: "22:00", end: "06:00", look: { ...base, ledBrightness: 10 } }) },
  { id: "staff", label: "Staff parking", hint: "Mon to Fri, 7 AM to 5 PM, RESERVED", rule: () => ({ name: "Staff parking", days: WEEKDAYS, start: "07:00", end: "17:00", look: { ledColor: "gold", panelText: "RESERVED", ledBrightness: 100 } }) },
  { id: "event", label: "Event hold", hint: "Saturday, 4 PM to 11 PM, EVENT HOLD", rule: () => ({ name: "Event hold", days: [6], start: "16:00", end: "23:00", look: { ledColor: "red", panelText: "EVENT HOLD", ledBrightness: 100 } }) },
];

const refused = (err) => err?.code === "PERMISSION_DENIED" || /permission/i.test(err?.message || "");

function Swatch({ color }) {
  return <span className="tm-swatch" style={{ background: LED_HEX[color] }} aria-hidden="true" />;
}

const lookText = (look) => `${look.panelText || "No text"}, ${look.ledBrightness}%`;

// A rule's name, or the default look's.
const nameOf = (ruleId, rules) => (ruleId === DEFAULT_RULE_ID ? DEFAULT_LABEL : rules[ruleId]?.name || "Timed state");

// Per lot: the active timed state, until when, and what comes next.
function RightNow({ lots, curbsByLot, schedule, now, canApply, siteId, simulated }) {
  const { settings, rules, applied } = schedule;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const enabled = settings?.enabled === true;
  const timezone = settings?.timezone || DEFAULT_TIMEZONE;
  const lotIds = Object.keys(lots).sort((a, b) => (lots[a].name || a).localeCompare(lots[b].name || b, undefined, { numeric: true }));

  const apply = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { sites } = await applyNow(siteId);
      const r = sites[0];
      if (!r) setMsg({ ok: false, text: "Timed states are off for this site, so nothing was changed." });
      else if (r.error) setMsg({ ok: false, text: r.error });
      else if (r.failed) setMsg({ ok: false, text: `${r.changed} curbs updated, but the database refused ${r.failed}. Changing LEDs needs an operator or manager account on this dashboard.` });
      else setMsg({ ok: true, text: r.changed ? `${r.changed} ${r.changed === 1 ? "curb" : "curbs"} updated. The Receiver sends the change to the LEDs.` : "Every curb already shows its current look." });
    } catch (err) {
      setMsg({ ok: false, text: refused(err) ? "The database refused this." : `Couldn't apply: ${err.message}` });
    }
    setBusy(false);
  };

  const action = canApply && (
    <Button size="sm" variant="primary" icon="send" onClick={apply} busy={busy} disabled={busy || !enabled || simulated} title={simulated ? "Simulation never writes" : enabled ? undefined : "Switch timed states on first"}>Apply now</Button>
  );

  let body;
  if (!lotIds.length) {
    body = <EmptyState icon="lots" title="No lots yet">Lots appear here once they&apos;re assigned to this customer.</EmptyState>;
  } else if (!enabled) {
    body = <EmptyState icon="clock" title="Timed states are off">{settings?.default ? "Curbs keep whatever look they have now. Switch timed states on to start." : "Set the look to show outside timed states, then switch them on."}</EmptyState>;
  } else {
    body = (
      <ul className="tm-now-list">
        {lotIds.map((lotId) => {
          const curbs = curbsByLot[lotId] || [];
          const s = lotSummary(lotId, curbs, rules, settings, (id, lot, rs, st) => effectiveLook(id, lot, rs, st, now));
          const nextName = s.nextChangeAt ? nameOf(effectiveLook(curbs[0] ?? null, lotId, rules, settings, s.nextChangeAt, { withNext: false }).ruleId, rules) : null;
          const pending = simulated ? 0 : s.units.filter((u) => u.id && u.result?.key && applied[u.id]?.key !== u.result.key).length;
          return (
            <li key={lotId} className="tm-now-row">
              <div className="tm-now-lot">{lots[lotId].name || lotId}</div>
              <div className="tm-now-state">
                {s.look && <Swatch color={s.look.ledColor} />}
                <span className="tm-now-name">{nameOf(s.ruleId, rules)}</span>
                {s.look && <span className="tm-dim">{lookText(s.look)}</span>}
              </div>
              <div className="tm-now-next">
                {s.nextChangeAt ? `until ${formatInstant(s.nextChangeAt, timezone, now)}, then ${nextName}` : "no change scheduled"}
                {s.differing > 0 && <div className="tm-dim">{s.differing} {s.differing === 1 ? "curb differs" : "curbs differ"}</div>}
                {pending > 0 && <div className="tm-warn">{pending} {pending === 1 ? "curb hasn't" : "curbs haven't"} got this yet</div>}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <Card title="Right now" subtitle={enabled ? `Times are for ${timezone}.` : undefined} actions={action} delay={0}>
      {body}
      {simulated && canApply && <p className="sws-note tm-mt">Apply now is off in Simulation: it never writes.</p>}
      <div className="tm-mt-status"><StatusText msg={msg} /></div>
    </Card>
  );
}

// The site switch, timezone and "Outside timed states, show..." look.
function SiteSettings({ settings, store, canEdit }) {
  const current = settings || blankSettings();
  const [look, setLook] = useState(current.default || STARTING_LOOK);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const saved = current.default;
  const dirty = !saved || lookKey({ ...look, panelText: look.panelText.trim() }) !== lookKey(saved);
  const zones = timezoneOptions(current.timezone);

  const save = async (next, ok) => {
    setBusy(true);
    setMsg(null);
    try {
      await store.saveSettings(next);
      setMsg(ok ? { ok: true, text: ok } : null);
    } catch (err) {
      setMsg({ ok: false, text: refused(err) ? "The database refused this. Only this site's managers and platform admins can change it." : `Couldn't save: ${err.message}` });
    }
    setBusy(false);
  };

  return (
    <Card title="Site settings" delay={60}>
      <div className="tm-settings">
        <label className={`tm-switch${!saved ? " is-locked" : ""}`}>
          <input type="checkbox" role="switch" checked={current.enabled === true} disabled={!canEdit || !saved || busy} onChange={(e) => save({ ...current, enabled: e.target.checked }, e.target.checked ? "Timed states are on." : "Timed states are off. Curbs keep the look they have.")} />
          <span className="tm-switch-track" aria-hidden="true" />
          <span>
            <span className="tm-switch-label">Timed states</span>
            <span className="sws-field-hint tm-block-text">{saved ? "When off, this site's curbs aren't touched at all." : "Save the look below before switching on."}</span>
          </span>
        </label>
        <Field label="Timezone">
          <Select value={current.timezone} disabled={!canEdit || busy} onChange={(e) => save({ ...current, timezone: e.target.value }, "Timezone saved.")}>
            {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
          </Select>
        </Field>
        <div>
          <h3 className="tm-h3">Outside timed states, show...</h3>
          <LookEditor look={look} onChange={setLook} disabled={!canEdit || busy} />
        </div>
        {canEdit && <div><Button onClick={() => save({ ...current, default: { ...look, panelText: look.panelText.trim() } }, "Default look saved.")} disabled={busy || !dirty} busy={busy}>{dirty ? "Save default look" : "Default look saved"}</Button></div>}
        <StatusText msg={msg} />
      </div>
    </Card>
  );
}

function RuleList({ rules, store, canEdit, onEdit, lots }) {
  const [msg, setMsg] = useState(null);
  const ids = Object.keys(rules).sort((a, b) => (rules[a].priority ?? 0) === (rules[b].priority ?? 0) ? (rules[a].start || "").localeCompare(rules[b].start || "") : (rules[b].priority ?? 0) - (rules[a].priority ?? 0));
  const targetText = (t) => {
    if (t?.type === "units") return `${listOf(t.ids).length} ${listOf(t.ids).length === 1 ? "curb" : "curbs"}`;
    if (t?.type === "lots") return listOf(t.ids).map((id) => lots[id]?.name || id).join(", ");
    return "Whole site";
  };
  const toggle = async (id, enabled) => {
    setMsg(null);
    try { await store.setRuleEnabled(id, enabled); } catch (err) { setMsg({ ok: false, text: refused(err) ? "The database refused this." : err.message }); }
  };
  return (
    <>
      <ul className="tm-rules">
        {ids.map((id) => {
          const r = rules[id];
          const time = `${formatMinutes(parseTime(r.start) ?? 0)} to ${formatMinutes(parseTime(r.end) ?? 0)}`;
          return (
            <li key={id} className={`tm-rule${r.enabled === true ? "" : " is-off"}`}>
              <label className="tm-switch tm-switch-sm" title={canEdit ? undefined : "Managers can change this"}>
                <input type="checkbox" role="switch" aria-label={`${r.name} on or off`} checked={r.enabled === true} disabled={!canEdit} onChange={(e) => toggle(id, e.target.checked)} />
                <span className="tm-switch-track" aria-hidden="true" />
              </label>
              <Swatch color={r.look?.ledColor} />
              <div className="tm-rule-main">
                <div className="tm-rule-name">{r.name}</div>
                <div className="tm-dim">{daysText(r.days)}, {time}</div>
              </div>
              <div className="tm-rule-meta">
                <div>{targetText(r.target)}</div>
                <div className="tm-dim">{r.look ? lookText(r.look) : ""} · priority {r.priority}</div>
              </div>
              {canEdit && <Button size="sm" onClick={() => onEdit(id)} aria-label={`Edit ${r.name}`}>Edit</Button>}
            </li>
          );
        })}
      </ul>
      <StatusText msg={msg} />
    </>
  );
}

// What each lot's LEDs would show at a chosen day and time. Reads only, whether or not
// the site is switched on.
function PreviewAt({ lots, curbsByLot, rules, settings, now }) {
  const wall = wallClock(now, settings?.timezone || DEFAULT_TIMEZONE);
  const [day, setDay] = useState(wall.day);
  const [minutes, setMinutes] = useState(Math.floor(wall.minutes / 15) * 15);
  const lotIds = Object.keys(lots).sort((a, b) => (lots[a].name || a).localeCompare(lots[b].name || b, undefined, { numeric: true }));
  return (
    <Card title="Preview at..." subtitle="What each lot's LEDs would show then. Nothing is sent to the curbs." delay={150}>
      <div className="tm-preview-controls">
        <Field label="Day">
          <Select value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {DAY_NAMES.map((name, d) => <option key={d} value={d}>{name}</option>)}
          </Select>
        </Field>
        <Field label={`Time: ${formatMinutes(minutes)}`}>
          <input type="range" className="sws-range" min={0} max={1425} step={15} value={minutes} aria-valuetext={formatMinutes(minutes)} onChange={(e) => setMinutes(Number(e.target.value))} />
        </Field>
      </div>
      {lotIds.length === 0 ? <p className="sws-note">No lots to preview yet.</p> : (
        <ul className="tm-preview-list">
          {lotIds.map((lotId) => {
            const s = lotSummary(lotId, curbsByLot[lotId] || [], rules, settings, (id, lot, rs, st) => lookAtWall(id, lot, rs, st, day, minutes));
            return (
              <li key={lotId}>
                <div className="tm-preview-head">
                  <span className="tm-now-lot">{lots[lotId].name || lotId}</span>
                  <span className="tm-dim">{s.look ? nameOf(s.ruleId, rules) : "Nothing set"}{s.differing > 0 ? `, ${s.differing} ${s.differing === 1 ? "curb differs" : "curbs differ"}` : ""}</span>
                </div>
                {s.look ? <LedPreview color={s.look.ledColor} text={s.look.panelText} brightness={s.look.ledBrightness} /> : <p className="sws-note">Set the look to show outside timed states.</p>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function SchedulePage({ siteId, simulated, canEdit }) {
  const [rawLots, setLots] = useState(null);
  const [rawUnits, setUnits] = useState(null);
  const [readError, setReadError] = useState(null);
  const scoped = useScoped(rawLots || {}, rawUnits || {});
  const { lots, units } = scoped;
  const schedule = useSchedule(siteId);
  const now = useNow(30000);
  // { id: ruleId or null, initial: the rule to start from }
  const [editing, setEditing] = useState(null);
  const { settings, rules, store } = schedule;

  useEffect(() => {
    const stopLots = onValue(ref(database, dataPath("lots")), (s) => setLots(s.val() || {}), setReadError);
    const stopUnits = onValue(ref(database, dataPath("units")), (s) => setUnits(s.val() || {}), setReadError);
    return () => { stopLots(); stopUnits(); };
  }, []);

  const subtitle = simulated ? "Scheduled LED looks, tried out on simulated curbs" : "Scheduled LED looks for this customer's curbs";
  const head = <PageHeader title="Schedules" subtitle={subtitle} />;
  const error = schedule.error || readError;
  if (error) {
    return (
      <>
        {head}
        <div className="sws-page-body sws-narrow">
          <Notice tone="busy" title="Couldn't load timed states">
            {refused(error) ? "The database refused the read. The rules for timed states may not be published yet." : "Check your connection and reload the page."}
          </Notice>
        </div>
      </>
    );
  }
  if (!schedule.loaded || !rawLots || !rawUnits) {
    return <>{head}<div className="sws-page-body" role="status" aria-label="Loading"><Skeleton height={140} /><Skeleton height={220} /></div></>;
  }

  const curbsByLot = {};
  for (const [id, u] of Object.entries(units)) if (lots[u.lot]) (curbsByLot[u.lot] ||= []).push(id);
  Object.values(curbsByLot).forEach((list) => list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
  const placedUnits = Object.fromEntries(Object.entries(units).filter(([, u]) => lots[u.lot]));
  const timezone = settings?.timezone || DEFAULT_TIMEZONE;
  const hasRules = Object.keys(rules).length > 0;
  const startNew = (template) => setEditing({ id: null, initial: { enabled: true, priority: 5, target: { type: "site" }, days: [], start: "", end: "", name: "", look: settings?.default || STARTING_LOOK, ...template?.rule(settings?.default || STARTING_LOOK) } });
  const editRule = (id) => setEditing({ id, initial: rules[id] });

  return (
    <>
      {head}
      <div className="sws-page-body">
        {simulated && <Notice tone="sim" title="Nothing here is saved">In Simulation, timed states stay in this browser tab and never write to the database or the simulated curbs. Use them to try out the timeline and the preview.</Notice>}
        {!canEdit && <Notice tone="info" icon="lock">Only managers can change timed states. You can see them here.</Notice>}

        <div className="tm-top">
          <RightNow lots={lots} curbsByLot={curbsByLot} schedule={schedule} now={now} canApply={canEdit} siteId={siteId} simulated={simulated} />
          <SiteSettings key={lookKey(settings?.default) || "none"} settings={settings} store={store} canEdit={canEdit} />
        </div>

        <Card title="This week" subtitle={`Each block is a timed state, in its look's colour${canEdit ? ". Click one to edit it" : ""}. Times are for ${timezone}.`} delay={90}>
          <ScheduleTimeline rules={rules} timezone={timezone} now={now} onEdit={canEdit ? editRule : null} />
        </Card>

        {editing && (
          <ScheduleRuleForm
            key={editing.id || editing.initial.name || "new"}
            ruleId={editing.id}
            initial={editing.initial}
            lots={lots}
            units={placedUnits}
            onSave={async (rule) => { await store.saveRule(editing.id, rule); setEditing(null); }}
            onDelete={async () => { await store.removeRule(editing.id); setEditing(null); }}
            onCancel={() => setEditing(null)}
          />
        )}

        <Card title="Timed states" actions={canEdit && !editing && <Button size="sm" icon="clock" onClick={() => startNew()}>New timed state</Button>} delay={120}>
          {hasRules ? <RuleList rules={rules} store={store} canEdit={canEdit} onEdit={editRule} lots={lots} /> : (
            <EmptyState icon="clock" title="No timed states yet">
              {canEdit ? "Start from a template below, or make your own." : "A manager can set them up."}
            </EmptyState>
          )}
          {canEdit && (
            <div className="tm-templates">
              <span className="sws-field-label">Start from a template</span>
              <div className="tm-template-list">
                {TEMPLATES.map((t) => (
                  <button key={t.id} type="button" className="tm-template" onClick={() => startNew(t)}>
                    <span className="tm-template-name">{t.label}</span>
                    <span className="tm-dim">{t.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>

        <PreviewAt lots={lots} curbsByLot={curbsByLot} rules={rules} settings={settings} now={now} />
      </div>
    </>
  );
}

// Schedules are per customer, so a platform admin viewing All picks one first. Unlinked
// accounts never reach this page: Layout shows them its own screen.
function Schedules() {
  const { role, mode, scope, isPlatformAdmin } = useOutletContext();
  const simulated = mode === "sim";
  const canEdit = isPlatformAdmin || role === "manager";
  if (simulated) return <SchedulePage siteId={null} simulated canEdit={canEdit} />;
  if (scope.kind !== "site") {
    return (
      <>
        <PageHeader title="Schedules" subtitle="Scheduled LED looks, set for each customer" />
        <div className="sws-page-body sws-narrow">
          <Card>
            <EmptyState icon="users" title="Pick a customer">Timed states belong to one customer. Choose one under Viewing in the sidebar.</EmptyState>
          </Card>
        </div>
      </>
    );
  }
  return <SchedulePage key={scope.siteId} siteId={scope.siteId} simulated={false} canEdit={canEdit} />;
}

export default Schedules;

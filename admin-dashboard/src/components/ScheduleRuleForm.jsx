import { useEffect, useRef, useState } from "react";
import { parseTime, ruleErrors } from "../../shared/schedule.js";
import { DAY_NAMES, EVERY_DAY, WEEKDAYS, WEEKENDS, formatMinutes, listOf } from "../scheduleText";
import LookEditor from "./LookEditor";
import { Button, Card, Field, Input, Select } from "./ui";
import Icon from "./Icon";

const TARGETS = [{ id: "site", label: "Whole site" }, { id: "lots", label: "Lots" }, { id: "units", label: "Specific curbs" }];

function FieldError({ text }) {
  if (!text) return null;
  return <span className="tm-err"><Icon name="alert" size={13} />{text}</span>;
}

// A form from a saved rule or a template. Targets that left the account's scope drop out.
function toForm(rule, lots, units) {
  const type = rule.target?.type || "site";
  const known = type === "lots" ? lots : units;
  return {
    name: rule.name || "", enabled: rule.enabled !== false, days: listOf(rule.days), start: rule.start || "", end: rule.end || "",
    type, ids: type === "site" ? [] : listOf(rule.target?.ids).filter((id) => Object.hasOwn(known, id)),
    look: rule.look, priority: rule.priority ?? 5,
  };
}

// New or edit form for one timed state.
function ScheduleRuleForm({ ruleId, initial, lots, units, onSave, onDelete, onCancel }) {
  const [form, setForm] = useState(() => toForm(initial, lots, units));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const top = useRef(null);
  const set = (fields) => { setForm((f) => ({ ...f, ...fields })); setFailed(null); };

  useEffect(() => {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    top.current?.scrollIntoView({ behavior, block: "start" });
    top.current?.querySelector("input")?.focus({ preventScroll: true });
  }, []);

  const toggleDay = (d) => set({ days: form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d].sort((a, b) => a - b) });
  const toggleId = (id) => set({ ids: form.ids.includes(id) ? form.ids.filter((x) => x !== id) : [...form.ids, id] });
  const lotIds = Object.keys(lots).sort((a, b) => (lots[a].name || a).localeCompare(lots[b].name || b, undefined, { numeric: true }));
  const unitIds = Object.keys(units).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const s = parseTime(form.start);
  const e = parseTime(form.end);

  const save = async (ev) => {
    ev.preventDefault();
    const rule = {
      name: form.name.trim(), enabled: form.enabled, days: form.days, start: form.start, end: form.end,
      target: form.type === "site" ? { type: "site" } : { type: form.type, ids: form.ids },
      look: { ...form.look, panelText: form.look.panelText.trim() }, priority: form.priority,
    };
    const found = ruleErrors(rule);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await onSave(rule);
    } catch (err) {
      setFailed(err.code === "PERMISSION_DENIED" ? "The database refused this. Only this site's managers and platform admins can change timed states." : `Couldn't save: ${err.message}`);
      setBusy(false);
    }
  };

  const del = async () => {
    setBusy(true);
    try { await onDelete(); } catch (err) { setFailed(`Couldn't delete: ${err.message}`); setBusy(false); }
  };

  return (
    <div ref={top} className="tm-anchor">
      <Card title={ruleId ? `Edit ${initial.name}` : "New timed state"} subtitle="Curbs turn their LEDs off when occupied, so this sets how a vacant curb looks." delay={0}>
        <form className="tm-form" onSubmit={save} noValidate>
          <div className="tm-form-when">
            <Field label="Name">
              <Input value={form.name} maxLength={60} onChange={(ev) => set({ name: ev.target.value })} placeholder="e.g. Night dim" aria-invalid={errors.name ? true : undefined} />
            </Field>
            <FieldError text={errors.name} />

            <div className="sws-field">
              <span className="sws-field-label" id="tm-days">Days</span>
              <div className="sws-chips" role="group" aria-labelledby="tm-days">
                {DAY_NAMES.map((name, d) => (
                  <button key={d} type="button" className="sws-chip" aria-pressed={form.days.includes(d)} aria-label={name} onClick={() => toggleDay(d)}>{name.slice(0, 3)}</button>
                ))}
              </div>
              <div className="tm-day-shortcuts">
                {[["Weekdays", WEEKDAYS], ["Weekends", WEEKENDS], ["Every day", EVERY_DAY]].map(([label, days]) => (
                  <button key={label} type="button" className="tm-linkbtn" onClick={() => set({ days })}>{label}</button>
                ))}
              </div>
              <FieldError text={errors.days} />
            </div>

            <div className="tm-times">
              <Field label="Start"><Input type="time" value={form.start} onChange={(ev) => set({ start: ev.target.value })} aria-invalid={errors.start ? true : undefined} /></Field>
              <Field label="End"><Input type="time" value={form.end} onChange={(ev) => set({ end: ev.target.value })} aria-invalid={errors.end ? true : undefined} /></Field>
            </div>
            <FieldError text={errors.start || errors.end} />
            {s !== null && e !== null && e < s && <span className="sws-field-hint">Crosses midnight: it ends at {formatMinutes(e)} the next morning.</span>}

            <div className="sws-field">
              <span className="sws-field-label" id="tm-target">Applies to</span>
              <div className="sws-chips" role="radiogroup" aria-labelledby="tm-target">
                {TARGETS.map((t) => (
                  <label key={t.id} className="sws-chip tm-radio" data-checked={form.type === t.id}>
                    <input type="radio" name="tm-target" className="sws-sr-only" checked={form.type === t.id} onChange={() => set({ type: t.id, ids: [] })} />
                    {t.label}
                  </label>
                ))}
              </div>
              {form.type !== "site" && (
                <div className="tm-picks" role="group" aria-label={form.type === "lots" ? "Lots" : "Curbs"}>
                  {(form.type === "lots" ? lotIds : unitIds).map((id) => (
                    <label key={id} className="tm-pick">
                      <input type="checkbox" checked={form.ids.includes(id)} onChange={() => toggleId(id)} />
                      <span>{form.type === "lots" ? lots[id].name || id : <><span className="sws-mono" translate="no">{id}</span> <span className="tm-dim">{lots[units[id].lot]?.name || ""}</span></>}</span>
                    </label>
                  ))}
                  {(form.type === "lots" ? lotIds : unitIds).length === 0 && <span className="sws-note">{form.type === "lots" ? "No lots yet." : "No curbs yet."}</span>}
                </div>
              )}
              <FieldError text={errors.target} />
            </div>

            <Field label="Priority" hint="When timed states overlap, the highest priority shows. On a tie, specific curbs beat lots, lots beat the whole site, then the later start wins.">
              <Select value={form.priority} onChange={(ev) => set({ priority: Number(ev.target.value) })}>
                {Array.from({ length: 10 }, (_, i) => <option key={i} value={i}>{i}{i === 9 ? " (highest)" : i === 0 ? " (lowest)" : ""}</option>)}
              </Select>
            </Field>
          </div>

          <div className="tm-form-look">
            <LookEditor look={form.look} onChange={(look) => set({ look })} />
          </div>

          <div className="tm-form-actions">
            <Button type="submit" variant="primary" busy={busy} disabled={busy}>{ruleId ? "Save timed state" : "Add timed state"}</Button>
            <Button onClick={onCancel} disabled={busy}>Cancel</Button>
            {ruleId && !confirmDelete && <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={busy}>Delete</Button>}
            {ruleId && confirmDelete && (
              <span className="tm-confirm" role="alertdialog" aria-label="Confirm delete">
                Delete {initial.name}?
                <Button size="sm" variant="danger" onClick={del} disabled={busy} autoFocus>Yes, delete</Button>
                <Button size="sm" onClick={() => setConfirmDelete(false)} disabled={busy}>Keep</Button>
              </span>
            )}
            {failed && <span role="alert" className="tm-err"><Icon name="alert" size={13} />{failed}</span>}
          </div>
        </form>
      </Card>
    </div>
  );
}

export default ScheduleRuleForm;

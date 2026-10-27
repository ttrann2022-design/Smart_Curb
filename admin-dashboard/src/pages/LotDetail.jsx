import { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { ref, onValue, update } from "firebase/database";
import { database } from "../firebase";
import { dataPath, getDataMode } from "../dataMode";
import { c, mono, LED_HEX, LED_COLORS } from "../theme";
import { useAlertSettings, useNow, batteryText, cleanText, formatAgo, formatExact, statusKey, STALL_WORD } from "../units";
import { facilityById } from "../site";
import LotPlan, { StallMark } from "../components/LotPlan";
import { PageHeader, Card, Chips, Button, Field, Input, EmptyState, Notice, StatusText } from "../components/ui";

const BRIGHTNESS_DEBOUNCE_MS = 300;

// Saved LED brightness as a whole percent. Units that don't have one yet show 100.
function brightnessOf(u) {
  const v = u?.ledBrightness;
  return typeof v === "number" && Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : 100;
}

// What the curb's LED panel would show: zone colour, brightness and the panel text.
function LedPreview({ color, text, brightness = 100 }) {
  const hex = LED_HEX[color] || c.dim;
  const glow = 0.15 + 0.85 * (brightness / 100);
  return (
    <div
      role="img"
      aria-label={`Preview: ${color} panel at ${brightness}% brightness showing ${text || "no text"}`}
      style={{
        position: "relative", height: 64, borderRadius: 6, overflow: "hidden",
        background: "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1.4px) 0 0 / 5px 5px, #070706",
        border: `1px solid ${c.lineStrong}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: `inset 0 -3px 0 ${hex}`,
      }}
    >
      <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, background: hex, boxShadow: `0 0 14px ${hex}`, opacity: glow, transition: "opacity var(--dur-base) var(--ease-out)" }} />
      <span aria-hidden="true" style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 6, background: hex, boxShadow: `0 0 14px ${hex}`, opacity: glow, transition: "opacity var(--dur-base) var(--ease-out)" }} />
      <span style={{
        fontFamily: mono, fontWeight: 700, fontSize: text && text.length > 12 ? 15 : 19, letterSpacing: 2,
        color: text ? "#FFF6D8" : c.faint, textShadow: text ? `0 0 6px ${hex}, 0 0 14px ${hex}` : "none",
        padding: "0 18px", whiteSpace: "nowrap", overflow: "hidden", opacity: text ? glow : 1, transition: "opacity var(--dur-base) var(--ease-out)",
      }}>
        {text || "NO TEXT"}
      </span>
    </div>
  );
}

function InfoRow({ label, value, title }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-3)", fontSize: "var(--fs-body)" }}>
      <dt style={{ color: c.dim }}>{label}</dt>
      <dd title={title} style={{ fontWeight: 600, margin: 0, textAlign: "right" }}>{value}</dd>
    </div>
  );
}

function LotDetail() {
  const [lots, setLots] = useState({});
  const [units, setUnits] = useState({});
  const [selectedLot, setSelectedLot] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [ledColor, setLedColor] = useState("blue");
  const [panelText, setPanelText] = useState("");
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  // Brightness being dragged or waiting to be written; null shows the saved value.
  const [brightnessDraft, setBrightnessDraft] = useState(null);
  // { timer, id, path, value, sim }: the path is fixed when the change is made, so a
  // write that lands after switching mode or curb still goes where it was meant to.
  const pendingBrightness = useRef(null);
  const panelRef = useRef(null);
  const { role, mode, siteConfig } = useOutletContext();
  // The facility type chosen in Setup supplies a label and panel text per zone colour.
  const zones = facilityById(siteConfig.site?.facilityType)?.zones;
  const now = useNow();
  const alertSettings = useAlertSettings();
  const canEdit = role === "operator" || role === "manager";
  // ?lot=<id> (e.g. from an Overview lot row) picks the lot on arrival.
  const [params, setParams] = useSearchParams();
  const requestedLot = useRef(params.get("lot"));

  useEffect(() => {
    const stopLots = onValue(ref(database, dataPath("lots")), (snap) => {
      const data = snap.val() || {};
      setLots(data);
      const wanted = requestedLot.current;
      setSelectedLot((prev) => (prev && data[prev] ? prev : wanted && data[wanted] ? wanted : Object.keys(data)[0] || null));
    });
    const stopUnits = onValue(ref(database, dataPath("units")), (snap) => setUnits(snap.val() || {}));
    return () => { stopLots(); stopUnits(); };
  }, []);

  const lotUnits = Object.entries(units)
    .filter(([, u]) => u.lot === selectedLot)
    .sort(([a], [b]) => a.localeCompare(b));
  const unit = selectedUnit ? units[selectedUnit] : null;
  const savedColor = cleanText(unit?.ledColor) || "blue";
  const savedText = unit?.panelText || "";
  const savedBrightness = brightnessOf(unit);
  const brightness = brightnessDraft ?? savedBrightness;
  const dirty = !!unit && (ledColor !== savedColor || panelText.trim() !== savedText);

  // Brightness writes on its own (not through Apply), once the slider settles:
  // on release, or BRIGHTNESS_DEBOUNCE_MS after the last arrow key.
  const writeBrightness = useCallback(async () => {
    const p = pendingBrightness.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendingBrightness.current = null;
    try {
      await update(ref(database, p.path), { ledBrightness: p.value });
      setStatus({
        ok: true,
        text: p.sim
          ? `${p.id} brightness set to ${p.value}% in the simulation.`
          : `${p.id} brightness set to ${p.value}%. LED control isn't connected to the curb hardware yet, so the physical panel won't change.`,
      });
    } catch (err) {
      setStatus({ ok: false, text: err.code === "PERMISSION_DENIED" ? "You don't have permission to change this curb." : "Couldn't save brightness: " + err.message });
    }
    if (!pendingBrightness.current) setBrightnessDraft(null);
  }, []);

  // Leaving the page (or switching Live/Simulation remounts it): send what's pending.
  useEffect(() => () => { writeBrightness(); }, [writeBrightness]);

  const changeBrightness = (value) => {
    if (!canEdit || !selectedUnit) return;
    setBrightnessDraft(value);
    setStatus(null);
    clearTimeout(pendingBrightness.current?.timer);
    pendingBrightness.current = {
      id: selectedUnit,
      path: dataPath(`units/${selectedUnit}`),
      value,
      sim: getDataMode() === "sim",
      timer: setTimeout(writeBrightness, BRIGHTNESS_DEBOUNCE_MS),
    };
  };

  const pickLot = (id) => {
    writeBrightness();
    setBrightnessDraft(null);
    setSelectedLot(id);
    setSelectedUnit(null);
    setStatus(null);
    setParams({ lot: id }, { replace: true });
  };

  const pickUnit = (id) => {
    if (id !== selectedUnit) {
      writeBrightness();
      setBrightnessDraft(null);
    }
    setSelectedUnit(id);
    setLedColor(cleanText(units[id]?.ledColor) || "blue");
    setPanelText(units[id]?.panelText || "");
    setStatus(null);
  };

  // Picking a curb in the plan. Under 900px the curb panel stacks below the plan,
  // so bring it into view (instantly when reduced motion is on). The next frame
  // runs after React has rendered the new curb's panel.
  const selectCurb = (id) => {
    pickUnit(id);
    if (!window.matchMedia("(max-width: 900px)").matches) return;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior, block: "start" }));
  };

  // Zone colour is a radio group: arrow keys move the choice, like native radios.
  const onZoneKey = (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = (LED_COLORS.indexOf(ledColor) + step + LED_COLORS.length) % LED_COLORS.length;
    setLedColor(LED_COLORS[i]);
    setStatus(null);
    e.currentTarget.querySelectorAll("[role=radio]")[i]?.focus();
  };

  const applyChanges = async () => {
    if (!selectedUnit || !canEdit || !dirty) return;
    setSaving(true);
    try {
      await update(ref(database, dataPath(`units/${selectedUnit}`)), { ledColor, panelText: panelText.trim() });
      // Real curbs can't receive LED commands yet (Node 2 isn't built), so don't promise it.
      setStatus({
        ok: true,
        text: getDataMode() === "sim"
          ? "Saved to the simulation."
          : "Saved. LED control isn't connected to the curb hardware yet, so the physical panel won't change.",
      });
    } catch (err) {
      setStatus({ ok: false, text: err.code === "PERMISSION_DENIED" ? "You don't have permission to change this curb." : "Couldn't save: " + err.message });
    }
    setSaving(false);
  };

  return (
    <>
      <PageHeader title="Parking lots" subtitle="Pick a lot, then a curb to see its status and control its LED panel" />

      <div className="sws-page-body">
        <div className="sws-enter">
          {Object.keys(lots).length > 0 ? (
            <Chips label="Parking lot" options={Object.entries(lots).map(([id, lot]) => ({ id, label: lot.name }))} value={selectedLot} onChange={pickLot} />
          ) : (
            <Card><EmptyState icon="lots" title="No lots yet">{mode === "sim" ? "Load simulated data from the Simulation page." : "Lots appear here once they're added to the database."}</EmptyState></Card>
          )}
        </div>

        {selectedLot && (
          <div className="sws-stack" style={{ display: "flex", gap: "var(--sp-7)", alignItems: "flex-start" }}>
            {lotUnits.length === 0 ? (
              <Card delay={60} style={{ flex: "0 1 560px" }}>
                <EmptyState icon="units" title="No curbs in this lot">Curbs appear here once they're registered to this lot.</EmptyState>
              </Card>
            ) : (
              <div style={{ flex: "0 1 560px", minWidth: 0 }}>
                {/* 560px fits a 14-stall row, so the curb panel sits right beside the plan.
                    Keyed by lot so a newly picked lot enters like on the Overview. */}
                <LotPlan
                  key={selectedLot}
                  name={lots[selectedLot]?.name || selectedLot}
                  units={lotUnits}
                  alerts={alertSettings}
                  now={now}
                  selected={selectedUnit}
                  onSelect={selectCurb}
                />
              </div>
            )}

            <Card delay={120} style={{ width: 340, flexShrink: 0 }}>
              {!unit ? (
                <EmptyState icon="units" title="No curb selected">Select a curb to see its status and control its LED panel.</EmptyState>
              ) : (
                // scroll-margin clears the sticky top bar and Simulation banner on phones.
                <div ref={panelRef} key={selectedUnit} className="sws-enter" style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)", scrollMarginTop: 120 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-3)" }}>
                    <h2 style={{ fontFamily: mono, fontSize: 17, fontWeight: 600, margin: 0 }}>Curb <span translate="no">{selectedUnit}</span></h2>
                    <span className="sws-pill">
                      <StallMark status={statusKey(unit)} swatch />
                      {STALL_WORD[statusKey(unit)]}
                    </span>
                  </div>
                  <dl style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)", margin: 0 }}>
                    <InfoRow label="Online" value={unit.online ? "Yes" : "No"} />
                    <InfoRow label="Battery" value={batteryText(unit)} />
                    <InfoRow label="Last change" value={formatAgo(unit.lastUpdated, now) || "—"} title={formatExact(unit.lastUpdated)} />
                    <InfoRow label="Current LED" value={cleanText(unit.ledColor) || "Not set"} />
                    <InfoRow label="Brightness" value={`${savedBrightness}%`} />
                    <InfoRow label="Current text" value={unit.panelText || "Not set"} />
                  </dl>

                  <div style={{ borderTop: `1px solid ${c.line}`, paddingTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <h3 className="sws-card-title" style={{ margin: 0 }}>LED panel control</h3>
                      {dirty && canEdit && <span className="sws-badge" style={{ background: c.warnBg, color: c.warn }}>UNSAVED</span>}
                    </div>

                    <LedPreview color={ledColor} text={panelText.trim()} brightness={brightness} />

                    {!canEdit && <Notice tone="info" icon="lock">Viewers can see LED settings. Operators and managers can change them.</Notice>}

                    <fieldset disabled={!canEdit} style={{ border: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
                      <div className="sws-field">
                        <span className="sws-field-label" id="zone-colour">Zone colour</span>
                        <div role="radiogroup" aria-labelledby="zone-colour" onKeyDown={onZoneKey} style={{ display: "flex", gap: "var(--sp-2)" }}>
                          {LED_COLORS.map((name) => (
                            <button
                              key={name}
                              type="button"
                              role="radio"
                              aria-checked={ledColor === name}
                              tabIndex={ledColor === name ? 0 : -1}
                              aria-label={zones ? `${name}, ${zones[name].label}` : name}
                              title={zones ? `${name}: ${zones[name].label}` : name}
                              onClick={() => { setLedColor(name); setStatus(null); }}
                              style={{
                                flex: 1, height: 38, borderRadius: 5, background: LED_HEX[name],
                                cursor: canEdit ? "pointer" : "not-allowed", opacity: canEdit || ledColor === name ? 1 : 0.35,
                                border: `1px solid ${c.line}`,
                                boxShadow: ledColor === name ? `0 0 0 2px ${c.panel}, 0 0 0 4px ${c.text}` : "none",
                              }}
                            />
                          ))}
                        </div>
                      </div>

                      {zones && (
                        <div className="sws-field">
                          <span className="sws-field-label" id="zone-presets">Zone presets</span>
                          <div className="sws-chips" role="group" aria-labelledby="zone-presets">
                            {LED_COLORS.map((name) => (
                              <button
                                key={name}
                                type="button"
                                className="sws-chip"
                                aria-pressed={ledColor === name && panelText.trim() === zones[name].text}
                                title={`${name} zone, panel text ${zones[name].text}`}
                                onClick={() => { setLedColor(name); setPanelText(zones[name].text); setStatus(null); }}
                              >
                                <span className="sws-dot" style={{ background: LED_HEX[name] }} aria-hidden="true" />
                                {zones[name].label}
                              </button>
                            ))}
                          </div>
                          <span className="sws-field-hint">Sets the zone colour and panel text together. Apply to save.</span>
                        </div>
                      )}

                      <Field label="Brightness" hint={canEdit ? "Saves when you let go of the slider." : null}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <input
                            type="range"
                            className="sws-range"
                            min={0}
                            max={100}
                            step={1}
                            value={brightness}
                            aria-valuetext={`${brightness}%`}
                            onChange={(e) => changeBrightness(Number(e.target.value))}
                            onPointerUp={writeBrightness}
                            onBlur={writeBrightness}
                          />
                          <span aria-hidden="true" style={{ fontFamily: mono, fontSize: 13, fontWeight: 600, width: 42, textAlign: "right" }}>{brightness}%</span>
                        </div>
                      </Field>

                      <Field label="Panel text" hint={`${panelText.length} of 16 characters`}>
                        <Input
                          value={panelText}
                          maxLength={16}
                          onChange={(e) => { setPanelText(e.target.value.toUpperCase()); setStatus(null); }}
                          placeholder="e.g. BLUE PERMIT"
                          style={{ fontFamily: mono, letterSpacing: 1 }}
                        />
                      </Field>
                    </fieldset>

                    {canEdit && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <Button variant="primary" onClick={applyChanges} disabled={!dirty || saving} busy={saving} style={{ flex: 1, height: 44 }}>
                          {saving ? "Saving…" : dirty ? "Apply changes" : "No changes to apply"}
                        </Button>
                        {dirty && <Button onClick={() => pickUnit(selectedUnit)} style={{ height: 44 }}>Discard</Button>}
                      </div>
                    )}

                    <StatusText msg={status} />
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </>
  );
}

export default LotDetail;

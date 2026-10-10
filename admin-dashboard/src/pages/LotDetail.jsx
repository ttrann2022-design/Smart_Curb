import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { ref, onValue, update } from "firebase/database";
import { database } from "../firebase";
import { dataPath, getDataMode } from "../dataMode";
import { c, mono, LED_HEX, LED_COLORS } from "../theme";
import { useFlash } from "../motion";
import { useNow, batteryText, cleanText, formatAgo, formatExact, statusKey } from "../units";
import { PageHeader, Card, Chips, Button, Field, Input, StatusPill, EmptyState, Notice, StatusText } from "../components/ui";

function unitTone(u) {
  if (!u.online) return { bg: "#1F1F1B", border: "#3A3A32", text: c.dim };
  if (u.occupied) return { bg: "#2A1713", border: c.busy, text: c.busyText };
  return { bg: c.openBg, border: c.open, text: c.openText };
}

function CurbTile({ id, unit, selected, onPick }) {
  const tone = unitTone(unit);
  const status = statusKey(unit);
  const flash = useFlash(status);
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      aria-label={`Curb ${id}, ${status}`}
      className={`sws-tile${flash ? " sws-flash" : ""}`}
      style={{
        height: 56, borderRadius: 5, cursor: "pointer", fontFamily: mono, fontSize: 12, fontWeight: 600,
        background: tone.bg, color: tone.text, border: `1px solid ${tone.border}`,
        boxShadow: selected ? `0 0 0 2px ${c.bg}, 0 0 0 4px ${c.accent}` : "none",
      }}
    >
      {id}
    </button>
  );
}

// What the curb's LED panel would show: zone colour plus the panel text.
function LedPreview({ color, text }) {
  const hex = LED_HEX[color] || c.dim;
  return (
    <div
      role="img"
      aria-label={`Preview: ${color} panel showing ${text || "no text"}`}
      style={{
        position: "relative", height: 64, borderRadius: 6, overflow: "hidden",
        background: "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1.4px) 0 0 / 5px 5px, #070706",
        border: `1px solid ${c.lineStrong}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "box-shadow 0.3s",
        boxShadow: `inset 0 -3px 0 ${hex}`,
      }}
    >
      <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, background: hex, boxShadow: `0 0 14px ${hex}`, transition: "background-color 0.3s" }} />
      <span aria-hidden="true" style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 6, background: hex, boxShadow: `0 0 14px ${hex}`, transition: "background-color 0.3s" }} />
      <span style={{
        fontFamily: mono, fontWeight: 700, fontSize: text && text.length > 12 ? 15 : 19, letterSpacing: 2,
        color: text ? "#FFF6D8" : c.faint, textShadow: text ? `0 0 6px ${hex}, 0 0 14px ${hex}` : "none",
        padding: "0 18px", whiteSpace: "nowrap", overflow: "hidden",
      }}>
        {text || "NO TEXT"}
      </span>
    </div>
  );
}

function InfoRow({ label, value, title }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5 }}>
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
  const { role, mode } = useOutletContext();
  const now = useNow();
  const canEdit = role === "operator" || role === "manager";

  useEffect(() => {
    const stopLots = onValue(ref(database, dataPath("lots")), (snap) => {
      const data = snap.val() || {};
      setLots(data);
      setSelectedLot((prev) => (prev && data[prev] ? prev : Object.keys(data)[0] || null));
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
  const dirty = !!unit && (ledColor !== savedColor || panelText.trim() !== savedText);
  const lotCounts = lotUnits.reduce((s, [, u]) => {
    s[statusKey(u)] += 1;
    return s;
  }, { open: 0, occupied: 0, offline: 0 });

  const pickLot = (id) => {
    setSelectedLot(id);
    setSelectedUnit(null);
    setStatus(null);
  };

  const pickUnit = (id) => {
    setSelectedUnit(id);
    setLedColor(cleanText(units[id]?.ledColor) || "blue");
    setPanelText(units[id]?.panelText || "");
    setStatus(null);
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
          <div className="sws-stack" style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            <Card
              title="Curb units"
              meta={lotUnits.length ? `${lotCounts.open} open · ${lotCounts.occupied} occupied${lotCounts.offline ? ` · ${lotCounts.offline} offline` : ""}` : null}
              delay={60}
              style={{ flex: 1 }}
            >
              {lotUnits.length === 0 ? (
                <EmptyState icon="units" title="No curbs in this lot">Curbs appear here once they're registered to this lot.</EmptyState>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
                  {lotUnits.map(([id, u]) => (
                    <CurbTile key={id} id={id} unit={u} selected={id === selectedUnit} onPick={() => pickUnit(id)} />
                  ))}
                </div>
              )}
            </Card>

            <Card delay={120} style={{ width: 340, flexShrink: 0 }}>
              {!unit ? (
                <EmptyState icon="units" title="No curb selected">Select a curb to see its status and control its LED panel.</EmptyState>
              ) : (
                <div key={selectedUnit} className="sws-enter" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <h2 style={{ fontFamily: mono, fontSize: 17, fontWeight: 600, margin: 0 }}>Curb {selectedUnit}</h2>
                    <StatusPill status={statusKey(unit)} />
                  </div>
                  <dl style={{ display: "flex", flexDirection: "column", gap: 8, margin: 0 }}>
                    <InfoRow label="Online" value={unit.online ? "Yes" : "No"} />
                    <InfoRow label="Battery" value={batteryText(unit)} />
                    <InfoRow label="Last change" value={formatAgo(unit.lastUpdated, now) || "—"} title={formatExact(unit.lastUpdated)} />
                    <InfoRow label="Current LED" value={cleanText(unit.ledColor) || "Not set"} />
                    <InfoRow label="Current text" value={unit.panelText || "Not set"} />
                  </dl>

                  <div style={{ borderTop: `1px solid ${c.line}`, paddingTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <h3 className="sws-card-title" style={{ margin: 0 }}>LED panel control</h3>
                      {dirty && canEdit && <span className="sws-badge" style={{ background: c.warnBg, color: c.warn }}>UNSAVED</span>}
                    </div>

                    <LedPreview color={ledColor} text={panelText.trim()} />

                    {!canEdit && <Notice tone="info" icon="lock">Viewers can see LED settings. Operators and managers can change them.</Notice>}

                    <fieldset disabled={!canEdit} style={{ border: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
                      <div className="sws-field">
                        <span className="sws-field-label" id="zone-colour">Zone colour</span>
                        <div role="radiogroup" aria-labelledby="zone-colour" style={{ display: "flex", gap: 8 }}>
                          {LED_COLORS.map((name) => (
                            <button
                              key={name}
                              type="button"
                              role="radio"
                              aria-checked={ledColor === name}
                              aria-label={name}
                              title={name}
                              onClick={() => { setLedColor(name); setStatus(null); }}
                              style={{
                                flex: 1, height: 38, borderRadius: 5, background: LED_HEX[name],
                                cursor: canEdit ? "pointer" : "not-allowed", opacity: canEdit || ledColor === name ? 1 : 0.35,
                                border: `1px solid ${c.line}`,
                                boxShadow: ledColor === name ? `0 0 0 2px ${c.panel}, 0 0 0 4px ${c.accent}` : "none",
                                transition: "box-shadow 0.15s",
                              }}
                            />
                          ))}
                        </div>
                      </div>

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

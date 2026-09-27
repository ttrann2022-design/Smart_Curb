import { useEffect, useState } from "react";
import { ref, onValue, update } from "firebase/database";
import { database } from "../firebase";
import { c, mono } from "../theme";

const ledColors = [
  { name: "red", hex: "#E5483A" },
  { name: "blue", hex: "#3B7DD8" },
  { name: "green", hex: "#35A96B" },
  { name: "gold", hex: "#E0A63C" },
  { name: "white", hex: "#E8E6DE" },
];

function unitTone(u) {
  if (!u.online) return { bg: "#1F1F1B", border: "#3A3A32", text: c.dim };
  if (u.occupied) return { bg: "#2A1713", border: c.busy, text: "#FF8F74" };
  return { bg: "#1C2612", border: c.open, text: "#B4E86A" };
}

function LotDetail() {
  const [lots, setLots] = useState({});
  const [units, setUnits] = useState({});
  const [selectedLot, setSelectedLot] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [ledColor, setLedColor] = useState("blue");
  const [panelText, setPanelText] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const stopLots = onValue(ref(database, "lots"), (snap) => {
      const data = snap.val() || {};
      setLots(data);
      setSelectedLot((prev) => prev || Object.keys(data)[0] || null);
    });
    const stopUnits = onValue(ref(database, "units"), (snap) => setUnits(snap.val() || {}));
    return () => { stopLots(); stopUnits(); };
  }, []);

  const lotUnits = Object.entries(units).filter(([, u]) => u.lot === selectedLot);
  const unit = selectedUnit ? units[selectedUnit] : null;

  const pickLot = (id) => {
    setSelectedLot(id);
    setSelectedUnit(null);
    setStatus("");
  };

  const pickUnit = (id) => {
    setSelectedUnit(id);
    setLedColor(units[id]?.ledColor || "blue");
    setPanelText(units[id]?.panelText || "");
    setStatus("");
  };

  const applyChanges = async () => {
    if (!selectedUnit) return;
    try {
      await update(ref(database, `units/${selectedUnit}`), { ledColor, panelText });
      setStatus("Saved. The curb picks this up on its next sync.");
    } catch (err) {
      setStatus("Could not save: " + err.message);
    }
  };

  const infoRow = (label, value) => (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
      <span style={{ color: c.dim }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );

  return (
    <>
      <div style={{ height: 68, flexShrink: 0, background: c.panel, borderBottom: `1px solid ${c.line}`, padding: "0 30px", display: "flex", alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 19, fontWeight: 600 }}>Parking lots</div>
          <div style={{ fontSize: 12.5, color: c.dim }}>Pick a lot, then a curb unit to control it</div>
        </div>
      </div>

      <div style={{ padding: "22px 30px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.entries(lots).map(([id, lot]) => (
            <button
              key={id}
              onClick={() => pickLot(id)}
              style={{
                height: 34, padding: "0 14px", borderRadius: 5, cursor: "pointer", fontSize: 13, fontWeight: 600,
                border: `1px solid ${id === selectedLot ? c.accent : c.line}`,
                background: id === selectedLot ? c.navBg : c.panel,
                color: id === selectedLot ? c.accent : c.text,
              }}
            >
              {lot.name}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ flex: 1, background: c.panel, border: `1px solid ${c.line}`, borderRadius: 6, padding: 18 }}>
            <div style={{ fontFamily: mono, fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Curb units</div>
            {lotUnits.length === 0 ? (
              <div style={{ fontSize: 12.5, color: c.dim }}>No units registered in this lot yet.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
                {lotUnits.map(([id, u]) => {
                  const tone = unitTone(u);
                  const isSelected = id === selectedUnit;
                  return (
                    <button
                      key={id}
                      onClick={() => pickUnit(id)}
                      style={{
                        height: 56, borderRadius: 5, cursor: "pointer", fontFamily: mono, fontSize: 12, fontWeight: 700,
                        background: tone.bg, color: tone.text,
                        border: isSelected ? `2px solid ${c.accent}` : `1px solid ${tone.border}`,
                      }}
                    >
                      {id}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ width: 340, background: c.panel, border: `1px solid ${c.line}`, borderRadius: 6, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            {!unit ? (
              <div style={{ fontSize: 12.5, color: c.dim }}>Select a curb unit to see its status and control its LED panel.</div>
            ) : (
              <>
                <div style={{ fontFamily: mono, fontSize: 17, fontWeight: 600 }}>Curb {selectedUnit}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {infoRow("Status", unit.occupied ? "Occupied" : "Open")}
                  {infoRow("Online", unit.online ? "Yes" : "No")}
                  {infoRow("Battery", `${unit.battery}%`)}
                  {infoRow("Current LED", unit.ledColor || "not set")}
                  {infoRow("Current text", unit.panelText || "not set")}
                </div>

                <div style={{ borderTop: `1px solid ${c.line}`, paddingTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontFamily: mono, fontSize: 14, fontWeight: 600 }}>LED panel control</div>

                  <div style={{ fontSize: 11.5, fontWeight: 600, color: c.dim }}>Zone colour</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {ledColors.map((col) => (
                      <button
                        key={col.name}
                        onClick={() => setLedColor(col.name)}
                        aria-label={`Set colour to ${col.name}`}
                        style={{
                          flex: 1, height: 40, borderRadius: 5, cursor: "pointer", background: col.hex,
                          border: ledColor === col.name ? `3px solid ${c.accent}` : `1px solid ${c.line}`,
                        }}
                      />
                    ))}
                  </div>

                  <div style={{ fontSize: 11.5, fontWeight: 600, color: c.dim }}>Panel text</div>
                  <input
                    value={panelText}
                    maxLength={16}
                    onChange={(e) => setPanelText(e.target.value.toUpperCase())}
                    placeholder="e.g. BLUE PERMIT"
                    style={{ height: 42, padding: "0 12px", borderRadius: 5, border: `1px solid ${c.line}`, background: c.bg, color: c.text, fontFamily: mono, fontSize: 14, letterSpacing: 1 }}
                  />

                  <button
                    onClick={applyChanges}
                    style={{ height: 44, borderRadius: 5, border: "none", background: c.accent, color: c.onAccent, fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}
                  >
                    Apply changes
                  </button>

                  {status && <div style={{ fontSize: 12, color: c.dim }}>{status}</div>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default LotDetail;
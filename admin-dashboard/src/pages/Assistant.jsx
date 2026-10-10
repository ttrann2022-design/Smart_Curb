import { useEffect, useRef, useState } from "react";
import { ref, onValue } from "firebase/database";
import { database, dataPath } from "../firebase";
import { c, mono } from "../theme";
import { useAlertSettings, batteryText, isLowBattery, cleanText } from "../units";

const suggestions = [
  "Where should I park right now?",
  "Which lot is the busiest?",
  "How many spots are open in Lot 20?",
  "Any curbs with low battery?",
  "What needs attention?",
];

const HELP = "I can answer questions like:\n• Where should I park right now?\n• Which lot is the busiest?\n• How many spots are open in Lot 12?\n• Which curbs have low battery?\n• Which curbs are offline?\n• What's the status of C-012?\n• What needs attention?";

function lotMain(name) {
  return (name || "").split(" — ")[0];
}

function buildStats(lots, units) {
  return Object.entries(lots).map(([id, lot]) => {
    const list = Object.values(units).filter((u) => u.lot === id);
    const total = list.length;
    const open = list.filter((u) => u.online && !u.occupied).length;
    return { id, name: lot.name, short: lotMain(lot.name), total, open, pct: total ? Math.round(((total - open) / total) * 100) : 0 };
  });
}

function findLot(q, stats) {
  const compact = q.replace(/\s+/g, "");
  return stats.find((s) => {
    const short = s.short.toLowerCase();
    if (!short) return false;
    if (q.includes(short) || compact.includes(short.replace(/\s+/g, ""))) return true;
    if (short.startsWith("garage") && /\bgarage\b/.test(q)) return true;
    return false;
  });
}

function answer(raw, lots, units, alerts) {
  const q = raw.toLowerCase().trim();
  const stats = buildStats(lots, units);
  const entries = Object.entries(units);
  if (stats.length === 0) return "I don't see any lots in the database yet.";

  const unitMatch = q.match(/\bc-?(\d{1,3})\b/);
  if (unitMatch) {
    const id = "C-" + unitMatch[1].padStart(3, "0");
    const u = units[id];
    if (!u) return `I couldn't find a curb called ${id}.`;
    const status = !u.online ? "offline" : u.occupied ? "occupied" : "open";
    const color = cleanText(u.ledColor);
    const led = color ? `${color}${u.panelText ? `, showing "${u.panelText}"` : ""}` : "not set";
    return `Curb ${id} is in ${lots[u.lot]?.name || u.lot}.\nStatus: ${status}\nBattery: ${batteryText(u)}\nLED: ${led}`;
  }

  if (/(battery|charge|charging|power)/.test(q)) {
    const low = entries.filter(([, u]) => isLowBattery(u, alerts)).sort(([, a], [, b]) => a.battery - b.battery);
    if (low.length === 0) return `No curbs are low on battery. Every measured unit is at ${alerts.lowBattery}% or above.`;
    return `${low.length} curb${low.length > 1 ? "s are" : " is"} low on battery:\n` +
      low.map(([id, u]) => `• ${id} in ${lotMain(lots[u.lot]?.name)}: ${u.battery}%`).join("\n");
  }

  if (/(offline|not reporting|disconnected|down)/.test(q)) {
    const off = entries.filter(([, u]) => !u.online);
    if (off.length === 0) return "Every curb is online and reporting.";
    return `${off.length} curb${off.length > 1 ? "s are" : " is"} offline:\n` +
      off.map(([id, u]) => `• ${id} in ${lotMain(lots[u.lot]?.name)}`).join("\n");
  }

  if (/(attention|problem|issue|alert|wrong|broken)/.test(q)) {
    const off = entries.filter(([, u]) => !u.online);
    const low = entries.filter(([, u]) => u.online && isLowBattery(u, alerts));
    if (off.length === 0 && low.length === 0) return "Nothing needs attention right now. All curbs are online with healthy batteries.";
    const lines = [
      ...off.map(([id, u]) => `• ${id} in ${lotMain(lots[u.lot]?.name)} is offline`),
      ...low.map(([id, u]) => `• ${id} in ${lotMain(lots[u.lot]?.name)} is at ${u.battery}% battery`),
    ];
    return `${lines.length} thing${lines.length > 1 ? "s need" : " needs"} attention:\n` + lines.join("\n");
  }

  const lot = findLot(q, stats);
  if (lot) {
    if (lot.total === 0) return `${lot.name} doesn't have any curbs reporting yet.`;
    if (lot.open === 0) return `${lot.name} is full right now. All ${lot.total} spots are taken.`;
    return `${lot.name} has ${lot.open} of ${lot.total} spots open (${lot.pct}% full).`;
  }

  if (/(busiest|fullest|full|least|crowded|worst)/.test(q)) {
    const worst = [...stats].sort((a, b) => b.pct - a.pct)[0];
    return `${worst.name} is the busiest at ${worst.pct}% full, with ${worst.open} spot${worst.open === 1 ? "" : "s"} left.`;
  }

  if (/(most|best|emptiest|where should|recommend|park)/.test(q)) {
    const best = [...stats].sort((a, b) => b.open - a.open)[0];
    if (best.open === 0) return "Every lot is full right now.";
    return `${best.name} has the most space right now, with ${best.open} open spot${best.open === 1 ? "" : "s"}.`;
  }

  if (/(total|overall|everything|how many|open|available|free|spots)/.test(q)) {
    const open = stats.reduce((s, x) => s + x.open, 0);
    const total = stats.reduce((s, x) => s + x.total, 0);
    return `${open} of ${total} spots are open across ${stats.length} lots:\n` +
      stats.map((s) => `• ${s.short}: ${s.open} open`).join("\n");
  }

  if (/(help|what can you|hello|hi\b|hey)/.test(q)) return HELP;

  return "I'm not sure how to answer that yet.\n\n" + HELP;
}

function Assistant() {
  const [messages, setMessages] = useState([
    { from: "bot", text: "Hi! Ask me about lot availability, curb status, batteries, or anything that needs attention. Every answer comes from live data." },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const data = useRef({ lots: {}, units: {} });
  const endRef = useRef(null);
  const alerts = useAlertSettings();

  useEffect(() => {
    const stopLots = onValue(ref(database, dataPath("lots")), (s) => { data.current.lots = s.val() || {}; });
    const stopUnits = onValue(ref(database, dataPath("units")), (s) => { data.current.units = s.val() || {}; });
    return () => { stopLots(); stopUnits(); };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const ask = (text) => {
    const q = text.trim();
    if (!q || thinking) return;
    setMessages((m) => [...m, { from: "user", text: q }]);
    setInput("");
    setThinking(true);
    setTimeout(() => {
      const reply = answer(q, data.current.lots, data.current.units, alerts);
      setMessages((m) => [...m, { from: "bot", text: reply }]);
      setThinking(false);
    }, 450);
  };

  return (
    <>
      <div className="sws-page-head" style={{ height: 68, flexShrink: 0, background: c.panel, borderBottom: `1px solid ${c.line}`, padding: "0 30px", display: "flex", alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 19, fontWeight: 600 }}>Assistant</div>
          <div style={{ fontSize: 12.5, color: c.dim }}>Answers from live data · AI language model integration planned</div>
        </div>
      </div>

      <div className="sws-page-body" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "18px 30px 22px", gap: 14 }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, paddingRight: 4 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.from === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: 560, padding: "11px 15px", fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-line",
                borderRadius: m.from === "user" ? "12px 12px 3px 12px" : "3px 12px 12px 12px",
                background: m.from === "user" ? c.accent : c.panel,
                color: m.from === "user" ? c.onAccent : c.text,
                border: m.from === "user" ? "none" : `1px solid ${c.line}`,
              }}>
                {m.text}
              </div>
            </div>
          ))}
          {thinking && <div style={{ fontSize: 12.5, color: c.dim }}>Checking live data…</div>}
          <div ref={endRef} />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {suggestions.map((s) => (
            <button key={s} onClick={() => ask(s)} style={{ height: 32, padding: "0 12px", borderRadius: 16, border: `1px solid ${c.line}`, background: c.panel, color: c.text, fontSize: 12.5, cursor: "pointer" }}>
              {s}
            </button>
          ))}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); ask(input); }} style={{ display: "flex", gap: 10 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about any lot or curb…"
            style={{ flex: 1, height: 46, padding: "0 14px", borderRadius: 6, border: `1px solid ${c.line}`, background: c.panel, color: c.text, fontSize: 14 }}
          />
          <button type="submit" style={{ height: 46, padding: "0 22px", borderRadius: 6, border: "none", background: c.accent, color: c.onAccent, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
            Ask
          </button>
        </form>
      </div>
    </>
  );
}

export default Assistant;
import { useEffect, useRef, useState } from "react";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";
import { dataPath } from "../dataMode";
import { c } from "../theme";
import Icon from "../components/Icon";
import { PageHeader, Button, Input } from "../components/ui";
import { useAlertSettings, batteryText, isLowBattery, cleanText } from "../units";

// Examples use a lot and a curb that actually exist, so every suggestion gets a real answer.
function suggestionsFor(lotNames, unitIds) {
  return [
    "Where should I park right now?",
    "Which lot is the busiest?",
    lotNames[0] ? `How many spots are open in ${lotNames[0]}?` : "How many spots are open?",
    unitIds[0] ? `What's the status of ${unitIds[0]}?` : "Any curbs with low battery?",
    "What needs attention?",
  ];
}

function helpText(lots, units) {
  const lot = lotMain(Object.values(lots)[0]?.name) || "Lot 12";
  const unit = Object.keys(units).sort()[0] || "C-012";
  return `I can answer questions like:\n• Where should I park right now?\n• Which lot is the busiest?\n• How many spots are open in ${lot}?\n• Which curbs have low battery?\n• Which curbs are offline?\n• What's the status of ${unit}?\n• What needs attention?`;
}

function lotMain(name) {
  return (name || "").split(" — ")[0];
}

// Short lot name for a curb, even when its lot field doesn't match a real lot.
function lotOf(lots, u) {
  return lotMain(lots[u.lot]?.name) || "an unassigned lot";
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
    return `Curb ${id} is in ${lots[u.lot]?.name || "an unassigned lot"}.\nStatus: ${status}\nBattery: ${batteryText(u)}\nLED: ${led}`;
  }

  if (/(battery|charge|charging|power)/.test(q)) {
    const low = entries.filter(([, u]) => isLowBattery(u, alerts)).sort(([, a], [, b]) => a.battery - b.battery);
    if (low.length === 0) return `No curbs are low on battery. Every measured unit is at ${alerts.lowBattery}% or above.`;
    return `${low.length} curb${low.length > 1 ? "s are" : " is"} low on battery:\n` +
      low.map(([id, u]) => `• ${id} in ${lotOf(lots, u)}: ${u.battery}%`).join("\n");
  }

  if (/(offline|not reporting|disconnected|down)/.test(q)) {
    const off = entries.filter(([, u]) => !u.online);
    if (off.length === 0) return "Every curb is online and reporting.";
    return `${off.length} curb${off.length > 1 ? "s are" : " is"} offline:\n` +
      off.map(([id, u]) => `• ${id} in ${lotOf(lots, u)}`).join("\n");
  }

  if (/(attention|problem|issue|alert|wrong|broken)/.test(q)) {
    const off = entries.filter(([, u]) => !u.online);
    const low = entries.filter(([, u]) => u.online && isLowBattery(u, alerts));
    if (off.length === 0 && low.length === 0) return "Nothing needs attention right now. All curbs are online with healthy batteries.";
    const lines = [
      ...off.map(([id, u]) => `• ${id} in ${lotOf(lots, u)} is offline`),
      ...low.map(([id, u]) => `• ${id} in ${lotOf(lots, u)} is at ${u.battery}% battery`),
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

  if (/(help|what can you|hello|hi\b|hey)/.test(q)) return helpText(lots, units);

  return "I'm not sure how to answer that yet.\n\n" + helpText(lots, units);
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
  const [examples, setExamples] = useState({ lots: [], units: [] });

  useEffect(() => {
    const stopLots = onValue(ref(database, dataPath("lots")), (s) => {
      data.current.lots = s.val() || {};
      setExamples((e) => ({ ...e, lots: Object.values(data.current.lots).map((l) => lotMain(l.name)).filter(Boolean) }));
    });
    const stopUnits = onValue(ref(database, dataPath("units")), (s) => {
      data.current.units = s.val() || {};
      setExamples((e) => ({ ...e, units: Object.keys(data.current.units).sort() }));
    });
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
      <PageHeader title="Assistant" subtitle="Answers from live data · AI language model integration planned" />

      <div className="sws-page-body" style={{ flex: 1, minHeight: 0, paddingTop: 18, paddingBottom: 22, gap: 14 }}>
        <div role="log" aria-live="polite" aria-label="Conversation" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, paddingRight: 4 }}>
          {messages.map((m, i) => (
            <div key={i} className="sws-enter" style={{ display: "flex", justifyContent: m.from === "user" ? "flex-end" : "flex-start", gap: 10 }}>
              {m.from === "bot" && (
                <div aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 14, background: c.navBg, color: c.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                  <Icon name="sparkle" size={14} />
                </div>
              )}
              <div style={{
                maxWidth: 560, padding: "11px 15px", fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-line",
                borderRadius: m.from === "user" ? "12px 12px 3px 12px" : "3px 12px 12px 12px",
                background: m.from === "user" ? c.accent : c.panel,
                color: m.from === "user" ? c.onAccent : c.text,
                border: m.from === "user" ? "none" : `1px solid ${c.line}`,
              }}>
                <span className="sws-sr-only">{m.from === "user" ? "You: " : "Assistant: "}</span>
                {m.text}
              </div>
            </div>
          ))}
          {thinking && (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 14, background: c.navBg, color: c.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="sparkle" size={14} />
              </div>
              <div className="sws-typing" role="status" aria-label="Checking live data" style={{ display: "flex", gap: 4, padding: "12px 14px", borderRadius: "3px 12px 12px 12px", background: c.panel, border: `1px solid ${c.line}` }}>
                <span /><span /><span />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="sws-chips" aria-label="Suggested questions">
          {suggestionsFor(examples.lots, examples.units).map((s) => (
            <button key={s} type="button" className="sws-chip" style={{ borderRadius: 16 }} onClick={() => ask(s)} disabled={thinking}>
              {s}
            </button>
          ))}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); ask(input); }} style={{ display: "flex", gap: 10 }}>
          <Input
            size="lg"
            aria-label="Ask a question"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about any lot or curb…"
            style={{ flex: 1, background: c.panel }}
          />
          <Button type="submit" variant="primary" size="lg" icon="send" disabled={!input.trim() || thinking}>Ask</Button>
        </form>
      </div>
    </>
  );
}

export default Assistant;
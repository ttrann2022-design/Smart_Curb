import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";
import { dataPath } from "../dataMode";
import Icon from "../components/Icon";
import { PageHeader, Button, Input } from "../components/ui";
import { useAlertSettings } from "../units";
import { respond, START_CHIPS } from "../assistant";

// Curb IDs (C-041) in a message render in the monospace, kept away from auto-translate.
function withIds(text) {
  return text.split(/\b(C-\d{3})\b/).map((part, i) => (i % 2 ? <span key={i} className="sws-mono" translate="no">{part}</span> : part));
}

function Avatar() {
  return <div aria-hidden="true" className="as-avatar"><Icon name="sparkle" size={14} /></div>;
}

// The same lots and units the dashboard pages read, for the current data mode.
// Reads only: the assistant never writes.
function useCurbData() {
  const [state, setState] = useState({ lots: null, units: null, error: null });
  useEffect(() => {
    const fail = (error) => setState((s) => ({ ...s, error }));
    const stopLots = onValue(ref(database, dataPath("lots")), (s) => setState((p) => ({ ...p, lots: s.val() || {} })), fail);
    const stopUnits = onValue(ref(database, dataPath("units")), (s) => setState((p) => ({ ...p, units: s.val() || {} })), fail);
    return () => { stopLots(); stopUnits(); };
  }, []);
  return state;
}

// The assistant's reply at the moment it's asked. Status answers need the data,
// so while it loads (or if it can't be read) they say so instead of reporting an empty site.
function replyTo(q, data, { alerts, mode, role }) {
  const reply = respond(q, { lots: data.lots || {}, units: data.units || {}, alerts, now: Date.now(), mode, role });
  if (reply.group === "status" && (data.error || !data.lots || !data.units)) {
    reply.text = data.error
      ? "I couldn't read the curb data, so I can't answer that right now. Reload the page to try again."
      : "I'm still loading the curb data. Ask again in a moment.";
  }
  return reply;
}

function Assistant() {
  const { role, mode } = useOutletContext();
  const alerts = useAlertSettings();
  const data = useCurbData();
  const sim = mode === "sim";
  const [messages, setMessages] = useState(() => [{
    from: "bot",
    text: `Hi! I answer questions about the lots and curbs from ${sim ? "the simulated" : "live"} data, and explain how to use this dashboard. I follow fixed rules and only read: I never change anything.`,
    chips: START_CHIPS,
  }]);
  const [input, setInput] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  }, [messages]);

  const ask = (raw) => {
    const q = raw.trim();
    if (!q) return;
    const reply = replyTo(q, data, { alerts, mode, role });
    setMessages((m) => [...m, { from: "user", text: q }, { from: "bot", text: reply.text, chips: reply.chips }]);
    setInput("");
  };

  const chips = [...messages].reverse().find((m) => m.chips)?.chips || START_CHIPS;

  return (
    <>
      <PageHeader
        title="Assistant"
        subtitle={`Answers from ${sim ? "simulated" : "live"} data with fixed rules · reads only, never changes anything`}
      />

      <div className="sws-page-body as-body">
        <div role="log" aria-live="polite" aria-label="Conversation" className="as-log">
          <div className="as-col">
            {messages.map((m, i) => (
              <div key={i} className={`as-msg${m.from === "user" ? " is-user" : ""}`}>
                {m.from === "bot" && <Avatar />}
                <div className="as-bubble">
                  <span className="sws-sr-only">{m.from === "user" ? "You: " : "Assistant: "}</span>
                  {withIds(m.text)}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        </div>

        <div className="sws-chips as-suggest as-col" role="group" aria-label="Suggested questions">
          {chips.map((s) => (
            <button key={s} type="button" className="sws-chip" onClick={() => ask(s)}>{s}</button>
          ))}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="as-form as-col">
          <Input
            size="lg"
            aria-label="Ask a question"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about a lot, a curb, or how to do something…"
            maxLength={300}
          />
          <Button type="submit" variant="primary" size="lg" icon="send" disabled={!input.trim()}>Ask</Button>
        </form>
      </div>
    </>
  );
}

export default Assistant;

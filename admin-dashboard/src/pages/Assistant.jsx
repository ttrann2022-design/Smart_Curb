import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { ref, onValue, query, limitToLast } from "firebase/database";
import { auth, database } from "../firebase";
import { dataPath } from "../dataMode";
import { PageHeader, Button, Input } from "../components/ui";
import { useAlertSettings } from "../units";
import { respond, welcome } from "../assistant";
import logo from "../assets/smartcurb-logo.jpg";

// Curb IDs (C-041) in a message render in the monospace, kept away from auto-translate.
function withIds(text) {
  return text.split(/\b(C-\d{3})\b/).map((part, i) => (i % 2 ? <span key={i} className="sws-mono" translate="no">{part}</span> : part));
}

function Avatar() {
  return <div aria-hidden="true" className="as-avatar"><img src={logo} alt="" /></div>;
}

// A first name for the greeting: the account's display name, or the start of an
// email like "dana.whitaker@…". Shared inboxes ("admin@", "ops@") get no name.
const GENERIC = new Set(["admin", "mgr", "manager", "info", "ops", "staff", "test", "user", "demo", "support", "office", "parking", "hello", "contact", "team", "it", "desk", "frontdesk", "noreply", "security", "facilities", "operator", "viewer"]);
function firstName(user) {
  const display = user?.displayName?.trim().split(/\s+/)[0];
  if (display) return display;
  const part = (user?.email || "").split("@")[0].split(/[._+\-\d]/)[0];
  if (!/^[a-z]{2,20}$/i.test(part) || GENERIC.has(part.toLowerCase())) return null;
  return part[0].toUpperCase() + part.slice(1).toLowerCase();
}

// The same lots, units and history the dashboard pages read, for the current data mode.
// Reads only: the assistant never writes.
function useAssistantData() {
  const [state, setState] = useState({ lots: null, units: null, week: null, live: null, error: null });
  useEffect(() => {
    const fail = (error) => setState((s) => ({ ...s, error }));
    const on = (r, key) => onValue(r, (s) => setState((p) => ({ ...p, [key]: s.val() || {} })), key === "week" || key === "live" ? () => {} : fail);
    const stops = [
      on(ref(database, dataPath("lots")), "lots"),
      on(ref(database, dataPath("units")), "units"),
      on(ref(database, dataPath("history/week")), "week"),
      on(query(ref(database, dataPath("history/live")), limitToLast(60)), "live"),
    ];
    return () => stops.forEach((stop) => stop());
  }, []);
  return state;
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The assistant's reply at the moment it's asked. Status answers need the data,
// so while it loads (or if it can't be read) they say so instead of reporting an empty site.
function replyTo(q, data, base, conversation) {
  const ctx = { ...base, lots: data.lots || {}, units: data.units || {}, history: { week: data.week, live: data.live }, now: Date.now() };
  const reply = respond(q, ctx, conversation);
  if (reply.group === "status" && (data.error || !data.lots || !data.units)) {
    reply.text = data.error
      ? "I couldn't read the curb data, so I can't answer that right now. Reload the page to try again."
      : "I'm still loading the curb data. Ask again in a moment.";
  }
  return reply;
}

function greetingFor(base) {
  return { from: "bot", ...welcome({ ...base, now: Date.now() }) };
}

function Assistant() {
  const { role, mode } = useOutletContext();
  const alerts = useAlertSettings();
  const data = useAssistantData();
  const sim = mode === "sim";
  const base = { alerts, mode, role, firstName: firstName(auth.currentUser) };
  const [messages, setMessages] = useState(() => [greetingFor(base)]);
  const [conversation, setConversation] = useState({});
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const endRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "end" });
  }, [messages, typing]);

  const ask = (raw) => {
    const q = raw.trim();
    if (!q || typing) return;
    const reply = replyTo(q, data, base, conversation);
    setConversation(reply.state);
    setMessages((m) => [...m, { from: "user", text: q }]);
    setInput("");
    const show = () => { setMessages((m) => [...m, { from: "bot", text: reply.text, chips: reply.chips }]); setTyping(false); };
    // A short "typing" pause feels natural; skip it for anyone who asked for less motion.
    if (reducedMotion()) show();
    else { setTyping(true); timer.current = setTimeout(show, 400); }
  };

  const chips = [...messages].reverse().find((m) => m.chips)?.chips || [];

  return (
    <>
      <PageHeader title="Assistant" subtitle="Ask about lots, curbs, history, or how to use the dashboard" />

      <div className="sws-page-body as-body">
        <div className="as-head as-col">
          <Avatar />
          <div style={{ minWidth: 0 }}>
            <h2 className="as-head-name">Smart Wheel Stop Assistant</h2>
            <div className="as-head-status"><span className="sws-live-dot" aria-hidden="true" />Online · reads {sim ? "simulated" : "live"} data, never changes it</div>
          </div>
        </div>

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
            {typing && (
              <div className="as-msg">
                <Avatar />
                <div className="sws-typing as-typing" role="status" aria-label="Assistant is typing">
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <div className="sws-chips as-suggest as-col" role="group" aria-label="Suggested questions">
          {chips.map((s) => (
            <button key={s} type="button" className="sws-chip" onClick={() => ask(s)} disabled={typing}>{s}</button>
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
          <Button type="submit" variant="primary" size="lg" icon="send" disabled={!input.trim() || typing}>Ask</Button>
        </form>
      </div>
    </>
  );
}

export default Assistant;

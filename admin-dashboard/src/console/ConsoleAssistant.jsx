import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { auth } from "../firebase";
import { PageHeader, Button, Input } from "../components/ui";
import { ASSISTANT_NAME, respond, welcome } from "../assistant/console/index.js";
import logo from "../assets/smartcurb-logo.jpg";

// Curb IDs (C-041) in a message render in the monospace, kept away from auto-translate.
function withIds(text) {
  return text.split(/\b(C-\d{3})\b/).map((part, i) => (i % 2 ? <span key={i} className="sws-mono" translate="no">{part}</span> : part));
}

function Avatar() {
  return <div aria-hidden="true" className="as-avatar"><img src={logo} alt="" /></div>;
}

// A first name for the greeting: the account's display name, or the start of an
// email like "sam.ortiz@…". Shared and role inboxes ("admin@", "ops@") get no name.
const NOT_A_NAME = new Set(["admin", "pa", "info", "ops", "staff", "test", "user", "demo", "support", "office", "sales", "hello", "contact", "team", "it", "dev", "noreply", "platform", "console"]);
function firstName(user) {
  const display = user?.displayName?.trim().split(/\s+/)[0];
  if (display) return display;
  const part = (user?.email || "").split("@")[0].split(/[._+\-\d]/)[0];
  if (!/^[a-z]{2,20}$/i.test(part) || NOT_A_NAME.has(part.toLowerCase())) return null;
  return part[0].toUpperCase() + part.slice(1).toLowerCase();
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The reply at the moment it's asked, from the same data the console pages show
// (ConsoleLayout's subscription). Data answers wait for it rather than report zeros.
function replyTo(q, data, base, conversation) {
  const ctx = { ...base, sites: data.sites, leads: data.leads, lots: data.lots, units: data.units, now: Date.now() };
  const reply = respond(q, ctx, conversation);
  if (reply.group === "status" && (data.error || !data.loaded)) {
    reply.text = data.error
      ? "I couldn't read the console data, so I can't answer that right now. Reload the page to try again."
      : "I'm still loading the console data. Ask again in a moment.";
  }
  return reply;
}

function ConsoleAssistant() {
  const { mode, data } = useOutletContext();
  const sim = mode === "sim";
  const base = { mode, firstName: firstName(auth.currentUser) };
  const [messages, setMessages] = useState(() => [{ from: "bot", ...welcome({ ...base, now: Date.now() }) }]);
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
      <PageHeader title="Assistant" subtitle="Ask about customers, quote requests, lots and curbs, or how to do something in the console" />

      <div className="sws-page-body as-body">
        <div className="as-head as-col">
          <Avatar />
          <div style={{ minWidth: 0 }}>
            <h2 className="as-head-name">{ASSISTANT_NAME}</h2>
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
            placeholder="Ask about a customer, a request, a lot, or how to do something…"
            maxLength={300}
          />
          <Button type="submit" variant="primary" size="lg" icon="send" disabled={!input.trim() || typing}>Ask</Button>
        </form>
      </div>
    </>
  );
}

export default ConsoleAssistant;

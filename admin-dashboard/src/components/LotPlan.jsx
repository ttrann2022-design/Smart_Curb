import { useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useFlash } from "../motion";
import { statusKey, hasBattery, isLowBattery, formatAgo, STALL_WORD, ROOMY_MAX, planLayout } from "../units";

// Top-down plan of one lot: every curb is a stall block, laid out in rows that
// face each other across a drive aisle. Free = lime, occupied = red,
// offline = grey with a cross, low battery = amber ring.

function stallLabel(id, u, alerts, now) {
  const parts = [id, STALL_WORD[statusKey(u)].toLowerCase()];
  if (hasBattery(u)) parts.push(`battery ${u.battery}%${isLowBattery(u, alerts) ? ", low" : ""}`);
  const ago = formatAgo(u.lastUpdated, now);
  if (ago) parts.push(`changed ${ago}`);
  return parts.join(", ");
}

export function StallMark({ status, low, roomy, className = "" }) {
  return (
    <span className={`ov-block ov-${status}${low ? " is-low" : ""}${roomy ? " is-roomy" : ""} ${className}`} aria-hidden="true">
      {status === "offline" && (
        <svg viewBox="0 0 10 10" className="ov-x"><path d="M2 2l6 6M8 2 2 8" /></svg>
      )}
    </span>
  );
}

function Stall({ id, unit, to, label, low, roomy, focusable, onActivate, onKeyDown, setRef }) {
  const status = statusKey(unit);
  const changed = useFlash(status, 1200);
  return (
    <Link
      ref={setRef}
      to={to}
      tabIndex={focusable ? 0 : -1}
      aria-label={label}
      className={`ov-stall${changed ? " is-changed" : ""}`}
      onFocus={onActivate}
      onMouseEnter={onActivate}
      onKeyDown={onKeyDown}
    >
      <StallMark status={status} low={low} roomy={roomy} />
      {roomy && (
        <span className="ov-stall-cap" aria-hidden="true">
          <span className="sws-mono" translate="no">{id}</span>
          {STALL_WORD[status]}
        </span>
      )}
    </Link>
  );
}

function LotPlan({ name, lotId, units, alerts, now }) {
  const [active, setActive] = useState(null);
  const [cursor, setCursor] = useState(0);
  const refs = useRef([]);
  const hintId = useId();
  const n = units.length;
  const { rows, perRow } = planLayout(n);
  const roomy = n <= ROOMY_MAX;
  const to = lotId ? `/lots?lot=${encodeURIComponent(lotId)}` : "/units";
  const free = units.filter(([, u]) => statusKey(u) === "open").length;
  const focusIndex = Math.min(cursor, n - 1);

  const move = (e, i) => {
    const last = n - 1;
    const next = {
      ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + perRow, ArrowUp: i - perRow, Home: 0, End: last,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const clamped = Math.max(0, Math.min(last, next));
    setCursor(clamped);
    refs.current[clamped]?.focus();
  };

  // The readout names the hovered or focused curb, else the lot's latest change.
  const latest = units.reduce((best, entry) => ((entry[1].lastUpdated ?? 0) > (best?.[1].lastUpdated ?? -1) ? entry : best), null);
  const shown = units.find(([id]) => id === active) || null;
  const readout = shown || latest;

  const rowEls = [];
  for (let r = 0; r < rows; r++) {
    const slice = units.slice(r * perRow, (r + 1) * perRow);
    rowEls.push(
      <div key={`r${r}`} className={`ov-row ${r % 2 ? "ov-row-b" : "ov-row-a"}`} style={{ "--cols": perRow }}>
        {slice.map(([id, u], k) => {
          const i = r * perRow + k;
          return (
            <Stall
              key={id}
              id={id}
              unit={u}
              to={to}
              roomy={roomy}
              low={isLowBattery(u, alerts)}
              label={stallLabel(id, u, alerts, now)}
              focusable={i === focusIndex}
              setRef={(el) => { refs.current[i] = el; }}
              onActivate={() => { setActive(id); setCursor(i); }}
              onKeyDown={(e) => move(e, i)}
            />
          );
        })}
      </div>,
    );
    // An aisle between each facing pair; back-to-back pairs just get a gap.
    if (r % 2 === 0 && r < rows - 1) rowEls.push(<div key={`a${r}`} className="ov-aisle" aria-hidden="true" />);
  }

  return (
    <section className={`ov-lot${roomy ? " is-roomy" : ""}`} aria-label={name}>
      <div className="ov-lot-in">
        <header className="ov-lot-head">
          {lotId ? (
            <Link to={to} className="ov-lot-name">{name}<span aria-hidden="true"> →</span></Link>
          ) : (
            <span className="ov-lot-name">{name}</span>
          )}
          <span className="ov-lot-count">
            <span className="ov-free-n">{free}</span> free of {n}
          </span>
        </header>
        <div
          className="ov-plan"
          role="group"
          aria-label={`${name}: ${n} ${n === 1 ? "curb" : "curbs"}`}
          aria-describedby={n > 1 ? hintId : undefined}
          onMouseLeave={() => setActive(null)}
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setActive(null); }}
        >
          {rowEls}
        </div>
        {n > 1 && <span id={hintId} className="sws-sr-only">Arrow keys move between curbs.</span>}
        {!roomy && readout && (
          <div className="ov-readout" aria-hidden="true">
            {!shown && <span className="ov-readout-k">Last change</span>}
            <span className="sws-mono" translate="no">{readout[0]}</span>
            <span>{STALL_WORD[statusKey(readout[1])]}</span>
            {formatAgo(readout[1].lastUpdated, now) && <span>{formatAgo(readout[1].lastUpdated, now)}</span>}
            {shown && hasBattery(readout[1]) && <span>Battery {readout[1].battery}%</span>}
          </div>
        )}
      </div>
    </section>
  );
}

export default LotPlan;

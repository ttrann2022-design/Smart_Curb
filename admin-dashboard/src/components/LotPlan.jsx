import { useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useFlash } from "../motion";
import { statusKey, hasBattery, isLowBattery, formatAgo, STALL_WORD, ROOMY_MAX, planLayout, lotCounts, freeText } from "../units";

// Top-down plan of one lot: every curb is a stall block, laid out in rows that
// face each other across a drive aisle. Free = lime, occupied = red,
// offline = grey with a cross, low battery = amber ring. Styles: .lp-* in index.css.
//
//   <LotPlan name="Lot 6" lotId="lot06" units={[[id, unit], …]} alerts={alertSettings} now={now} />
//
// size     "large" (default) or "compact" (small stalls, no captions or readout).
// columns  Widest row count among plans shown together, so they share one stall size.
// index    Position in a list of plans; staggers their entrance by 40ms each.
// onSelect Turns stalls into toggle buttons that call onSelect(id) instead of linking
//          to the lot; `selected` is the chosen curb ID (marked with a bar underneath).

function stallLabel(id, u, alerts, now) {
  const parts = [id, STALL_WORD[statusKey(u)].toLowerCase()];
  if (hasBattery(u)) parts.push(`battery ${u.battery}%${isLowBattery(u, alerts) ? ", low" : ""}`);
  const ago = formatAgo(u.lastUpdated, now);
  if (ago) parts.push(`changed ${ago}`);
  return parts.join(", ");
}

// A single curb block, also used on its own as a legend swatch.
// status: "open" | "occupied" | "offline", or "ring" for an outline only.
// swatch: a small inline legend-sized mark.
export function StallMark({ status, low, roomy, swatch, className = "" }) {
  return (
    <span className={`lp-block${low ? " is-low" : ""}${roomy ? " is-roomy" : ""}${swatch ? " is-swatch" : ""} ${className}`} data-s={status} aria-hidden="true">
      <span className="lp-fill lp-f-open" />
      <span className="lp-fill lp-f-occupied" />
      <span className="lp-fill lp-f-offline" />
      <svg viewBox="0 0 10 10" className="lp-x"><path d="M2 2l6 6M8 2 2 8" /></svg>
    </span>
  );
}

function Stall({ id, unit, to, onSelect, selected, label, low, roomy, edge, focusable, onFocus, onKeyDown, setRef }) {
  const status = statusKey(unit);
  const changed = useFlash(status, 1200);
  const Tag = onSelect ? "button" : Link;
  const action = onSelect ? { type: "button", "aria-pressed": selected, onClick: () => onSelect(id) } : { to };
  return (
    <Tag
      ref={setRef}
      {...action}
      tabIndex={focusable ? 0 : -1}
      aria-label={label}
      className={`lp-stall${changed ? " is-changed" : ""}`}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
    >
      <StallMark status={status} low={low} roomy={roomy} />
      {/* The link's aria-label already says this; the tooltip is for sighted users. */}
      <span className="lp-tip" data-edge={edge} aria-hidden="true">
        <span className="sws-mono" translate="no">{id}</span>
        {STALL_WORD[status]}
      </span>
      {roomy && (
        <span className="lp-cap" aria-hidden="true">
          <span className="sws-mono" translate="no">{id}</span>
          {STALL_WORD[status]}
        </span>
      )}
    </Tag>
  );
}

function LotPlan({ name, lotId, units, alerts, now, size = "large", columns, index = 0, selected, onSelect }) {
  const [cursor, setCursor] = useState(0);
  const [quiet, setQuiet] = useState(false);
  const refs = useRef([]);
  const hintId = useId();
  const n = units.length;
  const { rows, perRow } = planLayout(n);
  const compact = size === "compact";
  const roomy = !compact && n <= ROOMY_MAX;
  const to = lotId ? `/lots?lot=${encodeURIComponent(lotId)}` : "/units";
  const counts = lotCounts(units.map(([, u]) => u));
  const focusIndex = Math.min(cursor, n - 1);

  const onKeyDown = (e, i) => {
    if (e.key === "Escape") { setQuiet(true); return; }
    const last = n - 1;
    const next = {
      ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + perRow, ArrowUp: i - perRow, Home: 0, End: last,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const clamped = Math.max(0, Math.min(last, next));
    setCursor(clamped);
    setQuiet(false);
    refs.current[clamped]?.focus();
  };

  const latest = units.reduce((best, entry) => ((entry[1].lastUpdated ?? 0) > (best?.[1].lastUpdated ?? -1) ? entry : best), null);

  const rowEls = [];
  for (let r = 0; r < rows; r++) {
    const slice = units.slice(r * perRow, (r + 1) * perRow);
    rowEls.push(
      <div key={`r${r}`} className={`lp-row ${r % 2 ? "lp-row-b" : "lp-row-a"}`} style={{ "--cols": perRow }}>
        {slice.map(([id, u], k) => {
          const i = r * perRow + k;
          return (
            <Stall
              key={id}
              id={id}
              unit={u}
              to={to}
              onSelect={onSelect}
              selected={id === selected}
              roomy={roomy}
              // Edge stalls anchor their tooltip inward so it stays on screen.
              edge={perRow > 2 && k === 0 ? "start" : perRow > 2 && k === perRow - 1 ? "end" : undefined}
              low={isLowBattery(u, alerts)}
              label={stallLabel(id, u, alerts, now)}
              focusable={i === focusIndex}
              setRef={(el) => { refs.current[i] = el; }}
              onFocus={() => setCursor(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
            />
          );
        })}
      </div>,
    );
    // An aisle between each facing pair; back-to-back pairs just get a gap.
    if (r % 2 === 0 && r < rows - 1) rowEls.push(<div key={`a${r}`} className="lp-aisle" aria-hidden="true" />);
  }

  return (
    <section
      className={`lp${compact ? " is-compact" : ""}${roomy ? " is-roomy" : ""}`}
      aria-label={name}
      style={{ "--lp-i": index, "--lp-cols": columns || perRow }}
    >
      <div className="lp-in">
        <header className="lp-head">
          {lotId && !onSelect ? (
            <Link to={to} className="lp-name">{name}<span aria-hidden="true"> →</span></Link>
          ) : (
            <span className="lp-name">{name}</span>
          )}
          {/* Free of the curbs that report (lotCounts); offline curbs are counted on their own. */}
          <span className="lp-count">
            {counts.capacity ? <><span className="lp-free-n">{counts.free}</span> free of {counts.capacity}</> : freeText(counts)}
            {counts.offline > 0 && counts.capacity > 0 && <> · {counts.offline} offline</>}
          </span>
        </header>
        <div
          className={`lp-plan${quiet ? " is-quiet" : ""}`}
          role="group"
          aria-label={`${name}: ${n} ${n === 1 ? "curb" : "curbs"}`}
          aria-describedby={n > 1 ? hintId : undefined}
          onPointerMove={quiet ? () => setQuiet(false) : undefined}
        >
          {rowEls}
        </div>
        {n > 1 && <span id={hintId} className="sws-sr-only">Arrow keys move between curbs.</span>}
        {!roomy && !compact && latest && (
          <div className="lp-readout">
            <span className="lp-readout-k">Last change</span>
            <span className="sws-mono" translate="no">{latest[0]}</span>
            <span>{STALL_WORD[statusKey(latest[1])]}</span>
            {formatAgo(latest[1].lastUpdated, now) && <span>{formatAgo(latest[1].lastUpdated, now)}</span>}
          </div>
        )}
      </div>
    </section>
  );
}

export default LotPlan;

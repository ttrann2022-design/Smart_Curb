// Shared building blocks so every page looks and behaves the same.
// Styling lives in index.css (sws-* classes); these just assemble the markup.
import AnimatedNumber from "./AnimatedNumber";
import Icon from "./Icon";
import { useFlash } from "../motion";
import { c } from "../theme";

export function PageHeader({ title, subtitle, live, actions }) {
  return (
    <header className="sws-page-head">
      <div style={{ minWidth: 0 }}>
        <h1 className="sws-page-title">{title}</h1>
        {subtitle && (
          <div className="sws-page-sub">
            {live && <span className="sws-live-dot" aria-hidden="true" />}
            {subtitle}
          </div>
        )}
      </div>
      {actions && <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{actions}</div>}
    </header>
  );
}

export function Card({ title, subtitle, meta, actions, children, body = true, className = "", style, delay, as: Tag = "section" }) {
  return (
    <Tag className={`sws-card${delay !== undefined ? " sws-enter" : ""} ${className}`} style={{ ...(delay !== undefined ? { "--d": `${delay}ms` } : null), ...style }}>
      {(title || actions || meta) && (
        <div className="sws-card-head">
          <div style={{ minWidth: 0 }}>
            {title && <h2 className="sws-card-title">{title}</h2>}
            {subtitle && <div className="sws-card-sub">{subtitle}</div>}
          </div>
          {(meta || actions) && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {meta && <span className="sws-card-meta">{meta}</span>}
              {actions}
            </div>
          )}
        </div>
      )}
      {body ? <div className="sws-card-body">{children}</div> : children}
    </Tag>
  );
}

export function StatTile({ label, value, sub, color, animate = true, title }) {
  const flash = useFlash(value);
  return (
    <div className={`sws-tile-stat${animate && flash ? " sws-flash" : ""}`} title={title}>
      <div className="sws-label">{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
        <span className="sws-tile-value" style={{ color: color || c.text }}>
          {animate && typeof value === "number" ? <AnimatedNumber value={value} /> : value}
        </span>
        {sub && <span className="sws-tile-sub">{sub}</span>}
      </div>
    </div>
  );
}

export function Button({ variant = "secondary", size, block, icon, iconRight, busy, children, className = "", type = "button", ...props }) {
  const cls = ["sws-btn", `sws-btn-${variant}`, size && `sws-btn-${size}`, block && "sws-btn-block", className].filter(Boolean).join(" ");
  return (
    <button type={type} className={cls} aria-busy={busy || undefined} {...props}>
      {busy ? <span className="sws-spinner" aria-hidden="true" /> : icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />}
      {children}
      {iconRight && <Icon name={iconRight} size={14} />}
    </button>
  );
}

export function Field({ label, hint, children, style }) {
  return (
    <label className="sws-field" style={style}>
      <span className="sws-field-label">{label}</span>
      {children}
      {hint && <span className="sws-field-hint">{hint}</span>}
    </label>
  );
}

export function Input({ size, className = "", ...props }) {
  return <input className={`sws-input${size === "lg" ? " sws-input-lg" : ""} ${className}`} {...props} />;
}

export function Select({ className = "", children, ...props }) {
  return <select className={`sws-input ${className}`} {...props}>{children}</select>;
}

export function SearchInput({ label = "Search", style, ...props }) {
  return (
    <div className="sws-input-wrap" style={style}>
      <Icon name="search" size={15} />
      <input type="search" aria-label={label} className="sws-input" style={{ height: 34, fontSize: 13 }} {...props} />
    </div>
  );
}

export function Chips({ options, value, onChange, label }) {
  return (
    <div className="sws-chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" className="sws-chip" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
          {o.count !== undefined && <span className="sws-chip-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

const STATUS_TONE = {
  open: { color: c.open, label: "Open" },
  occupied: { color: c.busy, label: "Occupied" },
  offline: { color: c.faint, label: "Offline" },
  stale: { color: c.warn, label: "No recent report" },
};

export function StatusPill({ status, label }) {
  const tone = STATUS_TONE[status] || STATUS_TONE.offline;
  return (
    <span className="sws-pill">
      <span className="sws-dot" style={{ background: tone.color, boxShadow: status === "offline" ? `inset 0 0 0 1.5px ${c.dim}` : "none" }} />
      <span style={{ color: status === "offline" ? c.dim : c.text }}>{label || tone.label}</span>
    </span>
  );
}

const NOTICE_ICON = { busy: "alert", warn: "alert", ok: "check", sim: "info", info: "info" };

export function Notice({ tone = "info", title, children, icon, role }) {
  return (
    <div className={`sws-notice sws-notice-${tone}`} role={role}>
      <Icon name={icon || NOTICE_ICON[tone]} size={15} />
      <div style={{ minWidth: 0 }}>
        {title && <div className="sws-notice-title">{title}</div>}
        {children && <div className={title ? "sws-notice-body" : ""}>{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon = "info", title, children, action }) {
  return (
    <div className="sws-empty">
      <div className="sws-empty-icon"><Icon name={icon} size={20} /></div>
      {title && <div className="sws-empty-title">{title}</div>}
      {children && <div className="sws-empty-text">{children}</div>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export function Skeleton({ width = "100%", height = 14, style }) {
  return <div className="sws-skel" style={{ width, height, ...style }} aria-hidden="true" />;
}

// Inline status line under a form or action: green for success, red for errors.
export function StatusText({ msg }) {
  if (!msg) return null;
  return (
    <div role="status" style={{ fontSize: 12.5, color: msg.ok ? c.open : c.busy, display: "flex", alignItems: "center", gap: 6 }}>
      <Icon name={msg.ok ? "check" : "alert"} size={14} />
      {msg.text}
    </div>
  );
}

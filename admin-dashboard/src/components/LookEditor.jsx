import { LED_COLORS, LED_HEX, c, mono } from "../theme";
import { LOOK_LIMITS } from "../../shared/schedule.js";
import LedPreview from "./LedPreview";
import { Field, Input } from "./ui";

// Colour chips, panel text and brightness for a timed state or the default look, with
// the same limits and preview as the manual LED control on Parking lots.
function LookEditor({ look, onChange, disabled, label = "Colour" }) {
  const set = (fields) => onChange({ ...look, ...fields });
  // Colour is a radio group: arrow keys move the choice, like native radios.
  const onKey = (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = (LED_COLORS.indexOf(look.ledColor) + step + LED_COLORS.length) % LED_COLORS.length;
    set({ ledColor: LED_COLORS[i] });
    e.currentTarget.querySelectorAll("[role=radio]")[i]?.focus();
  };
  return (
    <div className="tm-look">
      <LedPreview color={look.ledColor} text={look.panelText.trim()} brightness={look.ledBrightness} />
      <div className="sws-field">
        <span className="sws-field-label">{label}</span>
        <div role="radiogroup" aria-label={label} onKeyDown={onKey} className="tm-colors">
          {LED_COLORS.map((name) => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={look.ledColor === name}
              aria-label={name}
              title={name}
              tabIndex={look.ledColor === name ? 0 : -1}
              disabled={disabled}
              onClick={() => set({ ledColor: name })}
              className="tm-color"
              style={{ background: LED_HEX[name], boxShadow: look.ledColor === name ? `0 0 0 2px ${c.panel}, 0 0 0 4px ${c.text}` : "none" }}
            />
          ))}
        </div>
      </div>
      <Field label="Panel text" hint={`${look.panelText.length} of ${LOOK_LIMITS.panelText} characters`}>
        <Input value={look.panelText} maxLength={LOOK_LIMITS.panelText} disabled={disabled} onChange={(e) => set({ panelText: e.target.value.toUpperCase() })} placeholder="e.g. RESERVED" style={{ fontFamily: mono, letterSpacing: 1 }} />
      </Field>
      <Field label="Brightness">
        <div className="tm-slider">
          <input type="range" className="sws-range" min={LOOK_LIMITS.minBrightness} max={LOOK_LIMITS.maxBrightness} step={1} disabled={disabled} value={look.ledBrightness} aria-valuetext={`${look.ledBrightness}%`} onChange={(e) => set({ ledBrightness: Number(e.target.value) })} />
          <span className="tm-slider-v" aria-hidden="true">{look.ledBrightness}%</span>
        </div>
      </Field>
    </div>
  );
}

export default LookEditor;

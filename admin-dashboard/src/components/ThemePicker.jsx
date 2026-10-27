import { THEMES } from "../themes";
import { StallMark } from "./LotPlan";
import Icon from "./Icon";

// A small lot in each preview: the fixed status colours on the theme's own surface.
const PREVIEW = ["open", "occupied", "occupied", "open", "offline", "open", "occupied", "open", "open", "occupied", "open", "occupied"];

// Six theme cards as native radios: arrow keys move between them and screen
// readers announce a radio group. Each preview carries its own data-theme, so it
// renders in that theme's real tokens; the frame and name use the page's theme.
function ThemePicker({ value, onPick, disabled, name = "site-theme", label = "Theme" }) {
  return (
    <fieldset className="tp" disabled={disabled}>
      <legend className="sws-sr-only">{label}</legend>
      <div className="tp-grid">
        {THEMES.map((t) => (
          <label key={t.id} className="tp-opt">
            <input type="radio" name={name} value={t.id} checked={value === t.id} onChange={() => onPick(t.id)} className="sws-sr-only" />
            <span className="tp-frame">
              <span className="tp-card" data-theme={t.id} aria-hidden="true">
                <span className="tp-plan">
                  {PREVIEW.map((s, i) => <StallMark key={i} status={s} />)}
                </span>
                <span className="tp-row">
                  <span className="tp-lines"><span /><span /></span>
                  <span className="tp-btn">Apply</span>
                </span>
              </span>
            </span>
            <span className="tp-name">
              {t.label}
              <Icon name="check" size={14} strokeWidth={2.6} className="tp-check" />
            </span>
            <span className="tp-desc">{t.desc}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default ThemePicker;

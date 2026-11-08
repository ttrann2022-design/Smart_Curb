import { LED_HEX, LED_INK } from "../theme";
import { parseTime, wallClock } from "../../shared/schedule.js";
import { DAY_NAMES, formatMinutes, listOf } from "../scheduleText";

const HOURS = [0, 6, 12, 18];
const NAME_FITS = 0.08; // Share of the day a block needs before its name fits inside.

// One rule's blocks per weekday. A window crossing midnight is two blocks, the second on
// the next day, though the window belongs to the day it starts.
function segments(rules) {
  const rows = DAY_NAMES.map(() => []);
  for (const [id, rule] of Object.entries(rules)) {
    const s = parseTime(rule.start);
    const e = parseTime(rule.end);
    if (s === null || e === null || s === e) continue;
    for (const day of listOf(rule.days)) {
      if (!rows[day]) continue;
      if (s < e) rows[day].push({ id, rule, from: s, to: e, day });
      else {
        rows[day].push({ id, rule, from: s, to: 1440, day });
        if (e > 0) rows[(day + 1) % 7].push({ id, rule, from: 0, to: e, day });
      }
    }
  }
  // Overlapping blocks stack in lanes, so none hides another.
  return rows.map((blocks) => {
    const lanes = [];
    blocks.sort((a, b) => a.from - b.from || b.to - a.to);
    for (const block of blocks) {
      let lane = lanes.findIndex((end) => end <= block.from);
      if (lane < 0) { lane = lanes.length; lanes.push(0); }
      lanes[lane] = block.to;
      block.lane = lane;
    }
    return { blocks, lanes: Math.max(1, lanes.length) };
  });
}

// Seven rows of 24 hours, a block per rule in the rule's look colour, and a now marker.
function ScheduleTimeline({ rules, timezone, now, onEdit }) {
  const rows = segments(rules);
  const wall = wallClock(now, timezone);
  return (
    <div className="tm-week">
      <div className="tm-hours" aria-hidden="true">
        {HOURS.map((h) => <span key={h} style={{ left: `${(h / 24) * 100}%` }}>{formatMinutes(h * 60).replace(":00", "")}</span>)}
      </div>
      <ul className="tm-rows" aria-label="Timed states by day">
        {rows.map(({ blocks, lanes }, day) => (
          <li key={day} className={`tm-row${day === wall.day ? " is-today" : ""}`}>
            <span className="tm-day">{DAY_NAMES[day].slice(0, 3)}</span>
            <div className="tm-track" style={{ "--lanes": lanes }}>
              {HOURS.map((h) => <span key={h} className="tm-tick" style={{ left: `${(h / 24) * 100}%` }} aria-hidden="true" />)}
              {blocks.map((b) => {
                const off = b.rule.enabled !== true;
                const label = `${b.rule.name}, ${DAY_NAMES[b.day]} ${formatMinutes(parseTime(b.rule.start))} to ${formatMinutes(parseTime(b.rule.end))}${off ? ", off" : ""}`;
                const style = {
                  left: `${(b.from / 1440) * 100}%`, width: `${((b.to - b.from) / 1440) * 100}%`, "--lane": b.lane,
                  ...(off ? { "--led": LED_HEX[b.rule.look?.ledColor] } : { background: LED_HEX[b.rule.look?.ledColor], color: LED_INK }),
                };
                const name = (b.to - b.from) / 1440 >= NAME_FITS ? b.rule.name : "";
                const cls = `tm-block${off ? " is-off" : ""}`;
                return onEdit
                  ? <button key={`${b.id}-${b.from}`} type="button" className={cls} style={style} title={label} aria-label={`Edit ${label}`} onClick={() => onEdit(b.id)}>{name}</button>
                  : <span key={`${b.id}-${b.from}`} className={cls} style={style} title={label}><span className="sws-sr-only">{label}</span><span aria-hidden="true">{name}</span></span>;
              })}
              {day === wall.day && <span className="tm-now" style={{ left: `${(wall.minutes / 1440) * 100}%` }}><span className="sws-sr-only">Now, {formatMinutes(wall.minutes)}</span></span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ScheduleTimeline;

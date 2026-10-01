import { useEffect, useRef, useState } from "react";

function AnimatedNumber({ value, duration = 600 }) {
  const [display, setDisplay] = useState(value);
  const shown = useRef(value);
  const frame = useRef(0);

  useEffect(() => {
    const from = shown.current;
    if (from === value) return;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof value !== "number" || typeof from !== "number") {
      shown.current = value;
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(from + (value - from) * eased);
      shown.current = current;
      setDisplay(current);
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [value, duration]);

  return <>{display}</>;
}

export default AnimatedNumber;
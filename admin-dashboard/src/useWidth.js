import { useLayoutEffect, useRef, useState } from "react";

// Width of an element in CSS pixels, so charts draw at real size and their text stays readable.
export default function useWidth() {
  const el = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  return [el, width];
}

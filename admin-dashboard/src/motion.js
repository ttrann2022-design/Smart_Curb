import { useEffect, useRef, useState } from "react";

export function useFlash(value, ms = 900) {
  const prev = useRef(value);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (Object.is(prev.current, value)) return;
    prev.current = value;
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);

  return flash;
}
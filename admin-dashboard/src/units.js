import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { database } from "./firebase";
import { DEFAULT_ALERTS } from "./unitStatus";

export * from "./unitStatus";

export function useAlertSettings() {
  const [alerts, setAlerts] = useState(DEFAULT_ALERTS);
  useEffect(() => onValue(
    ref(database, "settings/alerts"),
    (s) => setAlerts({ ...DEFAULT_ALERTS, ...(s.val() || {}) }),
    () => setAlerts(DEFAULT_ALERTS),
  ), []);
  return alerts;
}

// Re-renders every `ms` so relative times ("2 min ago") stay current.
export function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

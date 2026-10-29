// The signed-in account's scope (src/scope.js), for every dashboard page. Layout
// works it out after sign-in and provides it; pages read raw lots/units from the
// database and pass them through useScoped() before showing anything.
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ref, get, onValue } from "firebase/database";
import { database } from "./firebase";
import { ALL_CUSTOMERS, NONE, scopeData } from "./scope";

// Outside Layout nothing is in scope, so a page that forgot the provider shows nothing, not everything.
export const ScopeContext = createContext(NONE);

export const useScope = () => useContext(ScopeContext);

// { lots, units } with only what the account may see.
export function useScoped(lots, units) {
  const scope = useScope();
  return useMemo(() => scopeData({ lots, units }, scope), [lots, units, scope]);
}

const VIEWING_KEY = "sws-viewing";

// A platform admin's "Viewing" pick, kept for this browser tab.
export function useViewing() {
  const [viewing, setViewing] = useState(() => {
    try { return sessionStorage.getItem(VIEWING_KEY) || ALL_CUSTOMERS; } catch { return ALL_CUSTOMERS; }
  });
  const pick = (id) => {
    setViewing(id);
    try { sessionStorage.setItem(VIEWING_KEY, id); } catch { /* private window: the pick lasts until reload */ }
  };
  return [viewing, pick];
}

// Customer names for the header. Platform admins read sites/ (the rules allow it) for
// the switcher. Anyone else tries only their own customer's name; the rules keep
// sites/ to platform admins, so that read is refused and the header says
// "Your customer" instead. Nothing extra is stored for them.
export function useCustomerNames(isPlatformAdmin, siteId) {
  const [state, setState] = useState({ sites: null, own: null });
  useEffect(() => {
    if (isPlatformAdmin) {
      return onValue(ref(database, "sites"), (s) => {
        const sites = Object.entries(s.val() || {})
          .filter(([, v]) => v && typeof v.name === "string")
          .map(([id, v]) => ({ id, name: v.name }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setState({ sites, own: null });
      }, () => setState({ sites: [], own: null }));
    }
    if (!siteId) return undefined;
    let live = true;
    get(ref(database, `sites/${siteId}/name`))
      .then((s) => { if (live) setState({ sites: null, own: typeof s.val() === "string" ? s.val() : null }); })
      .catch(() => { if (live) setState({ sites: null, own: null }); });
    return () => { live = false; };
  }, [isPlatformAdmin, siteId]);
  return state;
}

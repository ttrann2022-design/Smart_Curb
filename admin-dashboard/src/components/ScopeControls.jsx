import { setDataMode } from "../dataMode";
import { ALL_CUSTOMERS } from "../scope";
import { FullScreen } from "./Brand";
import { Button } from "./ui";
import Icon from "./Icon";

// The header switcher: All customers, or one of them.
export function ViewingSwitcher({ sites, value, onChange }) {
  return (
    <label className="sc-viewing">
      <span className="sws-label sc-viewing-k">Viewing</span>
      <span className="sc-viewing-field">
        <select className="sws-input sc-viewing-select" value={value} onChange={(e) => onChange(e.target.value)} disabled={!sites}>
          <option value={ALL_CUSTOMERS}>All customers</option>
          {(sites || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </span>
    </label>
  );
}

// An account with no users/<uid>/siteId, in Live: no data at all, just how to fix it.
export function UnlinkedScreen({ email, onSignOut }) {
  return (
    <FullScreen>
      <div className="sc-unlinked-icon" aria-hidden="true"><Icon name="lock" size={22} /></div>
      <h1 className="sc-unlinked-h">Your account isn&apos;t linked to a customer yet.</h1>
      <p className="sc-unlinked-p">Ask Smart Wheel Stop to link it. Until then the dashboard shows no lots or curbs.</p>
      {email && <p className="sc-unlinked-who">Signed in as <span className="sws-mono">{email}</span></p>}
      <div className="sc-unlinked-actions">
        <Button variant="sim" onClick={() => setDataMode("sim")}>View simulated data</Button>
        <Button onClick={onSignOut}>Sign out</Button>
      </div>
    </FullScreen>
  );
}

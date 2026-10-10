import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { ref, onValue, update, set, remove, serverTimestamp } from "firebase/database";
import { auth, database, emailKey } from "../firebase";
import { c, mono } from "../theme";
import { useNow, formatAgo, formatExact } from "../units";
import Icon from "../components/Icon";
import { PageHeader, Card, Button, Input, Select, EmptyState, StatusText } from "../components/ui";

const permLabels = ["View occupancy", "View battery and status", "Change LED zones", "Edit panel text", "View camera snapshots (planned)", "Manage users"];

const roles = [
  { id: "viewer", name: "Viewer", who: "Front desk, parking attendants", perms: [true, true, false, false, false, false] },
  { id: "operator", name: "Operator", who: "Lot supervisors, event staff", perms: [true, true, true, true, false, false] },
  { id: "manager", name: "Manager", who: "Facility and security leads", perms: [true, true, true, true, true, true] },
];
const roleName = (id) => roles.find((r) => r.id === id)?.name || "Viewer";

const columns = "minmax(200px, 2fr) 150px minmax(150px, 1fr)";

function signupLink(email) {
  return `${window.location.origin}/signup?email=${encodeURIComponent(email)}`;
}

function CopyLinkButton({ email }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(signupLink(email));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this sign-up link:", signupLink(email));
    }
  };
  return (
    <Button variant="ghost" size="sm" icon={copied ? "check" : "copy"} onClick={copy} aria-label={`Copy sign-up link for ${email}`} style={{ color: copied ? c.open : undefined }}>
      {copied ? "Copied" : "Copy sign-up link"}
    </Button>
  );
}

function Users() {
  const { role } = useOutletContext();
  const [users, setUsers] = useState({});
  const [invites, setInvites] = useState({});
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [sending, setSending] = useState(false);
  const [lastInvite, setLastInvite] = useState(null);
  const [pendingRole, setPendingRole] = useState(null); // { uid, email, role }
  const [pendingRevoke, setPendingRevoke] = useState(null); // invite key
  const [status, setStatus] = useState(null);
  const now = useNow(60000);
  const isManager = role === "manager";
  const myUid = auth.currentUser?.uid;

  useEffect(() => {
    const stopUsers = onValue(ref(database, "users"), (s) => setUsers(s.val() || {}));
    // Only managers can read invites under the security rules.
    const stopInvites = isManager
      ? onValue(ref(database, "invites"), (s) => setInvites(s.val() || {}))
      : () => setInvites({});
    return () => { stopUsers(); stopInvites(); };
  }, [isManager]);

  const userList = Object.entries(users).sort(([, a], [, b]) => (a.email || "").localeCompare(b.email || ""));
  const inviteList = Object.entries(invites).sort(([, a], [, b]) => (b.invitedAt || 0) - (a.invitedAt || 0));
  const countFor = (id) => userList.filter(([, u]) => u.role === id).length;

  const requestRole = (uid, email, newRole) => {
    setStatus(null);
    if (uid === myUid && newRole !== "manager") {
      setStatus({ ok: false, text: "You can't remove your own manager access. Another manager has to do that." });
      return;
    }
    setPendingRole({ uid, email, role: newRole });
  };

  const confirmRole = async () => {
    const { uid, email, role: newRole } = pendingRole;
    setPendingRole(null);
    try {
      await update(ref(database, `users/${uid}`), { role: newRole });
      setStatus({ ok: true, text: `${email} is now ${roleName(newRole).toLowerCase() === "operator" ? "an" : "a"} ${roleName(newRole)}.` });
    } catch (err) {
      setStatus({ ok: false, text: "Couldn't change the role: " + err.message });
    }
  };

  const sendInvite = async (e) => {
    e.preventDefault();
    setStatus(null);
    setLastInvite(null);
    const email = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus({ ok: false, text: "Enter a valid email address." });
      return;
    }
    if (userList.some(([, u]) => (u.email || "").toLowerCase() === email)) {
      setStatus({ ok: false, text: "That person already has an account. Change their role in the table instead." });
      return;
    }
    setSending(true);
    try {
      await set(ref(database, `invites/${emailKey(email)}`), {
        email,
        role: inviteRole,
        invitedBy: auth.currentUser?.email || "",
        invitedAt: serverTimestamp(),
      });
      setInviteEmail("");
      setLastInvite({ email, role: inviteRole });
    } catch (err) {
      setStatus({ ok: false, text: "Couldn't send the invite: " + err.message });
    }
    setSending(false);
  };

  const revokeInvite = async (key, email) => {
    setPendingRevoke(null);
    try {
      await remove(ref(database, `invites/${key}`));
      if (lastInvite?.email === email) setLastInvite(null);
      setStatus({ ok: true, text: `Invite for ${email} revoked.` });
    } catch (err) {
      setStatus({ ok: false, text: "Couldn't revoke the invite: " + err.message });
    }
  };

  return (
    <>
      <PageHeader
        title="Users & roles"
        subtitle={isManager ? "Invite people and change anyone's access level" : "Only managers can invite people or change access"}
      />

      <div className="sws-page-body">
        <div className="sws-tiles" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {roles.map((r) => {
            const mine = r.id === role;
            return (
              <div key={r.id} className="sws-card" style={{ background: mine ? "#1B200F" : c.panel, borderColor: mine ? c.accentLine : c.line, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div>
                    <h2 style={{ fontFamily: mono, fontSize: 15, fontWeight: 600, margin: 0 }}>
                      {r.name}
                      {mine && <span style={{ fontSize: 11, color: c.accent, marginLeft: 8 }}>YOU</span>}
                    </h2>
                    <div style={{ fontSize: 12, color: c.dim, marginTop: 3 }}>{r.who}</div>
                  </div>
                  <span className="sws-badge">{countFor(r.id)} {countFor(r.id) === 1 ? "USER" : "USERS"}</span>
                </div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 7 }}>
                  {permLabels.map((p, i) => (
                    <li key={p} style={{ fontSize: 12.5, color: r.perms[i] ? c.text : c.faint, display: "flex", alignItems: "center", gap: 8 }}>
                      <Icon name={r.perms[i] ? "check" : "close"} size={13} strokeWidth={r.perms[i] ? 2.4 : 1.8} style={{ color: r.perms[i] ? c.open : c.faint }} />
                      <span className="sws-sr-only">{r.perms[i] ? "Can" : "Cannot"}</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {isManager && (
          <Card title="Invite someone" subtitle="The dashboard doesn't email people. After inviting, copy their sign-up link and send it to them." body={false}>
            <form onSubmit={sendInvite} style={{ padding: "14px 18px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Input type="email" aria-label="Email to invite" placeholder="their@email.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} style={{ width: 280, maxWidth: "100%" }} required />
              <Select aria-label="Role for the invite" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={{ width: 140 }}>
                <option value="viewer">Viewer</option>
                <option value="operator">Operator</option>
                <option value="manager">Manager</option>
              </Select>
              <Button type="submit" variant="primary" icon="send" busy={sending} disabled={sending || !inviteEmail.trim()}>Send invite</Button>
            </form>

            {lastInvite && (
              <div role="status" style={{ margin: "0 18px 14px", padding: "10px 12px", borderRadius: 6, background: c.openBg, border: `1px solid ${c.accentLine}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Icon name="check" size={15} style={{ color: c.open }} />
                <span style={{ fontSize: 13, flex: "1 1 240px" }}>
                  Invited <strong>{lastInvite.email}</strong> as {roleName(lastInvite.role)}. Send them the sign-up link.
                </span>
                <CopyLinkButton email={lastInvite.email} />
              </div>
            )}

            {inviteList.length > 0 && (
              <div style={{ borderTop: `1px solid ${c.line}` }}>
                <div className="sws-trow sws-thead"><div className="sws-th">Pending invites</div></div>
                {inviteList.map(([key, inv]) => (
                  <div key={key} className="sws-trow" style={{ gridTemplateColumns: "1fr auto" }}>
                    <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 10, minWidth: 0, flexWrap: "wrap" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{inv.email}</span>
                      <span className="sws-badge">{(inv.role || "viewer").toUpperCase()}</span>
                      {inv.invitedAt && <span style={{ fontSize: 12, color: c.dim }} title={formatExact(inv.invitedAt)}>invited {formatAgo(inv.invitedAt, now)}</span>}
                    </div>
                    {pendingRevoke === key ? (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontSize: 12.5, color: c.busyText }}>Revoke?</span>
                        <Button size="sm" variant="danger" onClick={() => revokeInvite(key, inv.email)} autoFocus>Revoke</Button>
                        <Button size="sm" onClick={() => setPendingRevoke(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <CopyLinkButton email={inv.email} />
                        <Button variant="ghost" size="sm" onClick={() => setPendingRevoke(key)} style={{ color: c.busy }}>Revoke</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        <Card title="People" meta={`${userList.length} ${userList.length === 1 ? "account" : "accounts"}`} body={false}>
          <div className="sws-table-scroll">
            <div role="table" aria-label="People">
              <div role="row" className="sws-trow sws-thead" style={{ gridTemplateColumns: columns }}>
                <div role="columnheader" className="sws-th">Email</div>
                <div role="columnheader" className="sws-th">Role</div>
                <div role="columnheader" className="sws-th">Last sign-in</div>
              </div>
              <div role="rowgroup" className="sws-tbody">
                {userList.length === 0 && <EmptyState icon="users" title="No accounts yet" />}
                {userList.map(([uid, u]) => {
                  const pending = pendingRole?.uid === uid;
                  return (
                    <div key={uid} role="row" className="sws-trow" style={{ gridTemplateColumns: columns, background: pending ? c.warnBg : undefined }}>
                      <div role="cell" style={{ fontSize: 13, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {u.email}
                        {uid === myUid && <span style={{ color: c.dim, fontSize: 11.5 }}> (you)</span>}
                      </div>
                      <div role="cell">
                        {isManager ? (
                          <Select
                            aria-label={`Role for ${u.email}`}
                            value={pending ? pendingRole.role : u.role || "viewer"}
                            onChange={(e) => requestRole(uid, u.email, e.target.value)}
                            style={{ height: 32, fontSize: 13 }}
                          >
                            <option value="viewer">Viewer</option>
                            <option value="operator">Operator</option>
                            <option value="manager">Manager</option>
                          </Select>
                        ) : (
                          <span className="sws-badge">{(u.role || "viewer").toUpperCase()}</span>
                        )}
                      </div>
                      <div role="cell" style={{ fontSize: 12.5, color: c.dim }}>
                        {pending ? (
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <Button size="sm" variant="primary" onClick={confirmRole}>Change to {roleName(pendingRole.role)}</Button>
                            <Button size="sm" onClick={() => setPendingRole(null)}>Cancel</Button>
                          </div>
                        ) : (
                          <span title={formatExact(u.lastActive)}>{formatAgo(u.lastActive, now) || "Never"}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        <StatusText msg={status} />
      </div>
    </>
  );
}

export default Users;

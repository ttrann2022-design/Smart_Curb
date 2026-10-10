import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { ref, onValue, update, set, remove } from "firebase/database";
import { auth, database, emailKey } from "../firebase";
import { c, mono } from "../theme";
import Icon from "../components/Icon";
import { PageHeader, Card, Button, Input, Select, EmptyState } from "../components/ui";

const permLabels = ["View occupancy", "View battery and status", "Change LED zones", "Edit panel text", "View camera footage", "Manage users"];

const roles = [
  { id: "viewer", name: "Viewer", who: "Front desk, parking attendants", perms: [true, true, false, false, false, false] },
  { id: "operator", name: "Operator", who: "Lot supervisors, event staff", perms: [true, true, true, true, false, false] },
  { id: "manager", name: "Manager", who: "Facility and security leads", perms: [true, true, true, true, true, true] },
];

const columns = "minmax(200px, 2fr) 150px minmax(170px, 1.2fr)";

function Users() {
  const { role } = useOutletContext();
  const [users, setUsers] = useState({});
  const [invites, setInvites] = useState({});
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [status, setStatus] = useState("");
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

  const changeRole = async (uid, newRole) => {
    if (uid === myUid && newRole !== "manager") {
      setStatus("You can't remove your own manager access — another manager has to do that.");
      return;
    }
    try {
      await update(ref(database, `users/${uid}`), { role: newRole });
      setStatus(`Role updated to ${newRole}.`);
    } catch (err) {
      setStatus("Could not update role: " + err.message);
    }
  };

  const sendInvite = async (e) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email.includes("@") || !email.includes(".")) {
      setStatus("Enter a valid email address.");
      return;
    }
    if (userList.some(([, u]) => (u.email || "").toLowerCase() === email)) {
      setStatus("That person already has an account. Change their role in the table instead.");
      return;
    }
    try {
      await set(ref(database, `invites/${emailKey(email)}`), {
        email,
        role: inviteRole,
        invitedBy: auth.currentUser?.email || "",
        invitedAt: Date.now(),
      });
      setInviteEmail("");
      setStatus(`Invited ${email} as ${inviteRole}. Send them the sign-up link — the dashboard doesn't email them automatically.`);
    } catch (err) {
      setStatus("Could not send invite: " + err.message);
    }
  };

  const revokeInvite = async (key, email) => {
    await remove(ref(database, `invites/${key}`));
    setStatus(`Invite for ${email} revoked.`);
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
                      {mine && <span style={{ fontFamily: "inherit", fontSize: 11, color: c.accent, marginLeft: 8 }}>YOU</span>}
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
          <Card title="Invite someone" body={false}>
            <form onSubmit={sendInvite} style={{ padding: "14px 18px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Input type="email" aria-label="Email to invite" placeholder="their@email.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} style={{ width: 280, maxWidth: "100%" }} required />
              <Select aria-label="Role for the invite" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={{ width: 140 }}>
                <option value="viewer">Viewer</option>
                <option value="operator">Operator</option>
                <option value="manager">Manager</option>
              </Select>
              <Button type="submit" variant="primary" icon="send">Send invite</Button>
            </form>

            {inviteList.length > 0 && (
              <div style={{ borderTop: `1px solid ${c.line}` }}>
                <div className="sws-trow sws-thead"><div className="sws-th">Pending invites</div></div>
                {inviteList.map(([key, inv]) => (
                  <div key={key} className="sws-trow" style={{ gridTemplateColumns: "1fr auto" }}>
                    <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 10, minWidth: 0, flexWrap: "wrap" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{inv.email}</span>
                      <span className="sws-badge">{(inv.role || "viewer").toUpperCase()}</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => revokeInvite(key, inv.email)} style={{ color: c.busy }}>Revoke</Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        <Card title="People" meta={`${userList.length} accounts`} body={false}>
          <div className="sws-table-scroll">
            <div role="table" aria-label="People">
              <div role="row" className="sws-trow sws-thead" style={{ gridTemplateColumns: columns }}>
                <div role="columnheader" className="sws-th">Email</div>
                <div role="columnheader" className="sws-th">Role</div>
                <div role="columnheader" className="sws-th">Last active</div>
              </div>
              <div role="rowgroup" className="sws-tbody">
                {userList.length === 0 && <EmptyState icon="users" title="No accounts yet" />}
                {userList.map(([uid, u]) => (
                  <div key={uid} role="row" className="sws-trow" style={{ gridTemplateColumns: columns }}>
                    <div role="cell" style={{ fontSize: 13, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {u.email}
                      {uid === myUid && <span style={{ color: c.dim, fontSize: 11.5 }}> (you)</span>}
                    </div>
                    <div role="cell">
                      {isManager ? (
                        <Select aria-label={`Role for ${u.email}`} value={u.role || "viewer"} onChange={(e) => changeRole(uid, e.target.value)} style={{ height: 32, fontSize: 13 }}>
                          <option value="viewer">Viewer</option>
                          <option value="operator">Operator</option>
                          <option value="manager">Manager</option>
                        </Select>
                      ) : (
                        <span className="sws-badge">{(u.role || "viewer").toUpperCase()}</span>
                      )}
                    </div>
                    <div role="cell" style={{ fontSize: 12.5, color: c.dim }}>{u.lastActive ? new Date(u.lastActive).toLocaleString() : "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {status && <div role="status" className="sws-note">{status}</div>}
      </div>
    </>
  );
}

export default Users;

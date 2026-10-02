import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { ref, onValue, update, set, remove } from "firebase/database";
import { auth, database, emailKey } from "../firebase";
import { c, mono } from "../theme";

const permLabels = ["View occupancy", "View battery and status", "Change LED zones", "Edit panel text", "View camera footage", "Manage users"];

const roles = [
  { id: "viewer", name: "Viewer", who: "Front desk, parking attendants", perms: [true, true, false, false, false, false] },
  { id: "operator", name: "Operator", who: "Lot supervisors, event staff", perms: [true, true, true, true, false, false] },
  { id: "manager", name: "Manager", who: "Facility and security leads", perms: [true, true, true, true, true, true] },
];

const inputStyle = { height: 36, padding: "0 10px", borderRadius: 5, border: `1px solid ${c.line}`, background: c.bg, color: c.text, fontSize: 13 };

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
    const stopInvites = onValue(ref(database, "invites"), (s) => setInvites(s.val() || {}));
    return () => { stopUsers(); stopInvites(); };
  }, []);

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

  const columns = "2fr 1fr 1.2fr";
  const headerCell = { fontSize: 11, fontWeight: 700, letterSpacing: 0.7, color: c.dim };

  return (
    <>
      <div className="sws-page-head" style={{ height: 68, flexShrink: 0, background: c.panel, borderBottom: `1px solid ${c.line}`, padding: "0 30px", display: "flex", alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 19, fontWeight: 600 }}>Users & roles</div>
          <div style={{ fontSize: 12.5, color: c.dim }}>
            {isManager ? "Invite people and change anyone's access level" : "Only managers can invite people or change access"}
          </div>
        </div>
      </div>

      <div className="sws-page-body" style={{ padding: "22px 30px", display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="sws-tiles" style={{ display: "flex", gap: 14 }}>
          {roles.map((r) => (
            <div key={r.id} style={{ flex: 1, background: r.id === role ? "#1E2313" : c.panel, border: `1px solid ${r.id === role ? c.accent : c.line}`, borderRadius: 6, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontFamily: mono, fontSize: 15, fontWeight: 600 }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: c.dim, marginTop: 3 }}>{r.who}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: c.accent, background: c.navBg, padding: "4px 9px", borderRadius: 5 }}>
                  {countFor(r.id)} USERS
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {permLabels.map((p, i) => (
                  <div key={p} style={{ fontSize: 12, color: r.perms[i] ? c.text : "#5A5A52" }}>
                    {r.perms[i] ? "✓" : "–"}&nbsp;&nbsp;{p}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {isManager && (
          <div style={{ background: c.panel, border: `1px solid ${c.line}`, borderRadius: 6 }}>
            <div style={{ padding: "12px 18px", borderBottom: `1px solid ${c.line}`, fontFamily: mono, fontSize: 14, fontWeight: 600 }}>Invite someone</div>
            <form onSubmit={sendInvite} style={{ padding: "14px 18px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input type="email" placeholder="their@email.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} style={{ ...inputStyle, width: 280 }} required />
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={{ ...inputStyle, width: 140 }}>
                <option value="viewer">Viewer</option>
                <option value="operator">Operator</option>
                <option value="manager">Manager</option>
              </select>
              <button type="submit" style={{ height: 36, padding: "0 16px", borderRadius: 5, border: "none", background: c.accent, color: c.onAccent, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                Send invite
              </button>
            </form>

            {inviteList.length > 0 && (
              <div style={{ borderTop: `1px solid ${c.line}` }}>
                <div style={{ padding: "10px 18px", ...headerCell, background: "#1A1A17" }}>PENDING INVITES</div>
                {inviteList.map(([key, inv]) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", borderTop: `1px solid ${c.line}` }}>
                    <div style={{ fontSize: 13 }}>
                      {inv.email}
                      <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: c.accent, marginLeft: 10 }}>{(inv.role || "viewer").toUpperCase()}</span>
                    </div>
                    <button onClick={() => revokeInvite(key, inv.email)} style={{ background: "transparent", border: "none", color: c.busy, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ background: c.panel, border: `1px solid ${c.line}`, borderRadius: 6, overflow: "hidden" }} className="sws-table">
          <div style={{ padding: "12px 18px", borderBottom: `1px solid ${c.line}`, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontFamily: mono, fontSize: 14, fontWeight: 600 }}>People</span>
            <span style={{ fontSize: 12, color: c.dim }}>{userList.length} accounts</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: columns, gap: 12, padding: "10px 18px", borderBottom: `1px solid ${c.line}`, background: "#1A1A17" }}>
            <div style={headerCell}>EMAIL</div>
            <div style={headerCell}>ROLE</div>
            <div style={headerCell}>LAST ACTIVE</div>
          </div>

          {userList.map(([uid, u]) => (
            <div key={uid} style={{ display: "grid", gridTemplateColumns: columns, gap: 12, alignItems: "center", padding: "12px 18px", borderBottom: `1px solid ${c.line}` }}>
              <div style={{ fontSize: 13 }}>
                {u.email}
                {uid === myUid && <span style={{ color: c.dim, fontSize: 11.5 }}> (you)</span>}
              </div>
              <div>
                {isManager ? (
                  <select value={u.role || "viewer"} onChange={(e) => changeRole(uid, e.target.value)} style={{ ...inputStyle, height: 32 }}>
                    <option value="viewer">Viewer</option>
                    <option value="operator">Operator</option>
                    <option value="manager">Manager</option>
                  </select>
                ) : (
                  <span style={{ fontFamily: mono, fontSize: 11.5, fontWeight: 600, color: c.accent }}>{(u.role || "viewer").toUpperCase()}</span>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: c.dim }}>{u.lastActive ? new Date(u.lastActive).toLocaleString() : "—"}</div>
            </div>
          ))}
        </div>

        {status && <div style={{ fontSize: 12.5, color: c.dim }}>{status}</div>}
      </div>
    </>
  );
}

export default Users;
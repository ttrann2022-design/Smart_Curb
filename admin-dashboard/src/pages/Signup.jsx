import { useState } from "react";
import { createUserWithEmailAndPassword, deleteUser } from "firebase/auth";
import { ref, get } from "firebase/database";
import { Link, useNavigate } from "react-router-dom";
import { auth, database, emailKey } from "../firebase";
import { c, mono } from "../theme";
import logo from "../assets/smartcurb-logo.jpg";

const inputStyle = { height: 44, padding: "0 12px", borderRadius: 6, border: `1px solid ${c.line}`, background: c.panel, color: c.text, fontSize: 14 };

function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setBusy(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const invite = await get(ref(database, `invites/${emailKey(email)}`));

      if (!invite.exists()) {
        await deleteUser(cred.user);
        setError("This email hasn't been invited. Ask a manager to invite you first.");
        setBusy(false);
        return;
      }

      navigate("/overview");
    } catch (err) {
      if (err.code === "auth/email-already-in-use") setError("An account with this email already exists. Try signing in instead.");
      else if (err.code === "auth/invalid-email") setError("That email address isn't valid.");
      else setError("Could not create account: " + err.message);
      setBusy(false);
    }
  };

  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: c.bg }}>
      <form onSubmit={handleSignUp} className="sws-auth-form" style={{ width: 400, background: c.panel, border: `1px solid ${c.line}`, borderRadius: 8, padding: 32, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
          <img
            src={logo}
            alt="Smart Curb"
            style={{ width: 110, height: 110, borderRadius: 12, objectFit: "cover" }}
          />
        </div>

        <h2 style={{ fontFamily: mono, margin: 0 }}>Create your account</h2>
        <div style={{ fontSize: 13, color: c.dim, lineHeight: 1.5 }}>
          Use the email a manager invited. Your access level was set when they invited you.
        </div>

        {error && <div style={{ color: c.busy, fontSize: 13 }}>{error}</div>}

        <input type="email" placeholder="Invited email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} required />
        <input type="password" placeholder="Password (6+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} required />
        <input type="password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={inputStyle} required />

        <button
          type="submit"
          disabled={busy}
          style={{ height: 46, borderRadius: 6, border: "none", fontWeight: 600, fontSize: 14, background: busy ? c.line : c.accent, color: busy ? c.dim : c.onAccent, cursor: busy ? "wait" : "pointer" }}
        >
          {busy ? "Creating account…" : "Create account"}
        </button>

        <div style={{ fontSize: 13, color: c.dim, textAlign: "center" }}>
          Already have an account?{" "}
          <Link to="/" style={{ color: c.accent, fontWeight: 600, textDecoration: "none" }}>Sign in</Link>
        </div>
      </form>
    </div>
  );
}

export default Signup;
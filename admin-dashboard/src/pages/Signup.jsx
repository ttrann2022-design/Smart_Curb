import { useState } from "react";
import { createUserWithEmailAndPassword, deleteUser } from "firebase/auth";
import { ref, get } from "firebase/database";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { auth, database, emailKey } from "../firebase";
import { c, mono } from "../theme";
import AuthShell from "../components/AuthShell";
import { Button, Field, Input, Notice } from "../components/ui";

function Signup() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") || "");
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
      const code = err.code || "";
      if (code.includes("email-already-in-use")) setError("An account with this email already exists. Try signing in instead.");
      else if (code.includes("invalid-email")) setError("That email address isn't valid.");
      else if (code.includes("weak-password")) setError("That password is too weak. Try a longer one.");
      else if (code.includes("network-request-failed")) setError("Can't reach the server. Check your connection and try again.");
      else setError("Couldn't create your account. Try again in a moment.");
      setBusy(false);
    }
  };

  const ready = email.trim() && password && confirm && !busy;

  return (
    <AuthShell>
      <form onSubmit={handleSignUp} className="sws-auth-form" style={{ width: 380, display: "flex", flexDirection: "column", gap: 16 }} noValidate>
        <div>
          <h2 style={{ fontFamily: mono, fontSize: 24, margin: "0 0 6px" }}>Create your account</h2>
          <div style={{ fontSize: 13.5, color: c.dim, lineHeight: 1.5 }}>
            Use the email a manager invited. Your access level was set when they invited you.
          </div>
        </div>

        {error && <Notice tone="busy" role="alert">{error}</Notice>}

        <Field label="Invited email">
          <Input size="lg" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={!email} />
        </Field>
        <Field label="Password" hint="At least 6 characters.">
          <Input size="lg" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus={!!email} />
        </Field>
        <Field label="Confirm password">
          <Input size="lg" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required aria-invalid={confirm && confirm !== password ? true : undefined} />
        </Field>

        <Button type="submit" variant="primary" size="lg" block busy={busy} disabled={!ready}>
          {busy ? "Creating account…" : "Create account"}
        </Button>

        <div style={{ fontSize: 13, color: c.dim, textAlign: "center", marginTop: 4 }}>
          Already have an account?{" "}
          <Link to="/" style={{ color: c.accent, fontWeight: 600, textDecoration: "none" }}>Sign in</Link>
        </div>
      </form>
    </AuthShell>
  );
}

export default Signup;

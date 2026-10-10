import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { auth } from "../firebase";
import { c, mono } from "../theme";
import AuthShell from "../components/AuthShell";
import { Button, Field, Input, Notice } from "../components/ui";

function signInError(code = "") {
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found") || code.includes("invalid-email")) {
    return "That email and password don't match an account.";
  }
  if (code.includes("too-many-requests")) return "Too many attempts. Wait a few minutes, or reset your password.";
  if (code.includes("network-request-failed")) return "Can't reach the server. Check your connection and try again.";
  if (code.includes("user-disabled")) return "This account has been disabled. Ask a manager for help.";
  return "Couldn't sign in. Try again in a moment.";
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const noAccess = params.get("noaccess") === "1";
  const next = location.state?.from && location.state.from !== "/" ? location.state.from : "/overview";

  // Already signed in (and not just bounced for lack of access): go straight in.
  useEffect(() => {
    if (noAccess) return undefined;
    return onAuthStateChanged(auth, (user) => { if (user) navigate(next, { replace: true }); });
  }, [noAccess, navigate, next]);

  const clearNoAccess = () => {
    if (noAccess) setParams({}, { replace: true });
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    clearNoAccess();
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(signInError(err.code));
      setBusy(false);
    }
  };

  const handleReset = async () => {
    setError("");
    setInfo("");
    if (!email.trim()) {
      setError("Type your email above first, then choose Forgot password.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo("If that email has an account, a reset link is on its way. Check your spam folder too.");
    } catch (err) {
      setError(err.code?.includes("invalid-email") ? "That email address isn't valid." : "Couldn't send the reset email. Try again in a moment.");
    }
  };

  return (
    <AuthShell>
      <form onSubmit={handleSignIn} className="sws-auth-form" style={{ width: 380, display: "flex", flexDirection: "column", gap: 16 }} noValidate>
        <div>
          <h2 style={{ fontFamily: mono, fontSize: 24, margin: "0 0 6px" }}>Sign in</h2>
          <div style={{ fontSize: 13.5, color: c.dim }}>Use the work email your manager invited.</div>
        </div>

        {noAccess && (
          <Notice tone="warn" title="No access yet">Your account isn't on the invite list. Ask a manager to invite you, then create your account.</Notice>
        )}
        {error && <Notice tone="busy" role="alert">{error}</Notice>}
        {info && <Notice tone="ok" role="status">{info}</Notice>}

        <Field label="Work email">
          <Input size="lg" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Field>
        <Field label="Password">
          <Input size="lg" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -6 }}>
          <button type="button" onClick={handleReset} className="sws-btn sws-btn-link" style={{ fontSize: 13 }}>
            Forgot password?
          </button>
        </div>

        <Button type="submit" variant="primary" size="lg" block busy={busy} disabled={busy || !email.trim() || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>

        <div style={{ fontSize: 13, color: c.dim, textAlign: "center", marginTop: 4 }}>
          Been invited?{" "}
          <Link to="/signup" style={{ color: c.accent, fontWeight: 600, textDecoration: "none" }}>Create your account</Link>
        </div>
      </form>
    </AuthShell>
  );
}

export default Login;

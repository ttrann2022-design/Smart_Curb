import { useState } from "react";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { auth } from "../firebase";
import { c, mono } from "../theme";

const inputStyle = { height: 44, padding: "0 12px", borderRadius: 6, border: `1px solid ${c.line}`, background: c.panel, color: c.text, fontSize: 14 };

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const noAccess = params.get("noaccess") === "1";

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      navigate("/overview");
    } catch {
      setError("Invalid email or password.");
    }
  };

  const handleReset = async () => {
    setError("");
    setInfo("");
    if (!email.trim()) {
      setError("Type your email above first, then click Forgot password.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo("If that email has an account, a reset link is on its way. Check your spam folder too.");
    } catch (err) {
      setError("Could not send reset email: " + err.message);
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ flex: 1, background: c.side, padding: 56, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 7, background: c.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 16, height: 6, borderRadius: 1, background: c.onAccent }} />
          </div>
          <div>
            <div style={{ fontFamily: mono, fontSize: 14, fontWeight: 600 }}>SMART WHEEL STOP</div>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.2, color: c.dim }}>ADMIN CONSOLE</div>
          </div>
        </div>
        <div>
          <h1 style={{ fontFamily: mono, fontSize: 34, lineHeight: 1.2, margin: "0 0 14px" }}>Every parking space, on one screen.</h1>
          <p style={{ color: c.navText, fontSize: 15, lineHeight: 1.6, margin: 0, maxWidth: 440 }}>
            Built for campuses, stadiums, airports, hospitals, and anywhere else with more cars than places to put them.
          </p>
        </div>
        <div style={{ fontSize: 12, color: c.dim }}>Smart Curb · Parking management platform</div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: c.bg }}>
        <form onSubmit={handleSignIn} style={{ width: 380, display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ fontFamily: mono, margin: "0 0 4px" }}>Sign in</h2>

          {noAccess && (
            <div style={{ fontSize: 13, color: "#FFC078", background: "#26200F", border: "1px solid #4A3A1C", borderRadius: 6, padding: "10px 12px" }}>
              Your account doesn't have access yet. Ask a manager to invite you.
            </div>
          )}
          {error && <div style={{ color: c.busy, fontSize: 13 }}>{error}</div>}
          {info && <div style={{ color: c.open, fontSize: 13 }}>{info}</div>}

          <input type="email" placeholder="Work email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} required />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} required />

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" onClick={handleReset} style={{ background: "transparent", border: "none", color: c.accent, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 }}>
              Forgot password?
            </button>
          </div>

          <button type="submit" style={{ height: 46, borderRadius: 6, background: c.accent, color: c.onAccent, fontWeight: 600, fontSize: 14, border: "none", cursor: "pointer" }}>
            Sign in
          </button>

          <div style={{ fontSize: 13, color: c.dim, textAlign: "center", marginTop: 6 }}>
            Been invited?{" "}
            <Link to="/signup" style={{ color: c.accent, fontWeight: 600, textDecoration: "none" }}>Create your account</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Login;
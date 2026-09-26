import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/overview");
    } catch (err) {
      setError("Invalid email or password.");
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "Archivo, sans-serif" }}>
      <div style={{ flex: 1, background: "#090908", color: "#F2F1EA", padding: "56px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "22px", fontWeight: 600 }}>SMART WHEEL STOP</div>
          <div style={{ fontSize: "11px", color: "#8E8C82", letterSpacing: "1px" }}>ADMIN CONSOLE</div>
        </div>
        <div>
          <h1 style={{ fontSize: "34px", lineHeight: 1.2 }}>Every parking space, on one screen.</h1>
          <p style={{ color: "#B6C0CE" }}>Built for campuses, stadiums, airports, hospitals, and anywhere else with more cars than places to put them.</p>
        </div>
        <div style={{ fontSize: "12px", color: "#6E7C8F" }}>Smart Curb — Parking management platform</div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#0F0F0D" }}>
        <form onSubmit={handleSignIn} style={{ width: "360px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <h2 style={{ color: "#F2F1EA" }}>Sign in</h2>
          {error && <div style={{ color: "#F2694C", fontSize: "13px" }}>{error}</div>}
          <input
            type="email"
            placeholder="Work email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ height: "44px", padding: "0 12px", borderRadius: "6px", border: "1px solid #2B2B25", background: "#171714", color: "#F2F1EA" }}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ height: "44px", padding: "0 12px", borderRadius: "6px", border: "1px solid #2B2B25", background: "#171714", color: "#F2F1EA" }}
            required
          />
          <button
            type="submit"
            style={{ height: "46px", borderRadius: "6px", background: "#C6F24A", color: "#12110F", fontWeight: 600, border: "none", cursor: "pointer" }}
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
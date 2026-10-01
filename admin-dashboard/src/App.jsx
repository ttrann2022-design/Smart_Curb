import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Overview from "./pages/Overview";
import LotDetail from "./pages/LotDetail";
import Units from "./pages/Units";
import Layout from "./components/Layout";
import Users from "./pages/Users";
import DemoControls from "./pages/DemoControls";

function ComingSoon({ title }) {
  return (
    <div style={{ padding: 30 }}>
      <h2 style={{ fontFamily: "'IBM Plex Mono', monospace", margin: 0 }}>{title}</h2>
      <p style={{ color: "#8E8C82" }}>This page is coming in a later sprint.</p>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route element={<Layout />}>
          <Route path="/overview" element={<Overview />} />
          <Route path="/lots" element={<LotDetail />} />
          <Route path="/units" element={<Units />} />
          <Route path="/assistant" element={<ComingSoon title="Assistant" />} />
          <Route path="/analytics" element={<ComingSoon title="Analytics" />} />
          <Route path="/users" element={<Users />} />
          <Route path="/demo" element={<DemoControls />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Overview from "./pages/Overview";
import LotDetail from "./pages/LotDetail";
import Layout from "./components/Layout";

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
        <Route element={<Layout />}>
          <Route path="/overview" element={<Overview />} />
          <Route path="/lots" element={<LotDetail />} />
          <Route path="/units" element={<ComingSoon title="Curb units" />} />
          <Route path="/cameras" element={<ComingSoon title="Cameras" />} />
          <Route path="/assistant" element={<ComingSoon title="Assistant" />} />
          <Route path="/analytics" element={<ComingSoon title="Analytics" />} />
          <Route path="/users" element={<ComingSoon title="Users & roles" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
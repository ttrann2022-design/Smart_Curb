import Sign from "./pages/Sign";
import Assistant from "./pages/Assistant";
import Analytics from "./pages/Analytics";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Overview from "./pages/Overview";
import LotDetail from "./pages/LotDetail";
import Units from "./pages/Units";
import Users from "./pages/Users";
import DemoControls from "./pages/DemoControls";
import Layout from "./components/Layout";
import NotFound from "./pages/NotFound";
import Settings from "./pages/Settings";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/sign" element={<Sign />} />
        <Route element={<Layout />}>
          <Route path="/overview" element={<Overview />} />
          <Route path="/lots" element={<LotDetail />} />
          <Route path="/units" element={<Units />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/users" element={<Users />} />
          <Route path="/simulation" element={<DemoControls />} />
          <Route path="/demo" element={<Navigate to="/simulation" replace />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
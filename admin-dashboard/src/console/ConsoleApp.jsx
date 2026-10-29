import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "../pages/Login";
import ConsoleLayout from "./ConsoleLayout";
import Home from "./Home";
import Customers from "./Customers";
import CustomerDetail from "./CustomerDetail";
import Requests from "./Requests";
import Deployments from "./Deployments";
import ImportLots from "./ImportLots";
import { CONSOLE_SUB } from "./constants";

// The Console Assistant carries its phrase lists and examples, so it loads only when opened.
const ConsoleAssistant = lazy(() => import("./ConsoleAssistant"));
const assistantLoading = <div role="status" className="sws-page-body" style={{ color: "var(--dim)", fontSize: 13 }}>Loading the assistant…</div>;

// What Login says when ConsoleLayout signs out an account without platformAdmins/<uid>.
const NO_ACCESS = { title: "No console access", text: "This account doesn't have console access." };

function ConsoleApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={<Login home="/" hint="Sign in with your Smart Wheel Stop company account." noAccess={NO_ACCESS} signup={false} sub={CONSOLE_SUB} />}
        />
        <Route element={<ConsoleLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/requests" element={<Requests />} />
          <Route path="/deployments" element={<Deployments />} />
          <Route path="/import" element={<ImportLots />} />
          <Route path="/assistant" element={<Suspense fallback={assistantLoading}><ConsoleAssistant /></Suspense>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default ConsoleApp;

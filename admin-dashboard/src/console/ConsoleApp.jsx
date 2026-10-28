import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "../pages/Login";
import ConsoleLayout from "./ConsoleLayout";
import Home from "./Home";
import { CONSOLE_SUB } from "./constants";

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
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default ConsoleApp;

import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/overview" element={<h1>Overview page coming soon</h1>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
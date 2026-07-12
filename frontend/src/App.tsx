import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import Login from "@/pages/Login";
import CommandMap from "@/pages/CommandMap";
import Linkage from "@/pages/Linkage";
import Analytics from "@/pages/Analytics";
import Cases from "@/pages/Cases";
import Briefing from "@/pages/Briefing";

export default function App() {
  return (
    <BrowserRouter basename="/app">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<AppShell />}>
          <Route path="/map" element={<CommandMap />} />
          <Route path="/linkage" element={<Linkage />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/cases" element={<Cases />} />
          <Route path="/briefing" element={<Briefing />} />
        </Route>
        <Route path="*" element={<Navigate to="/map" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

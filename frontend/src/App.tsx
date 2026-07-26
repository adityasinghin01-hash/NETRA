import { lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import Login from "@/pages/Login";
import { pageImports } from "@/lib/pageChunks";

// Route-level code splitting — see lib/pageChunks.ts for the loaders and the idle prefetch.
// Login and AppShell stay eager on purpose: Login is the first paint, and AppShell is the frame
// every page renders into, so splitting either would just add a round-trip to the critical path.
const CommandMap = lazy(pageImports.map);
const Linkage = lazy(pageImports.linkage);
const Analytics = lazy(pageImports.analytics);
const Cases = lazy(pageImports.cases);
const Briefing = lazy(pageImports.briefing);
const DocumentCenter = lazy(pageImports.documents);
const AlertCenter = lazy(pageImports.alerts);

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
          <Route path="/documents" element={<DocumentCenter />} />
          <Route path="/alerts" element={<AlertCenter />} />
        </Route>
        <Route path="*" element={<Navigate to="/map" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import "./styles.css";
import { Shell } from "./layout/Shell";
import { Calculator } from "./pages/Calculator";
import { Dashboard } from "./pages/Dashboard";
import { Drivers } from "./pages/Drivers";
import { Fleet } from "./pages/Fleet";
import { Settings } from "./pages/Settings";
import { Settlements } from "./pages/Settlements";

/* Adresy z krzyżykiem: aplikacja działa z dowolnego katalogu i hostingu
   plików statycznych bez konfiguracji przekierowań. */
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Dashboard />} />
          <Route path="flota" element={<Fleet />} />
          <Route path="kierowcy" element={<Drivers />} />
          <Route path="rozliczenia" element={<Settlements />} />
          <Route path="kalkulator" element={<Calculator />} />
          <Route path="ustawienia" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  </StrictMode>,
);

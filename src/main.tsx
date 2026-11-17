import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import "./styles.css";
import { initSession, useSession } from "./data/session";
import { Shell } from "./layout/Shell";
import { Calculator } from "./pages/Calculator";
import { Dashboard } from "./pages/Dashboard";
import { Drivers } from "./pages/Drivers";
import { Fleet } from "./pages/Fleet";
import { Login, Splash } from "./pages/Login";
import { Settings } from "./pages/Settings";
import { Settlements } from "./pages/Settlements";
import { Toaster } from "./ui/Toast";

initSession();

function App() {
  const phase = useSession((s) => s.phase);
  const recovery = useSession((s) => s.recovery);

  /* Link z e-maila do zmiany hasła loguje na chwilę: najpierw nowe hasło. */
  if (recovery) return <Login initial="new-password" />;
  if (phase === "booting") return <Splash />;
  if (phase === "signed-out") return <Login />;

  /* Adresy z krzyżykiem: aplikacja działa z dowolnego katalogu i hostingu
     plików statycznych bez konfiguracji przekierowań. */
  return (
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
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Toaster />
  </StrictMode>,
);

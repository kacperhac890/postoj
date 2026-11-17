import { StrictMode } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import "./styles.css";
import { initSession, useSession } from "./data/session";
import { Shell } from "./layout/Shell";
import { Calculator } from "./pages/Calculator";
import { Dashboard } from "./pages/Dashboard";
import { Drivers } from "./pages/Drivers";
import { Fleet } from "./pages/Fleet";
import { Issues } from "./pages/Issues";
import { Login, Splash } from "./pages/Login";
import { Schedule } from "./pages/Schedule";
import { Settings } from "./pages/Settings";
import { Settlements } from "./pages/Settlements";
import { Toaster } from "./ui/Toast";

/* Strona nie daje się osadzić w cudzej ramce (ochrona przed podstawionym
   klikaniem). GitHub Pages nie pozwala ustawić nagłówka, więc pilnuje tego skrypt. */
const framed = (() => {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
})();

if (!framed) initSession();

/** Ekrany zarządzania: konto kierowcy wraca na pulpit. Bazę i tak chroni RLS. */
function AdminOnly({ children }: { children: ReactNode }) {
  const role = useSession((s) => s.role);
  return role === "admin" ? children : <Navigate to="/" replace />;
}

function App() {
  const phase = useSession((s) => s.phase);
  const recovery = useSession((s) => s.recovery);
  const invited = useSession((s) => s.invited);

  /* Link z e-maila (zaproszenie, zmiana hasła) loguje na chwilę: najpierw hasło. */
  if (recovery) return <Login initial={invited ? "welcome" : "new-password"} />;
  if (phase === "booting") return <Splash />;
  if (phase === "signed-out") return <Login />;

  /* Adresy z krzyżykiem: aplikacja działa z dowolnego katalogu i hostingu
     plików statycznych bez konfiguracji przekierowań. */
  return (
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Dashboard />} />
          <Route path="grafik" element={<Schedule />} />
          <Route path="flota" element={<Fleet />} />
          <Route path="usterki" element={<Issues />} />
          <Route path="usterki/:id" element={<Issues />} />
          <Route path="kierowcy" element={<AdminOnly><Drivers /></AdminOnly>} />
          <Route path="rozliczenia" element={<Settlements />} />
          <Route path="kalkulator" element={<AdminOnly><Calculator /></AdminOnly>} />
          <Route path="ustawienia" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

if (framed) {
  document.getElementById("root")!.textContent = "Otwórz FlotBase w osobnej karcie przeglądarki.";
} else {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
      <Toaster />
    </StrictMode>,
  );
}

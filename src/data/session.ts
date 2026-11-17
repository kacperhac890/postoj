import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { defaultParams, planScenario } from "../domain/engine";
import { normDriver, normEntry } from "../domain/normalize";
import type { Scenario } from "../domain/engine";
import type { FleetData } from "../domain/seed";
import type { Params } from "../domain/types";
import { useFleet } from "../store/useFleet";
import { toast } from "../ui/Toast";
import { cloudConfigured, describeError, fetchSnapshot, onQueueChange, queueIdle, supabase } from "./cloud";
import { setCloud } from "./mode";

/* Sesja i źródło danych.
   local:  baza nie jest skonfigurowana, wszystko w przeglądarce (jak dotąd).
   guest:  baza jest, ale ktoś ogląda aplikację bez konta. Dane w przeglądarce.
   cloud:  zalogowany użytkownik, dane z bazy. */

export type Mode = "local" | "guest" | "cloud";
export type Phase = "booting" | "signed-out" | "loading" | "ready" | "error";

interface SessionState {
  mode: Mode;
  phase: Phase;
  user: { id: string; email: string } | null;
  /** Użytkownik wszedł z linku do zmiany hasła. */
  recovery: boolean;
  loadError: string | null;
  /** Zapisy w drodze do bazy i ostatni błąd. */
  pending: number;
  syncError: string | null;
}

export const useSession = create<SessionState>(() => ({
  mode: cloudConfigured ? "cloud" : "local",
  phase: cloudConfigured ? "booting" : "ready",
  user: null,
  recovery: false,
  loadError: null,
  pending: 0,
  syncError: null,
}));

const GUEST_KEY = "postoj-guest";

const readGuest = () => {
  try {
    return localStorage.getItem(GUEST_KEY) === "1";
  } catch {
    return false;
  }
};

const writeGuest = (on: boolean) => {
  try {
    if (on) localStorage.setItem(GUEST_KEY, "1");
    else localStorage.removeItem(GUEST_KEY);
  } catch {
    /* Prywatne okno bez dostępu do pamięci: tryb gościa tylko do odświeżenia. */
  }
};

let currentUser: string | null = null;
let lastFetch = 0;
let reconcileAfterError = false;

function applySnapshot(s: Awaited<ReturnType<typeof fetchSnapshot>>) {
  useFleet.setState({
    vehicles: s.vehicles,
    drivers: s.drivers,
    entries: s.entries,
    params: { ...defaultParams, ...(s.params ?? {}) },
    scenario: { ...planScenario, ...(s.scenario ?? {}) },
    demo: s.demo,
  });
  lastFetch = Date.now();
}

async function loadAccount(session: Session) {
  currentUser = session.user.id;
  /* Od tej chwili zmiany nie nadpisują danych zapisanych w przeglądarce. */
  setCloud(true);
  useSession.setState({
    mode: "cloud",
    phase: "loading",
    loadError: null,
    user: { id: session.user.id, email: session.user.email ?? "" },
  });
  try {
    const snap = await fetchSnapshot();
    if (currentUser !== session.user.id) return;
    applySnapshot(snap);
    useSession.setState({ phase: "ready" });
  } catch (err) {
    if (currentUser !== session.user.id) return;
    useSession.setState({ phase: "error", loadError: describeError(err) });
  }
}

function toSignedOut() {
  currentUser = null;
  setCloud(false);
  /* Wracają dane zapisane w tej przeglądarce sprzed zalogowania. */
  void useFleet.persist.rehydrate();
  const guest = readGuest();
  useSession.setState({
    mode: guest ? "guest" : "cloud",
    phase: guest ? "ready" : "signed-out",
    user: null,
    recovery: false,
    loadError: null,
  });
}

/** Ponowne pobranie danych konta, np. po błędzie zapisu albo powrocie do karty. */
export async function refreshAccount(silent = true) {
  const { mode, phase } = useSession.getState();
  if (mode !== "cloud" || !currentUser || (phase !== "ready" && phase !== "error")) return;
  if (!queueIdle()) return;
  const user = currentUser;
  if (!silent) useSession.setState({ phase: "loading", loadError: null });
  try {
    const snap = await fetchSnapshot();
    if (currentUser !== user || !queueIdle()) return;
    applySnapshot(snap);
    useSession.setState({ phase: "ready", loadError: null });
  } catch (err) {
    if (!silent) useSession.setState({ phase: "error", loadError: describeError(err) });
  }
}

export function initSession() {
  if (!supabase) return;

  onQueueChange(({ pending, error }) => {
    useSession.setState({ pending, syncError: error });
    if (error) reconcileAfterError = true;
    /* Po nieudanym zapisie ekran pokazuje coś, czego nie ma w bazie.
       Gdy kolejka się opróżni, pobieramy stan z bazy. */
    if (pending === 0 && reconcileAfterError) {
      reconcileAfterError = false;
      void refreshAccount();
    }
  });

  supabase.auth.onAuthStateChange((event, session) => {
    /* Wywołania Supabase wewnątrz tego callbacku mogą się zakleszczyć,
       więc właściwą obsługę odkładamy na następny takt. */
    window.setTimeout(() => {
      if (event === "PASSWORD_RECOVERY") useSession.setState({ recovery: true });
      if (session) {
        if (session.user.id !== currentUser) {
          writeGuest(false);
          void loadAccount(session);
        } else if (event === "USER_UPDATED") {
          useSession.setState({ user: { id: session.user.id, email: session.user.email ?? "" } });
        }
      } else if (currentUser !== null || useSession.getState().phase === "booting") {
        toSignedOut();
      }
    }, 0);
  });

  /* Dane mogły się zmienić na innym urządzeniu. */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - lastFetch > 60_000) void refreshAccount();
  });
}

/* ------------------------------------------------------------------
   Akcje konta
   ------------------------------------------------------------------ */

const redirectTo = () => `${window.location.origin}${window.location.pathname}`;

function client() {
  if (!supabase) throw new Error("Baza danych nie jest skonfigurowana.");
  return supabase;
}

export async function signIn(email: string, password: string) {
  const { error } = await client().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** Zwraca true, gdy konto wymaga potwierdzenia adresu e-mail. */
export async function signUp(email: string, password: string) {
  const { data, error } = await client().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: redirectTo() },
  });
  if (error) throw error;
  /* Supabase nie zdradza, czy adres jest zajęty: zwraca użytkownika bez tożsamości. */
  if (data.user && data.user.identities && data.user.identities.length === 0)
    throw new Error("User already registered");
  return !data.session;
}

export async function sendReset(email: string) {
  const { error } = await client().auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
  if (error) throw error;
}

export async function setNewPassword(password: string) {
  const { error } = await client().auth.updateUser({ password });
  if (error) throw error;
  useSession.setState({ recovery: false });
}

export async function signOut() {
  writeGuest(false);
  await client().auth.signOut();
  toast.ok("Wylogowano.");
}

export function continueAsGuest() {
  writeGuest(true);
  setCloud(false);
  useSession.setState({ mode: "guest", phase: "ready" });
}

export function leaveGuest() {
  writeGuest(false);
  useSession.setState({ mode: "cloud", phase: "signed-out" });
}

/* ------------------------------------------------------------------
   Dane z przeglądarki przy pierwszym logowaniu
   ------------------------------------------------------------------ */

export interface LocalCopy extends FleetData {
  params: Params;
  scenario: Scenario;
}

/** Dane zapisane w tej przeglądarce, jeśli są i nie są przykładowe. */
export function readLocalCopy(): LocalCopy | null {
  try {
    const raw = localStorage.getItem("postoj-v1");
    if (!raw) return null;
    const s = JSON.parse(raw)?.state;
    if (!s || s.demo) return null;
    if (!Array.isArray(s.vehicles) || !Array.isArray(s.drivers) || !Array.isArray(s.entries)) return null;
    if (s.vehicles.length + s.drivers.length + s.entries.length === 0) return null;
    return {
      vehicles: s.vehicles,
      drivers: s.drivers.map(normDriver),
      entries: s.entries.map(normEntry),
      params: { ...defaultParams, ...(s.params ?? {}) },
      scenario: { ...planScenario, ...(s.scenario ?? {}) },
    };
  } catch {
    return null;
  }
}

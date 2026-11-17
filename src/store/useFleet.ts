import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { api, enqueue } from "../data/cloud";
import { isCloud } from "../data/mode";
import { defaultParams, planScenario } from "../domain/engine";
import type { Scenario } from "../domain/engine";
import { normDriver, normEntry } from "../domain/normalize";
import { demoData } from "../domain/seed";
import type { FleetData } from "../domain/seed";
import type { Driver, Entry, Params, Vehicle } from "../domain/types";
import { toast } from "../ui/Toast";

/* Stan aplikacji. Bez konta żyje w przeglądarce (localStorage).
   Po zalogowaniu ekran zmienia się od razu, a zmiana idzie w tle do bazy
   (kolejka w data/cloud.ts). Gdy zapis się nie uda, pojawia się komunikat,
   a stan jest pobierany z bazy od nowa. */

const sync = (op: Parameters<typeof enqueue>[0]) => {
  if (!isCloud()) return;
  void enqueue(op, (msg) => toast.error(`Nie zapisano zmiany. ${msg}`));
};

/* Stawki i suwaki kalkulatora zmieniają się przy każdym znaku i ruchu,
   więc do bazy trafiają zbiorczo, chwilę po ostatniej zmianie. */
let settingsTimer: number | undefined;
const flushSettings = () => {
  if (settingsTimer === undefined) return;
  window.clearTimeout(settingsTimer);
  settingsTimer = undefined;
  const { params, scenario, demo } = useFleet.getState();
  sync(() => api.saveSettings(params, scenario, demo));
};
const scheduleSettings = () => {
  if (!isCloud()) return;
  window.clearTimeout(settingsTimer);
  settingsTimer = window.setTimeout(flushSettings, 700);
};
if (typeof document !== "undefined")
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSettings();
  });

const replaceRemote = () => {
  const { vehicles, drivers, entries, params, scenario, demo } = useFleet.getState();
  window.clearTimeout(settingsTimer);
  settingsTimer = undefined;
  sync(() => api.replaceAll({ vehicles, drivers, entries }, params, scenario, demo));
};

/* Zalogowany użytkownik nie nadpisuje danych tej przeglądarki: po
   wylogowaniu wracają takie, jakie były. */
const localOnly = createJSONStorage(() => ({
  getItem: (k: string) => localStorage.getItem(k),
  setItem: (k: string, v: string) => {
    if (!isCloud()) localStorage.setItem(k, v);
  },
  removeItem: (k: string) => localStorage.removeItem(k),
}));

interface FleetState extends FleetData {
  params: Params;
  scenario: Scenario;
  /** Czy w aplikacji są jeszcze dane przykładowe. */
  demo: boolean;

  saveVehicle: (v: Vehicle) => void;
  removeVehicle: (id: string) => void;
  saveDriver: (d: Driver) => void;
  removeDriver: (id: string) => void;
  saveEntry: (e: Entry) => void;
  removeEntry: (id: string) => void;
  setPaid: (ids: string[], paid: boolean) => void;
  setParams: (patch: Partial<Params>) => void;
  resetParams: () => void;
  setScenario: (patch: Partial<Scenario>) => void;
  loadDemo: () => void;
  clearAll: () => void;
  importData: (data: unknown) => boolean;
}

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const upsert = <T extends { id: string }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id)
    ? list.map((x) => (x.id === item.id ? item : x))
    : [...list, item];

const isList = (v: unknown): v is Array<Record<string, unknown>> =>
  Array.isArray(v) && v.every((x) => x !== null && typeof x === "object" && "id" in x);

export const useFleet = create<FleetState>()(
  persist(
    (set) => ({
      ...demoData(),
      params: defaultParams,
      scenario: planScenario,
      demo: true,

      saveVehicle: (v) => {
        set((s) => ({ vehicles: upsert(s.vehicles, v) }));
        sync(() => api.upsertVehicle(v));
      },
      removeVehicle: (id) => {
        set((s) => ({
          vehicles: s.vehicles.filter((v) => v.id !== id),
          /* Kierowcy usuniętego auta zostają, tylko bez przypisania. */
          drivers: s.drivers.map((d) => (d.vehicleId === id ? { ...d, vehicleId: null } : d)),
        }));
        sync(() => api.deleteVehicle(id));
      },

      saveDriver: (d) => {
        set((s) => ({ drivers: upsert(s.drivers, d) }));
        sync(() => api.upsertDriver(d));
      },
      removeDriver: (id) => {
        set((s) => ({
          drivers: s.drivers.filter((d) => d.id !== id),
          entries: s.entries.filter((e) => e.driverId !== id),
        }));
        sync(() => api.deleteDriver(id));
      },

      saveEntry: (e) => {
        set((s) => ({ entries: upsert(s.entries, e) }));
        sync(() => api.upsertEntry(e));
      },
      removeEntry: (id) => {
        set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
        sync(() => api.deleteEntry(id));
      },
      setPaid: (ids, paid) => {
        if (ids.length === 0) return;
        set((s) => ({
          entries: s.entries.map((e) => (ids.includes(e.id) ? { ...e, paid } : e)),
        }));
        sync(() => api.setPaid(ids, paid));
      },

      setParams: (patch) => {
        set((s) => ({ params: { ...s.params, ...patch } }));
        scheduleSettings();
      },
      resetParams: () => {
        set({ params: defaultParams });
        scheduleSettings();
      },
      setScenario: (patch) => {
        set((s) => ({ scenario: { ...s.scenario, ...patch } }));
        scheduleSettings();
      },

      loadDemo: () => {
        set({ ...demoData(), demo: true });
        replaceRemote();
      },
      clearAll: () => {
        set({ vehicles: [], drivers: [], entries: [], demo: false });
        replaceRemote();
      },

      importData: (data) => {
        if (data === null || typeof data !== "object") return false;
        const d = data as Record<string, unknown>;
        if (!isList(d.vehicles) || !isList(d.drivers) || !isList(d.entries)) return false;
        set((s) => ({
          vehicles: d.vehicles as unknown as Vehicle[],
          drivers: (d.drivers as unknown as Driver[]).map(normDriver),
          entries: (d.entries as unknown as Entry[]).map(normEntry),
          /* Parametry z pliku nakładamy na domyślne: starsza kopia nie może
             zostawić pustych pól po dodaniu nowego parametru. */
          params:
            d.params && typeof d.params === "object"
              ? { ...defaultParams, ...(d.params as Partial<Params>) }
              : s.params,
          scenario:
            d.scenario && typeof d.scenario === "object"
              ? { ...planScenario, ...(d.scenario as Partial<Scenario>) }
              : s.scenario,
          demo: false,
        }));
        replaceRemote();
        return true;
      },
    }),
    {
      name: "postoj-v1",
      version: 1,
      storage: localOnly,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<FleetState>;
        return {
          ...current,
          ...p,
          ...(p.drivers ? { drivers: p.drivers.map(normDriver) } : {}),
          ...(p.entries ? { entries: p.entries.map(normEntry) } : {}),
          params: { ...defaultParams, ...p.params },
          scenario: { ...planScenario, ...p.scenario },
        };
      },
    },
  ),
);

/** Kopia danych do pliku. */
export function exportSnapshot() {
  const { vehicles, drivers, entries, params, scenario } = useFleet.getState();
  return { app: "postoj", version: 1, exportedAt: new Date().toISOString(), vehicles, drivers, entries, params, scenario };
}

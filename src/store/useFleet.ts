import { create } from "zustand";
import { persist } from "zustand/middleware";
import { defaultParams, planScenario } from "../domain/engine";
import type { Scenario } from "../domain/engine";
import { demoData } from "../domain/seed";
import type { FleetData } from "../domain/seed";
import type { Driver, Entry, Params, Vehicle } from "../domain/types";

/* Cały stan aplikacji żyje w przeglądarce (localStorage). Nie ma serwera,
   więc dane nie opuszczają urządzenia. Kopię robi się eksportem do pliku. */

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

      saveVehicle: (v) => set((s) => ({ vehicles: upsert(s.vehicles, v) })),
      removeVehicle: (id) =>
        set((s) => ({
          vehicles: s.vehicles.filter((v) => v.id !== id),
          /* Kierowcy usuniętego auta zostają, tylko bez przypisania. */
          drivers: s.drivers.map((d) => (d.vehicleId === id ? { ...d, vehicleId: null } : d)),
        })),

      saveDriver: (d) => set((s) => ({ drivers: upsert(s.drivers, d) })),
      removeDriver: (id) =>
        set((s) => ({
          drivers: s.drivers.filter((d) => d.id !== id),
          entries: s.entries.filter((e) => e.driverId !== id),
        })),

      saveEntry: (e) => set((s) => ({ entries: upsert(s.entries, e) })),
      removeEntry: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
      setPaid: (ids, paid) =>
        set((s) => ({
          entries: s.entries.map((e) => (ids.includes(e.id) ? { ...e, paid } : e)),
        })),

      setParams: (patch) => set((s) => ({ params: { ...s.params, ...patch } })),
      resetParams: () => set({ params: defaultParams }),
      setScenario: (patch) => set((s) => ({ scenario: { ...s.scenario, ...patch } })),

      loadDemo: () => set({ ...demoData(), demo: true }),
      clearAll: () => set({ vehicles: [], drivers: [], entries: [], demo: false }),

      importData: (data) => {
        if (data === null || typeof data !== "object") return false;
        const d = data as Record<string, unknown>;
        if (!isList(d.vehicles) || !isList(d.drivers) || !isList(d.entries)) return false;
        set((s) => ({
          vehicles: d.vehicles as unknown as Vehicle[],
          drivers: d.drivers as unknown as Driver[],
          entries: d.entries as unknown as Entry[],
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
        return true;
      },
    }),
    {
      name: "postoj-v1",
      version: 1,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<FleetState>;
        return {
          ...current,
          ...p,
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

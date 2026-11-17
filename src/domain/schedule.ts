import { parseDate, toIso } from "./format";
import type { Assignment, Duty, Vehicle } from "./types";
import { weekKey, weekStart } from "./week";

/* Grafik: na każdy dzień tygodnia, każde auto i każdą zmianę (dniówka,
   nocka) wpisuje się kierowcę. Kierowca nie ma stałego auta: auto
   w rozliczeniu tygodnia wynika z tego, na czym jeździł najczęściej. */

export const DUTIES: Duty[] = ["day", "night"];

export const DUTY_LABEL: Record<Duty, string> = { day: "Dniówka", night: "Nocka" };
export const DUTY_SHORT: Record<Duty, string> = { day: "D", night: "N" };

const dayName = new Intl.DateTimeFormat("pl-PL", { weekday: "short" });
const dayLong = new Intl.DateTimeFormat("pl-PL", { weekday: "long" });
const dayNum = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "numeric" });

/** Siedem dat tygodnia, od poniedziałku. */
export function weekDates(week: string): string[] {
  const start = weekStart(week);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return toIso(d);
  });
}

export const dayLabel = (iso: string) => {
  const d = parseDate(iso);
  return { short: dayName.format(d).replace(".", ""), long: dayLong.format(d), date: dayNum.format(d) };
};

export const weekOfDate = (iso: string) => weekKey(parseDate(iso));

export const slotKey = (date: string, vehicleId: string, duty: Duty) => `${date}|${vehicleId}|${duty}`;
export const keyOf = (a: Assignment) => slotKey(a.date, a.vehicleId, a.duty);

export function addDays(iso: string, days: number) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

/** Wpisy grafiku z danego tygodnia. */
export function inWeek(list: Assignment[], week: string) {
  const days = new Set(weekDates(week));
  return list.filter((a) => days.has(a.date));
}

/** Mapa pole → kierowca, do szybkiego odczytu w siatce. */
export function slotMap(list: Assignment[]) {
  return new Map(list.map((a) => [keyOf(a), a.driverId]));
}

export interface DriverWeek {
  total: number;
  day: number;
  night: number;
  /** Auta z liczbą zmian, od najczęstszego. */
  cars: Array<{ vehicleId: string; count: number }>;
}

/** Ile zmian i na jakich autach ma każdy kierowca w tygodniu. */
export function driverWeeks(list: Assignment[], week: string): Map<string, DriverWeek> {
  const out = new Map<string, DriverWeek>();
  for (const a of inWeek(list, week)) {
    const w = out.get(a.driverId) ?? { total: 0, day: 0, night: 0, cars: [] };
    w.total += 1;
    w[a.duty] += 1;
    const car = w.cars.find((c) => c.vehicleId === a.vehicleId);
    if (car) car.count += 1;
    else w.cars.push({ vehicleId: a.vehicleId, count: 1 });
    out.set(a.driverId, w);
  }
  for (const w of out.values()) w.cars.sort((a, b) => b.count - a.count);
  return out;
}

/** Auto, na którym kierowca jeździł w tygodniu najczęściej. */
export function mainVehicle(list: Assignment[], week: string, driverId: string): string | null {
  return driverWeeks(list, week).get(driverId)?.cars[0]?.vehicleId ?? null;
}

export type Conflict = "double" | "rest";

/**
 * Problemy w grafiku:
 * double: ten sam kierowca na tej samej zmianie w dwóch autach,
 * rest: dniówka zaraz po nocce albo nocka i dniówka tego samego dnia (brak odpoczynku).
 */
export function conflicts(list: Assignment[]): Map<string, Conflict> {
  const out = new Map<string, Conflict>();
  const byDriver = new Map<string, Assignment[]>();
  for (const a of list) byDriver.set(a.driverId, [...(byDriver.get(a.driverId) ?? []), a]);

  for (const own of byDriver.values()) {
    const at = new Map<string, Assignment[]>();
    for (const a of own) {
      const k = `${a.date}|${a.duty}`;
      at.set(k, [...(at.get(k) ?? []), a]);
    }
    for (const group of at.values()) if (group.length > 1) group.forEach((a) => out.set(keyOf(a), "double"));

    for (const a of own) {
      if (out.has(keyOf(a))) continue;
      const tired =
        a.duty === "day"
          ? at.has(`${addDays(a.date, -1)}|night`) || at.has(`${a.date}|night`)
          : at.has(`${a.date}|day`);
      if (tired) out.set(keyOf(a), "rest");
    }
  }
  return out;
}

/** Kopia tygodnia: te same auta, zmiany i kierowcy przesunięci o tydzień. */
export function copyWeek(list: Assignment[], from: string, to: string, vehicles: Vehicle[]): Assignment[] {
  const ok = new Set(vehicles.map((v) => v.id));
  const shift = Math.round((weekStart(to).getTime() - weekStart(from).getTime()) / 86_400_000);
  return inWeek(list, from)
    .filter((a) => ok.has(a.vehicleId))
    .map((a) => ({ ...a, date: addDays(a.date, shift) }));
}

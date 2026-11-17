import { toIso } from "./format";
import type { Driver, Entry, Mode, PrepKey, Vehicle } from "./types";
import { currentWeek, shiftWeek } from "./week";

/* Dane przykładowe. Wymyślone, oznaczone w aplikacji i usuwalne jednym
   przyciskiem. Służą tylko temu, żeby dało się obejrzeć wszystkie ekrany. */

/* Deterministyczny generator: przykładowe liczby nie skaczą przy odświeżeniu. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const inDays = (today: Date, days: number) => {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  return toIso(d);
};

const ready: Record<PrepKey, boolean> = {
  inspection: true,
  registration: true,
  marking: true,
  extract: true,
  meter: true,
};

export interface FleetData {
  vehicles: Vehicle[];
  drivers: Driver[];
  entries: Entry[];
}

export function demoData(today = new Date()): FleetData {
  const car = (
    n: number,
    plate: string,
    mode: Mode,
    leaseNet: number,
    over: Partial<Vehicle> = {},
  ): Vehicle => ({
    id: `demo-v${n}`,
    plate,
    model: "Toyota Corolla LPG",
    year: 2024,
    mode,
    leaseNet,
    insurance: 550,
    serviceGross: 400,
    status: "active",
    inspectionDue: inDays(today, 120 + n * 23),
    insuranceDue: inDays(today, 200 + n * 17),
    prep: ready,
    ...over,
  });

  const vehicles: Vehicle[] = [
    car(1, "ZS 4127K", "commission", 850, { year: 2023 }),
    car(2, "ZS 5093L", "commission", 1100, { insuranceDue: inDays(today, 21) }),
    car(3, "ZS 6310M", "commission", 1100),
    car(4, "ZS 7754N", "commission", 1100, { inspectionDue: inDays(today, 9) }),
    car(5, "ZS 8126P", "commission", 1100),
    car(6, "ZS 8490S", "commission", 1100, { year: 2025 }),
    car(7, "ZS 9048R", "rental", 1100),
    car(8, "ZS 9215U", "rental", 1100, { year: 2025 }),
    car(9, "ZS 9677W", "rental", 1100, { year: 2025 }),
    car(10, "ZS 0375T", "commission", 1100, {
      year: 2025,
      status: "idle",
      prep: { inspection: true, registration: true, marking: false, extract: false, meter: false },
    }),
  ];

  const person = (
    n: number,
    name: string,
    student: boolean,
    vehicle: number | null,
    shift: Driver["shift"],
    active = true,
  ): Driver => ({
    id: `demo-d${n}`,
    name,
    phone: "",
    student,
    vehicleId: vehicle ? `demo-v${vehicle}` : null,
    shift,
    active,
    owner: false,
  });

  const drivers: Driver[] = [
    person(1, "Marta W.", true, 1, "day"),
    person(2, "Igor M.", false, 1, "night"),
    person(3, "Oliwia P.", true, 2, "day"),
    person(4, "Kuba S.", true, 2, "night"),
    person(5, "Tomasz K.", false, 3, "day"),
    person(6, "Natalia D.", true, 3, "night"),
    person(7, "Wiktor B.", true, 4, "day"),
    person(8, "Paweł Z.", false, 4, "night"),
    person(9, "Zuzanna F.", true, 5, "day"),
    person(10, "Filip N.", true, 5, "night"),
    person(11, "Ewa J.", false, 6, "day"),
    person(12, "Bartek O.", true, 6, "night"),
    person(13, "Daria L.", false, 7, "flex"),
    person(14, "Marek G.", false, 8, "flex"),
    person(15, "Roman T.", false, 9, "flex"),
    person(16, "Julia R.", true, null, "flex"),
    person(17, "Adam C.", false, null, "day", false),
  ];

  const rand = mulberry32(20261116);
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const half = (v: number) => Math.round(v * 2) / 2;

  const entries: Entry[] = [];
  const thisWeek = currentWeek();
  const WEEKS = 8;

  for (let back = WEEKS; back >= 1; back -= 1) {
    const week = shiftWeek(thisWeek, -back);
    /* Tygodnie nie są równe: pogoda, wydarzenia w mieście, święta. */
    const season = between(0.86, 1.06);
    drivers.forEach((d, index) => {
      if (!d.vehicleId || !d.active) return;
      const vehicle = vehicles.find((v) => v.id === d.vehicleId);
      if (!vehicle) return;

      const rental = vehicle.mode === "rental";
      const hours = half(rental ? between(46, 60) : between(35, 43));
      const rate = (rental ? between(52, 62) : between(50, 62)) * season;
      const trips = Math.round(hours * between(2.7, 3.6));
      /* Ostatni tydzień: jedno rozliczenie jeszcze niewpisane, część niewypłacona. */
      if (back === 1 && index === 7) return;

      entries.push({
        id: `demo-e${back}-${d.id}`,
        driverId: d.id,
        week,
        mode: vehicle.mode,
        student: d.student,
        owner: false,
        fuelGross: null,
        vehicleId: vehicle.id,
        revenue: Math.round(hours * rate),
        hours,
        trips,
        bonus: 0,
        deduction: back === 2 && index === 4 ? 150 : 0,
        paid: back > 1 || index < 3,
      });
    });
  }

  return { vehicles, drivers, entries };
}

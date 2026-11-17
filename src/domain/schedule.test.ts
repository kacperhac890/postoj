import { describe, expect, it } from "vitest";
import { conflicts, copyWeek, driverWeeks, inWeek, mainVehicle, slotKey, weekDates } from "./schedule";
import { demoData } from "./seed";
import type { Assignment, Vehicle } from "./types";

const car = (id: string): Vehicle =>
  ({ id, plate: id, model: "", year: 2024, mode: "commission", leaseNet: 0, insurance: 0, serviceGross: 0, status: "active", inspectionDue: "", insuranceDue: "", prep: {} }) as unknown as Vehicle;

const a = (date: string, vehicleId: string, duty: "day" | "night", driverId: string): Assignment => ({
  date,
  vehicleId,
  duty,
  driverId,
});

describe("grafik", () => {
  it("tydzień ISO to siedem dni od poniedziałku", () => {
    expect(weekDates("2026-W47")).toEqual([
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
    ]);
  });

  it("liczy zmiany kierowcy i wybiera auto, na którym jeździł najczęściej", () => {
    const list = [
      a("2026-11-16", "v1", "day", "d1"),
      a("2026-11-17", "v2", "day", "d1"),
      a("2026-11-18", "v2", "night", "d1"),
      a("2026-11-23", "v1", "day", "d1"), // następny tydzień
    ];
    const w = driverWeeks(list, "2026-W47").get("d1")!;
    expect(w).toMatchObject({ total: 3, day: 2, night: 1 });
    expect(mainVehicle(list, "2026-W47", "d1")).toBe("v2");
    expect(inWeek(list, "2026-W47")).toHaveLength(3);
  });

  it("wykrywa kierowcę na dwóch autach naraz", () => {
    const list = [a("2026-11-16", "v1", "day", "d1"), a("2026-11-16", "v2", "day", "d1")];
    const c = conflicts(list);
    expect(c.get(slotKey("2026-11-16", "v1", "day"))).toBe("double");
    expect(c.get(slotKey("2026-11-16", "v2", "day"))).toBe("double");
  });

  it("wykrywa dniówkę zaraz po nocce, ale nie nockę po dniówce następnego dnia", () => {
    const tired = conflicts([a("2026-11-16", "v1", "night", "d1"), a("2026-11-17", "v1", "day", "d1")]);
    expect(tired.get(slotKey("2026-11-17", "v1", "day"))).toBe("rest");
    const fine = conflicts([a("2026-11-16", "v1", "day", "d1"), a("2026-11-17", "v1", "night", "d1")]);
    expect(fine.size).toBe(0);
  });

  it("kopiuje tydzień o siedem dni i pomija usunięte auta", () => {
    const list = [a("2026-11-16", "v1", "day", "d1"), a("2026-11-22", "gone", "night", "d2")];
    expect(copyWeek(list, "2026-W47", "2026-W48", [car("v1")])).toEqual([a("2026-11-23", "v1", "day", "d1")]);
  });

  it("przykładowy grafik nie ma konfliktów i każdy rozliczony kierowca ma zmiany", () => {
    const d = demoData(new Date(2026, 10, 16));
    expect(conflicts(d.schedule).size).toBe(0);
    const weeks = new Set(d.entries.map((e) => e.week));
    for (const week of weeks) {
      const worked = driverWeeks(d.schedule, week);
      for (const e of d.entries.filter((x) => x.week === week)) expect(worked.has(e.driverId)).toBe(true);
    }
  });
});

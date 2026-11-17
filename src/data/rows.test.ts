import { describe, expect, it } from "vitest";
import { demoData } from "../domain/seed";
import { driverToRow, entryToRow, rowToDriver, rowToEntry, rowToVehicle, vehicleToRow } from "./rows";

/* Dane muszą przejść przez bazę bez zmian: zapis i odczyt dają to samo. */
describe("mapowanie wierszy bazy", () => {
  const data = demoData(new Date(2026, 10, 16));

  it("auta, kierowcy i rozliczenia wracają z bazy bez zmian", () => {
    expect(data.vehicles.map((v) => rowToVehicle(vehicleToRow(v)))).toEqual(data.vehicles);
    expect(data.drivers.map((d) => rowToDriver(driverToRow(d)))).toEqual(data.drivers);
    expect(data.entries.map((e) => rowToEntry(entryToRow(e)))).toEqual(data.entries);
  });

  it("liczby z typu numeric przychodzą jako tekst i są zamieniane na liczby", () => {
    const e = data.entries[0];
    const row = { ...entryToRow(e), revenue: "1234.50", hours: "37.25", trips: "101" };
    const back = rowToEntry(row);
    expect(back.revenue).toBe(1234.5);
    expect(back.hours).toBe(37.25);
    expect(back.trips).toBe(101);
  });

  it("brakujące kroki przygotowania auta są traktowane jako niezrobione", () => {
    const v = rowToVehicle({ ...vehicleToRow(data.vehicles[0]), prep: { inspection: true } });
    expect(v.prep).toEqual({ inspection: true, registration: false, marking: false, extract: false, meter: false });
  });

  it("kierowca bez auta ma null, nie pusty tekst", () => {
    const d = rowToDriver({ ...driverToRow(data.drivers[0]), vehicle_id: null });
    expect(d.vehicleId).toBeNull();
  });
});

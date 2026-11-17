import { describe, expect, it } from "vitest";
import { demoData } from "../domain/seed";
import {
  assignmentToRow,
  driverToRow,
  entryToRow,
  rowToAssignment,
  rowToDriver,
  rowToEntry,
  rowToVehicle,
  vehicleToRow,
} from "./rows";

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

  it("e-mail kierowcy zapisuje się małymi literami i bez spacji", () => {
    const row = driverToRow({ ...data.drivers[0], email: "  Jan.Kowal@Firma.PL " });
    expect(row.email).toBe("jan.kowal@firma.pl");
  });

  it("grafik wraca z bazy bez zmian, także gdy data przychodzi z czasem", () => {
    expect(data.schedule.map((a) => rowToAssignment(assignmentToRow(a)))).toEqual(data.schedule);
    expect(rowToAssignment({ ...assignmentToRow(data.schedule[0]), date: "2026-11-17T00:00:00" }).date).toBe("2026-11-17");
  });
});

describe("nowe pola w bazie", () => {
  const data = demoData(new Date(2026, 10, 16));
  it("właściciel i realne paliwo przechodzą przez bazę", () => {
    const d = { ...data.drivers[0], owner: true };
    const e = { ...data.entries[0], owner: true, fuelGross: 312.4 };
    expect(rowToDriver(driverToRow(d))).toEqual(d);
    expect(rowToEntry(entryToRow(e))).toEqual(e);
    expect(rowToEntry({ ...entryToRow(e), fuel_gross: "312.40" }).fuelGross).toBe(312.4);
  });
});

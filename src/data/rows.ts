import type { Driver, Entry, Mode, PrepKey, Shift, Vehicle, VehicleStatus } from "../domain/types";

/* Zamiana obiektów aplikacji na wiersze tabel i z powrotem.
   Baza używa snake_case i typu numeric, który PostgREST może oddać
   jako tekst, więc każdą liczbę przepuszczamy przez Number(). */

const n = (v: unknown) => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

const PREP: PrepKey[] = ["inspection", "registration", "marking", "extract", "meter"];

export type Row = Record<string, unknown>;

export const vehicleToRow = (v: Vehicle): Row => ({
  id: v.id,
  plate: v.plate,
  model: v.model,
  year: Math.round(n(v.year)),
  mode: v.mode,
  lease_net: n(v.leaseNet),
  insurance: n(v.insurance),
  service_gross: n(v.serviceGross),
  status: v.status,
  inspection_due: v.inspectionDue ?? "",
  insurance_due: v.insuranceDue ?? "",
  prep: v.prep,
});

export const rowToVehicle = (r: Row): Vehicle => {
  const prep = (r.prep ?? {}) as Partial<Record<PrepKey, boolean>>;
  return {
    id: String(r.id),
    plate: String(r.plate ?? ""),
    model: String(r.model ?? ""),
    year: n(r.year),
    mode: r.mode as Mode,
    leaseNet: n(r.lease_net),
    insurance: n(r.insurance),
    serviceGross: n(r.service_gross),
    status: r.status as VehicleStatus,
    inspectionDue: String(r.inspection_due ?? ""),
    insuranceDue: String(r.insurance_due ?? ""),
    prep: Object.fromEntries(PREP.map((k) => [k, Boolean(prep[k])])) as Record<PrepKey, boolean>,
  };
};

export const driverToRow = (d: Driver): Row => ({
  id: d.id,
  name: d.name,
  phone: d.phone,
  student: d.student,
  vehicle_id: d.vehicleId,
  shift: d.shift,
  active: d.active,
});

export const rowToDriver = (r: Row): Driver => ({
  id: String(r.id),
  name: String(r.name ?? ""),
  phone: String(r.phone ?? ""),
  student: Boolean(r.student),
  vehicleId: r.vehicle_id == null ? null : String(r.vehicle_id),
  shift: r.shift as Shift,
  active: Boolean(r.active),
});

export const entryToRow = (e: Entry): Row => ({
  id: e.id,
  driver_id: e.driverId,
  week: e.week,
  mode: e.mode,
  student: e.student,
  vehicle_id: e.vehicleId,
  revenue: n(e.revenue),
  hours: n(e.hours),
  trips: Math.round(n(e.trips)),
  bonus: n(e.bonus),
  deduction: n(e.deduction),
  paid: e.paid,
});

export const rowToEntry = (r: Row): Entry => ({
  id: String(r.id),
  driverId: String(r.driver_id),
  week: String(r.week),
  mode: r.mode as Mode,
  student: Boolean(r.student),
  vehicleId: r.vehicle_id == null ? null : String(r.vehicle_id),
  revenue: n(r.revenue),
  hours: n(r.hours),
  trips: n(r.trips),
  bonus: n(r.bonus),
  deduction: n(r.deduction),
  paid: Boolean(r.paid),
});

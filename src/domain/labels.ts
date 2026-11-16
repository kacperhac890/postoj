import type { Mode, PrepKey, Shift, VehicleStatus } from "./types";

export const MODE_LABEL: Record<Mode, string> = {
  commission: "Na procent",
  rental: "Wynajem",
};

export const SHIFT_LABEL: Record<Shift, string> = {
  day: "Dzienna",
  night: "Nocna",
  flex: "Elastyczna",
};

export const STATUS_LABEL: Record<VehicleStatus, string> = {
  active: "Jeździ",
  service: "W serwisie",
  idle: "Nie jeździ",
};

/** Kroki przygotowania auta do pracy na taxi, w kolejności załatwiania. */
export const PREP_STEPS: Array<{ key: PrepKey; label: string; hint: string }> = [
  { key: "inspection", label: "Badanie techniczne taxi", hint: "Rozszerzony przegląd na stacji kontroli" },
  { key: "registration", label: "Adnotacja TAXI w dowodzie", hint: "Wpis w wydziale komunikacji" },
  { key: "marking", label: "Oznakowanie i wyposażenie", hint: "Lampa, naklejki, cennik, gaśnica" },
  { key: "extract", label: "Wypis z licencji i hologram", hint: "Osobny wypis na każde auto" },
  { key: "meter", label: "Taksometr lub aplikacja z kasą", hint: "Urządzenie albo wirtualna kasa" },
];

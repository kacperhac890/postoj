/* Model danych floty. Wszystkie kwoty w złotych.
   Tam, gdzie ma to znaczenie, nazwa pola mówi, czy kwota jest netto czy brutto. */

/** Sposób rozliczenia auta: procent od utargu albo wynajem kierowcy. */
export type Mode = "commission" | "rental";

export type Shift = "day" | "night" | "flex";

export type VehicleStatus = "active" | "service" | "idle";

/** Kroki przygotowania auta do pracy na taxi. */
export type PrepKey = "inspection" | "registration" | "marking" | "extract" | "meter";

export interface Vehicle {
  id: string;
  plate: string;
  model: string;
  year: number;
  mode: Mode;
  /** Rata leasingu netto za miesiąc. */
  leaseNet: number;
  /** Ubezpieczenie za miesiąc. Zwolnione z VAT, więc brutto = koszt. */
  insurance: number;
  /** Serwis brutto za miesiąc, średnio. */
  serviceGross: number;
  status: VehicleStatus;
  /** Daty w formacie RRRR-MM-DD. */
  inspectionDue: string;
  insuranceDue: string;
  prep: Record<PrepKey, boolean>;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  /** Adres konta kierowcy w aplikacji. Po zalogowaniu widzi grafik, flotę i swoje rozliczenia. */
  email: string;
  /** Student do 26 lat na zleceniu: wyższa stawka, bez ZUS pracodawcy. */
  student: boolean;
  /** Preferowana zmiana. Auto i dni wynikają z grafiku. */
  shift: Shift;
  active: boolean;
  /** Właściciel spółki za kierownicą: bez wypłaty, cały utarg zostaje w spółce. */
  owner: boolean;
}

/** Zmiana w grafiku: dniówka albo nocka. */
export type Duty = "day" | "night";

/** Jedno pole grafiku: dzień, auto i zmiana, na które wpisano kierowcę. */
export interface Assignment {
  /** Data RRRR-MM-DD. Nocka należy do dnia, w którym się zaczyna. */
  date: string;
  vehicleId: string;
  duty: Duty;
  driverId: string;
}

/** Tygodniowe dane kierowcy z aplikacji. */
export interface Entry {
  id: string;
  driverId: string;
  /** Klucz tygodnia ISO, np. 2026-W46. */
  week: string;
  /* Migawka warunków z chwili rozliczenia. Zmiana auta albo statusu
     studenta nie może po cichu przepisywać historii. */
  mode: Mode;
  student: boolean;
  /** Kierowca był w tym tygodniu właścicielem spółki: bez wypłaty. */
  owner: boolean;
  vehicleId: string | null;
  /** Realny koszt paliwa brutto za ten tydzień. Brak (null) = szacunek z ustawień. */
  fuelGross: number | null;
  /** Utarg netto po prowizji aplikacji. */
  revenue: number;
  hours: number;
  trips: number;
  bonus: number;
  deduction: number;
  paid: boolean;
}

export interface Params {
  /* Stawki procentowe kierowców: bazowa i po przekroczeniu progu kursów. */
  studentBase: number;
  studentHigh: number;
  regularBase: number;
  regularHigh: number;
  tripThreshold: number;

  /* Wynajem: czynsz tygodniowy brutto i opłata od utargu. */
  rentBase: number;
  rentReduced: number;
  rentalFee: number;

  /* Koszty pracy. */
  minWage: number;
  minWageTopUp: boolean;
  employerZus: number;

  /* Paliwo aut prowizyjnych: koszt LPG brutto na zmianę o danej długości. */
  lpgPerShiftGross: number;
  lpgShiftHours: number;

  /* Koszty stałe spółki za miesiąc. */
  admin: number;
  boardGross: number;

  vatStd: number;
  cit: number;
  weeksPerMonth: number;
  /** Docelowa liczba godzin pracy auta w tygodniu, do liczenia wykorzystania. */
  targetHoursPerCar: number;
}

import type { Entry, Params, Vehicle } from "./types";

/* ==================================================================
   SILNIK WYLICZEŃ

   Czyste funkcje, bez Reacta i bez stanu. Te same wzory liczą faktyczne
   rozliczenia tygodniowe i model planistyczny, więc plan i wykonanie
   da się uczciwie porównać.

   Wszystko liczone netto: VAT od leasingu, serwisu i LPG traktujemy jako
   w pełni odliczany, a czynsz najmu przeliczamy z brutto na netto.
   To uproszczenie do potwierdzenia z księgowym, nie rozliczenie podatkowe.
   ================================================================== */

export const defaultParams: Params = {
  studentBase: 0.55,
  studentHigh: 0.6,
  regularBase: 0.45,
  regularHigh: 0.5,
  tripThreshold: 120,
  rentBase: 850,
  rentReduced: 700,
  rentalFee: 0.1,
  minWage: 31.4,
  minWageTopUp: true,
  employerZus: 0.2048,
  lpgPerShiftGross: 80,
  lpgShiftHours: 12,
  admin: 1500,
  boardGross: 16305.08,
  vatStd: 0.23,
  cit: 0.09,
  weeksPerMonth: 4.33,
  targetHoursPerCar: 80,
};

const net = (gross: number, p: Params) => gross / (1 + p.vatStd);

/* ------------------------------------------------------------------
   Rozliczenie jednego kierowcy za tydzień
   ------------------------------------------------------------------ */

export interface Settlement {
  reached: boolean;
  /** Stawka procentowa kierowcy. Dla wynajmu 0. */
  rate: number;
  /** Udział kierowcy w utargu. */
  share: number;
  /** Dopłata do minimalnej stawki godzinowej. */
  topUp: number;
  /** Kwota brutto do wypłaty kierowcy (prowizja). */
  payout: number;
  employerZus: number;
  /** Czynsz brutto należny od kierowcy (wynajem). */
  rentGross: number;
  /** Opłata od utargu należna od kierowcy (wynajem). */
  fee: number;
  /** Łączna kwota do zapłaty przez kierowcę (wynajem). */
  dueFromDriver: number;
  lpgNet: number;
  /** Przychód spółki netto z tego rozliczenia. */
  income: number;
  /** Co zostaje spółce po kierowcy i paliwie, przed kosztami auta. */
  margin: number;
  ratePerHour: number;
}

export function settle(e: Entry, p: Params): Settlement {
  const reached = e.trips >= p.tripThreshold;
  const ratePerHour = e.hours > 0 ? e.revenue / e.hours : 0;

  if (e.mode === "rental") {
    const rentGross = reached ? p.rentReduced : p.rentBase;
    const fee = e.revenue * p.rentalFee;
    const income = net(rentGross, p) + fee;
    return {
      reached,
      rate: 0,
      share: 0,
      topUp: 0,
      payout: 0,
      employerZus: 0,
      rentGross,
      fee,
      dueFromDriver: rentGross + fee + e.deduction - e.bonus,
      lpgNet: 0,
      income,
      margin: income + e.deduction - e.bonus,
      ratePerHour,
    };
  }

  const rate = e.student
    ? reached
      ? p.studentHigh
      : p.studentBase
    : reached
      ? p.regularHigh
      : p.regularBase;
  const share = e.revenue * rate;
  const topUp = p.minWageTopUp ? Math.max(0, e.hours * p.minWage - share) : 0;
  const payout = share + topUp + e.bonus - e.deduction;
  const employerZus = e.student ? 0 : (share + topUp + e.bonus) * p.employerZus;
  const lpgNet = net((e.hours / p.lpgShiftHours) * p.lpgPerShiftGross, p);

  return {
    reached,
    rate,
    share,
    topUp,
    payout,
    employerZus,
    rentGross: 0,
    fee: 0,
    dueFromDriver: 0,
    lpgNet,
    income: e.revenue,
    margin: e.revenue - payout - employerZus - lpgNet,
    ratePerHour,
  };
}

/* ------------------------------------------------------------------
   Wynik spółki za tydzień
   ------------------------------------------------------------------ */

export function vehicleMonthlyNet(v: Vehicle, p: Params) {
  return v.leaseNet + v.insurance + net(v.serviceGross, p);
}

export interface WeekResult {
  appRevenue: number;
  income: number;
  driverCost: number;
  lpg: number;
  fixedCars: number;
  overhead: number;
  result: number;
  hours: number;
  trips: number;
  avgRate: number;
  utilization: number;
  count: number;
}

export function weekResult(entries: Entry[], vehicles: Vehicle[], p: Params): WeekResult {
  let appRevenue = 0;
  let income = 0;
  let driverCost = 0;
  let lpg = 0;
  let hours = 0;
  let trips = 0;

  for (const e of entries) {
    const s = settle(e, p);
    appRevenue += e.revenue;
    income += s.income;
    hours += e.hours;
    trips += e.trips;
    lpg += s.lpgNet;
    driverCost +=
      e.mode === "commission" ? s.payout + s.employerZus : e.bonus - e.deduction;
  }

  const fixedCars =
    vehicles.reduce((sum, v) => sum + vehicleMonthlyNet(v, p), 0) / p.weeksPerMonth;
  const overhead = (p.admin + p.boardGross) / p.weeksPerMonth;
  const working = vehicles.filter((v) => v.status === "active").length;
  const capacity = working * p.targetHoursPerCar;

  return {
    appRevenue,
    income,
    driverCost,
    lpg,
    fixedCars,
    overhead,
    result: income - driverCost - lpg - fixedCars - overhead,
    hours,
    trips,
    avgRate: hours > 0 ? appRevenue / hours : 0,
    utilization: capacity > 0 ? hours / capacity : 0,
    count: entries.length,
  };
}

/* ------------------------------------------------------------------
   Model planistyczny floty
   ------------------------------------------------------------------ */

export interface Scenario {
  cars: number;
  rentalCars: number;
  hoursPerCar: number;
  ratePerHour: number;
  /** Jaka część godzin aut prowizyjnych przypada na studentów (0-1). */
  studentShare: number;
  /** Jaka część kierowców wyrabia próg kursów (0-1). */
  thresholdShare: number;
  firstLease: number;
  otherLease: number;
  insurance: number;
  serviceGross: number;
  includeBoard: boolean;
}

export const planScenario: Scenario = {
  cars: 20,
  rentalCars: 8,
  hoursPerCar: 80,
  ratePerHour: 55,
  studentShare: 2 / 3,
  thresholdShare: 0.6,
  firstLease: 850,
  otherLease: 1100,
  insurance: 550,
  serviceGross: 400,
  includeBoard: true,
};

export interface ModelResult {
  commissionCars: number;
  commissionRevenue: number;
  rentNet: number;
  rentalFee: number;
  revenue: number;
  driverShare: number;
  topUp: number;
  employerZus: number;
  lease: number;
  insurance: number;
  service: number;
  lpg: number;
  admin: number;
  board: number;
  costs: number;
  preTax: number;
  cit: number;
  netProfit: number;
  perCar: number;
}

export function model(s: Scenario, p: Params): ModelResult {
  const cars = Math.max(0, Math.round(s.cars));
  const rentalCars = Math.min(cars, Math.max(0, Math.round(s.rentalCars)));
  const commissionCars = cars - rentalCars;
  const hoursPerCarMonth = s.hoursPerCar * p.weeksPerMonth;

  /* Auta prowizyjne */
  const cHours = commissionCars * hoursPerCarMonth;
  const commissionRevenue = cHours * s.ratePerHour;
  const t = s.thresholdShare;

  const groups = [
    { part: s.studentShare, student: true, base: p.studentBase, high: p.studentHigh },
    { part: 1 - s.studentShare, student: false, base: p.regularBase, high: p.regularHigh },
  ];

  let driverShare = 0;
  let topUp = 0;
  let employerZus = 0;

  for (const g of groups) {
    const hours = cHours * g.part;
    const avgRate = t * g.high + (1 - t) * g.base;
    const share = hours * s.ratePerHour * avgRate;

    /* Dopłatę liczymy osobno poniżej i powyżej progu, bo średnia stawka
       ukryłaby kierowców, którym do minimum brakuje. */
    const gap = (rate: number) => Math.max(0, p.minWage - rate * s.ratePerHour);
    const groupTopUp = p.minWageTopUp
      ? hours * (t * gap(g.high) + (1 - t) * gap(g.base))
      : 0;

    driverShare += share;
    topUp += groupTopUp;
    if (!g.student) employerZus += (share + groupTopUp) * p.employerZus;
  }

  const lpg = net((cHours / p.lpgShiftHours) * p.lpgPerShiftGross, p);

  /* Auta wynajmowane */
  const avgRentGross = t * p.rentReduced + (1 - t) * p.rentBase;
  const rentNet = rentalCars * net(avgRentGross, p) * p.weeksPerMonth;
  const rentalFee = rentalCars * hoursPerCarMonth * s.ratePerHour * p.rentalFee;

  /* Koszty aut */
  const lease = cars > 0 ? s.firstLease + (cars - 1) * s.otherLease : 0;
  const insurance = cars * s.insurance;
  const service = cars * net(s.serviceGross, p);
  const board = s.includeBoard ? p.boardGross : 0;

  const revenue = commissionRevenue + rentNet + rentalFee;
  const costs =
    driverShare + topUp + employerZus + lease + insurance + service + lpg + p.admin + board;
  const preTax = revenue - costs;
  const cit = Math.max(0, preTax) * p.cit;
  const netProfit = preTax - cit;

  return {
    commissionCars,
    commissionRevenue,
    rentNet,
    rentalFee,
    revenue,
    driverShare,
    topUp,
    employerZus,
    lease,
    insurance,
    service,
    lpg,
    admin: p.admin,
    board,
    costs,
    preTax,
    cit,
    netProfit,
    perCar: cars > 0 ? netProfit / cars : 0,
  };
}

/** Stawka z aplikacji, przy której spółka wychodzi na zero. Bisekcja. */
export function breakEvenRate(s: Scenario, p: Params): number | null {
  const at = (rate: number) => model({ ...s, ratePerHour: rate }, p).preTax;
  let lo = 0;
  let hi = 400;
  if (at(hi) < 0) return null;
  if (at(lo) >= 0) return 0;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (at(mid) >= 0) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Scenariusz oparty na autach, które faktycznie są we flocie. */
export function scenarioFromFleet(vehicles: Vehicle[], base: Scenario): Scenario {
  if (vehicles.length === 0) return base;
  const avg = (pick: (v: Vehicle) => number) =>
    Math.round(vehicles.reduce((sum, v) => sum + pick(v), 0) / vehicles.length);
  const lease = avg((v) => v.leaseNet);
  return {
    ...base,
    cars: vehicles.length,
    rentalCars: vehicles.filter((v) => v.mode === "rental").length,
    firstLease: lease,
    otherLease: lease,
    insurance: avg((v) => v.insurance),
    serviceGross: avg((v) => v.serviceGross),
  };
}

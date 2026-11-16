import { describe, expect, it } from "vitest";
import { breakEvenRate, defaultParams, model, planScenario, settle } from "./engine";
import type { Entry } from "./types";

const entry = (over: Partial<Entry>): Entry => ({
  id: "e",
  driverId: "d",
  week: "2026-W46",
  mode: "commission",
  student: true,
  vehicleId: "v",
  revenue: 4400,
  hours: 80,
  trips: 130,
  bonus: 0,
  deduction: 0,
  paid: false,
  ...over,
});

describe("model floty", () => {
  /* Liczby kontrolne pochodzą z finalnej kalkulacji w biznesplanie:
     20 aut, 12 na procent, 8 na wynajem, 55 zł/h, 80 h tygodniowo. */
  const r = model(planScenario, defaultParams);

  it("odtwarza przychody z biznesplanu", () => {
    expect(r.commissionRevenue).toBeCloseTo(228624, 2);
    expect(r.rentNet).toBeCloseTo(21403.58, 1);
    expect(r.rentalFee).toBeCloseTo(15241.6, 2);
    expect(r.revenue).toBeCloseTo(265269.18, 1);
  });

  it("odtwarza koszty kierowców", () => {
    expect(r.driverShare).toBeCloseTo(124981.12, 1);
    expect(r.topUp).toBeCloseTo(8202.75, 1);
    expect(r.employerZus).toBeCloseTo(8910.41, 1);
  });

  it("odtwarza koszty aut", () => {
    expect(r.lease).toBe(21750);
    expect(r.insurance).toBe(11000);
    expect(r.service).toBeCloseTo(6504.07, 1);
    expect(r.lpg).toBeCloseTo(22530.08, 1);
  });

  it("daje ten sam zysk po CIT", () => {
    expect(r.preTax).toBeCloseTo(43585.67, 0);
    expect(r.cit).toBeCloseTo(3922.71, 0);
    expect(r.netProfit).toBeCloseTo(39662.96, 0);
  });

  it("nie nalicza CIT od straty", () => {
    const loss = model({ ...planScenario, ratePerHour: 20 }, defaultParams);
    expect(loss.preTax).toBeLessThan(0);
    expect(loss.cit).toBe(0);
  });

  it("znajduje próg rentowności", () => {
    const rate = breakEvenRate(planScenario, defaultParams);
    expect(rate).not.toBeNull();
    const atBreakEven = model({ ...planScenario, ratePerHour: rate! }, defaultParams);
    expect(Math.abs(atBreakEven.preTax)).toBeLessThan(0.5);
    expect(rate!).toBeGreaterThan(35);
    expect(rate!).toBeLessThan(55);
  });
});

describe("rozliczenie tygodniowe", () => {
  it("student po progu dostaje wyższą stawkę", () => {
    const s = settle(entry({}), defaultParams);
    expect(s.reached).toBe(true);
    expect(s.rate).toBe(0.6);
    expect(s.share).toBeCloseTo(2640, 2);
    expect(s.employerZus).toBe(0);
  });

  it("kierowca bez statusu studenta poniżej progu dostaje dopłatę i ZUS", () => {
    const s = settle(entry({ student: false, trips: 90 }), defaultParams);
    expect(s.rate).toBe(0.45);
    expect(s.share).toBeCloseTo(1980, 2);
    /* 80 h x 31,40 = 2512, do minimum brakuje 532 */
    expect(s.topUp).toBeCloseTo(532, 2);
    expect(s.employerZus).toBeCloseTo(2512 * 0.2048, 2);
  });

  it("wynajem: niższy czynsz po progu i 10% od utargu", () => {
    const s = settle(entry({ mode: "rental" }), defaultParams);
    expect(s.rentGross).toBe(700);
    expect(s.fee).toBeCloseTo(440, 2);
    expect(s.dueFromDriver).toBeCloseTo(1140, 2);
    expect(s.income).toBeCloseTo(700 / 1.23 + 440, 2);
    expect(s.lpgNet).toBe(0);
  });

  it("wyłączona dopłata do minimum nie podnosi wypłaty", () => {
    const s = settle(entry({ student: false, trips: 90 }), {
      ...defaultParams,
      minWageTopUp: false,
    });
    expect(s.topUp).toBe(0);
    expect(s.payout).toBeCloseTo(1980, 2);
  });
});

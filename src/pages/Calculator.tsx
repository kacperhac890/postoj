import { useCallback, useMemo } from "react";
import { ProfitCurve } from "../charts/charts";
import { breakEvenRate, model, planScenario, scenarioFromFleet } from "../domain/engine";
import type { Scenario } from "../domain/engine";
import { num1, pct, zl } from "../domain/format";
import { useFleet } from "../store/useFleet";
import { Button, Field, NumberInput, PageHeader, Panel, Row, Toggle, cn } from "../ui/kit";

/** Suwak z polem obok: szybka zmiana palcem, dokładna z klawiatury. */
function Dial({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  percent,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  percent?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      <span className="grid grid-cols-[1fr_6.5rem] items-center gap-3">
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={Math.min(max, Math.max(min, value))}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <NumberInput value={value} onChange={onChange} suffix={suffix} percent={percent} aria-label={label} />
      </span>
    </Field>
  );
}

export function Calculator() {
  const scenario = useFleet((s) => s.scenario);
  const params = useFleet((s) => s.params);
  const vehicles = useFleet((s) => s.vehicles);
  const setScenario = useFleet((s) => s.setScenario);
  const setParams = useFleet((s) => s.setParams);

  const set = (p: Partial<Scenario>) => setScenario(p);

  const result = useMemo(() => model(scenario, params), [scenario, params]);
  const breakEven = useMemo(() => breakEvenRate(scenario, params), [scenario, params]);
  const profitAt = useCallback(
    (rate: number) => model({ ...scenario, ratePerHour: rate }, params).netProfit,
    [scenario, params],
  );

  const cars = Math.max(0, Math.round(scenario.cars));
  const rentalCars = Math.min(cars, Math.max(0, Math.round(scenario.rentalCars)));
  const margin = breakEven !== null ? scenario.ratePerHour - breakEven : null;

  const utilization = [1, 0.9, 0.8, 0.7].map((share) => ({
    share,
    hours: scenario.hoursPerCar * share,
    profit: model({ ...scenario, hoursPerCar: scenario.hoursPerCar * share }, params).netProfit,
  }));

  return (
    <>
      <PageHeader
        title="Kalkulator"
        lead="Model miesięczny floty. Zmień założenia i sprawdź, przy jakiej stawce z aplikacji spółka zarabia, zanim podpiszesz kolejny leasing."
      >
        <Button size="sm" onClick={() => setScenario(planScenario)}>
          Biznesplan 20 aut
        </Button>
        <Button
          size="sm"
          disabled={vehicles.length === 0}
          onClick={() => setScenario(scenarioFromFleet(vehicles, scenario))}
        >
          Moja flota
        </Button>
      </PageHeader>

      {/* Telefon: wynik zawsze na widoku podczas przesuwania suwaków */}
      <div className="sticky top-14 z-20 -mx-4 mb-4 flex items-baseline justify-between gap-3 border-b border-line bg-bg px-4 py-2.5 lg:hidden">
        <span className="text-[0.8125rem] text-ink-2">Zysk netto miesięcznie</span>
        <span
          className={cn(
            "num text-[1.125rem] font-semibold tracking-[-0.01em]",
            result.netProfit < 0 ? "text-red" : "text-green-ink",
          )}
        >
          {zl(result.netProfit)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          <Panel title="Flota i praca">
            <div className="flex flex-col gap-5">
              <Dial label="Liczba aut" value={scenario.cars} onChange={(v) => set({ cars: Math.round(v) })} min={1} max={40} />
              <Dial
                label="W tym na wynajem"
                hint={`${cars - rentalCars} na procent, ${rentalCars} na wynajem`}
                value={rentalCars}
                onChange={(v) => set({ rentalCars: Math.round(v) })}
                min={0}
                max={Math.max(1, cars)}
              />
              <Dial
                label="Godziny pracy auta w tygodniu"
                hint="Dwie zmiany po 10 godzin online przez cały tydzień to około 140 h. W biznesplanie przyjęto 80 h."
                value={scenario.hoursPerCar}
                onChange={(v) => set({ hoursPerCar: v })}
                min={20}
                max={140}
                step={5}
                suffix="h"
              />
              <div>
                <Dial
                  label="Stawka netto na godzinę online"
                  value={scenario.ratePerHour}
                  onChange={(v) => set({ ratePerHour: v })}
                  min={30}
                  max={80}
                  suffix="zł"
                />
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {[
                    { rate: 45, label: "Ostrożnie 45" },
                    { rate: 50, label: "Planowo 50" },
                    { rate: 55, label: "Docelowo 55" },
                  ].map((p) => (
                    <button
                      key={p.rate}
                      type="button"
                      onClick={() => set({ ratePerHour: p.rate })}
                      aria-pressed={scenario.ratePerHour === p.rate}
                      className={cn(
                        "press h-8 rounded-full border px-3 text-[0.8125rem] font-medium",
                        scenario.ratePerHour === p.rate
                          ? "border-green-line bg-green-soft text-green-ink"
                          : "border-line-strong bg-surface text-ink-2 hover:bg-sunken",
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Kierowcy">
            <div className="flex flex-col gap-5">
              <Dial
                label="Godziny aut na procent jeżdżone przez studentów"
                hint={`Student: ${pct(params.studentBase)} lub ${pct(params.studentHigh)}, bez ZUS. Pozostali: ${pct(params.regularBase)} lub ${pct(params.regularHigh)} i ZUS pracodawcy.`}
                value={scenario.studentShare}
                onChange={(v) => set({ studentShare: Math.min(1, Math.max(0, v)) })}
                min={0}
                max={1}
                step={0.01}
                suffix="%"
                percent
              />
              <Dial
                label={`Kierowcy z progiem ${params.tripThreshold} kursów`}
                hint="Po progu rośnie stawka kierowcy na procent i spada czynsz najemcy."
                value={scenario.thresholdShare}
                onChange={(v) => set({ thresholdShare: Math.min(1, Math.max(0, v)) })}
                min={0}
                max={1}
                step={0.01}
                suffix="%"
                percent
              />
              <Toggle
                checked={params.minWageTopUp}
                onChange={(minWageTopUp) => setParams({ minWageTopUp })}
                label="Dopłata do minimalnej stawki godzinowej"
                hint={`Wariant ostrożny: gdy procent daje mniej niż ${num1(params.minWage)} zł za godzinę, spółka dopłaca różnicę. To ustawienie wpływa też na rozliczenia.`}
              />
            </div>
          </Panel>

          <Panel title="Koszty auta" aside="miesięcznie">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Leasing pierwszego auta">
                <NumberInput value={scenario.firstLease} onChange={(firstLease) => set({ firstLease })} suffix="zł" />
              </Field>
              <Field label="Leasing kolejnych">
                <NumberInput value={scenario.otherLease} onChange={(otherLease) => set({ otherLease })} suffix="zł" />
              </Field>
              <Field label="Ubezpieczenie">
                <NumberInput value={scenario.insurance} onChange={(insurance) => set({ insurance })} suffix="zł" />
              </Field>
              <Field label="Serwis brutto">
                <NumberInput value={scenario.serviceGross} onChange={(serviceGross) => set({ serviceGross })} suffix="zł" />
              </Field>
            </div>
            <div className="mt-5">
              <Toggle
                checked={scenario.includeBoard}
                onChange={(includeBoard) => set({ includeBoard })}
                label="Wynagrodzenie zarządu w kosztach"
                hint={`${zl(params.boardGross)} miesięcznie. Kwotę zmienisz w ustawieniach.`}
              />
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-8">
          <Panel>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div className="col-span-2">
                <div className="text-[0.8125rem] text-ink-2">Zysk netto spółki, miesięcznie po CIT</div>
                <div
                  className={cn(
                    "num mt-1 text-[2.25rem] leading-none font-semibold tracking-[-0.025em]",
                    result.netProfit < 0 ? "text-red" : "text-green-ink",
                  )}
                >
                  {zl(result.netProfit)}
                </div>
              </div>
              <div>
                <div className="text-[0.75rem] text-ink-3">Rocznie</div>
                <div className="num text-[1.0625rem] font-semibold text-ink">{zl(result.netProfit * 12)}</div>
              </div>
              <div>
                <div className="text-[0.75rem] text-ink-3">Na jedno auto</div>
                <div className="num text-[1.0625rem] font-semibold text-ink">{zl(result.perCar)}</div>
              </div>
              <div className="col-span-2 border-t border-line pt-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-[0.875rem] text-ink-2">Próg rentowności</span>
                  <span className="num text-[0.9375rem] font-semibold text-ink">
                    {breakEven === null ? "poza zakresem" : `${num1(breakEven)} zł na godzinę`}
                  </span>
                </div>
                {margin !== null ? (
                  <p className={cn("num mt-1 text-[0.8125rem]", margin < 0 ? "text-red" : "text-ink-2")}>
                    {margin >= 0
                      ? `Zapas ${num1(margin)} zł na godzinie. Stawka może spaść o ${pct(margin / scenario.ratePerHour)}, zanim pojawi się strata.`
                      : `Brakuje ${num1(-margin)} zł na godzinie, żeby wyjść na zero.`}
                  </p>
                ) : null}
              </div>
            </div>
          </Panel>

          <Panel title="Zysk a stawka" aside="dotknij wykres, żeby ją ustawić">
            <ProfitCurve
              profitAt={profitAt}
              rate={scenario.ratePerHour}
              breakEven={breakEven}
              onPick={(rate) => set({ ratePerHour: rate })}
            />
          </Panel>

          <Panel title="Rachunek miesiąca" aside="kwoty netto">
            <Row label="Utarg aut na procent" value={zl(result.commissionRevenue)} />
            <Row label="Czynsze najmu" hint="bez VAT" value={zl(result.rentNet)} />
            <Row label={`Opłata ${pct(params.rentalFee)} od utargu najemców`} value={zl(result.rentalFee)} />
            <Row label="Przychody" value={zl(result.revenue)} strong />
            <div className="my-2 border-t border-line" />
            <Row label="Kierowcy, udział w utargu" value={zl(-result.driverShare)} />
            {result.topUp > 0 ? <Row label="Dopłata do minimalnej stawki" value={zl(-result.topUp)} /> : null}
            <Row label="ZUS pracodawcy" value={zl(-result.employerZus)} />
            <Row label="LPG" value={zl(-result.lpg)} />
            <Row label="Leasing" value={zl(-result.lease)} />
            <Row label="Ubezpieczenie" value={zl(-result.insurance)} />
            <Row label="Serwis" value={zl(-result.service)} />
            <Row label="Księgowość i administracja" value={zl(-result.admin)} />
            {result.board > 0 ? <Row label="Zarząd" value={zl(-result.board)} /> : null}
            <Row label="Koszty" value={zl(-result.costs)} strong />
            <div className="my-2 border-t border-line" />
            <Row label="Wynik przed CIT" value={zl(result.preTax)} />
            <Row label={`CIT ${pct(params.cit)}`} value={zl(-result.cit)} />
            <Row
              label="Zysk netto"
              value={zl(result.netProfit)}
              strong
              tone={result.netProfit < 0 ? "red" : "green"}
            />
          </Panel>

          <Panel title="Gdy auta jeżdżą mniej" flush>
            <ul>
              {utilization.map((u) => (
                <li
                  key={u.share}
                  className="flex items-baseline justify-between gap-4 border-b border-line px-4 py-2.5 last:border-b-0 md:px-5"
                >
                  <span className="num text-[0.875rem] text-ink-2">
                    {pct(u.share)} planu, {num1(u.hours)} h na auto
                  </span>
                  <span className={cn("num text-[0.9375rem] font-medium", u.profit < 0 ? "text-red" : "text-ink")}>
                    {zl(u.profit)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <p className="text-[0.75rem] leading-relaxed text-ink-3">
            Model zarządczy, nie rozliczenie podatkowe. Zakłada pełne odliczenie VAT od leasingu, serwisu
            i LPG, CIT {pct(params.cit)} i miesiąc liczony jako {num1(params.weeksPerMonth)} tygodnia. Nie
            obejmuje rezerwy na szkody, opony i przestoje. Założenia potwierdź z księgowym.
          </p>
        </div>
      </div>
    </>
  );
}

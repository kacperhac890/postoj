import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarBlank,
  CalendarCheck,
  Moon,
  Sun,
  Car,
  CheckCircle,
  IdentificationCard,
  Receipt,
  UploadSimple,
  Wrench,
} from "@phosphor-icons/react";
import { readLocalCopy, useSession } from "../data/session";
import { toast } from "../ui/Toast";
import type { Icon } from "@phosphor-icons/react";
import { RateTrack, WeekBars } from "../charts/charts";
import { breakEvenRate, scenarioFromFleet, settle, weekResult } from "../domain/engine";
import { daysUntil, num1, pct, plural, toIso, zl } from "../domain/format";
import { PREP_STEPS } from "../domain/labels";
import { DUTIES, DUTY_LABEL, addDays, dayLabel, driverWeeks, inWeek as inWeekSchedule, keyOf, slotKey } from "../domain/schedule";
import { currentWeek, lastFullWeek, shiftWeek, weekNumber, weekRange } from "../domain/week";
import { useFleet } from "../store/useFleet";
import { WeekSwitcher } from "../ui/WeekSwitcher";
import { Button, Empty, PageHeader, Panel, Plate, cn } from "../ui/kit";
import { Tween } from "../ui/motion";

interface Task {
  icon: Icon;
  text: string;
  detail?: string;
  to: string;
  tone?: "amber" | "red";
}

export function Dashboard() {
  const role = useSession((s) => s.role);
  return role === "admin" ? <FleetDashboard /> : <DriverHome />;
}

function FleetDashboard() {
  const schedule = useFleet((s) => s.schedule);
  const vehicles = useFleet((s) => s.vehicles);
  const drivers = useFleet((s) => s.drivers);
  const entries = useFleet((s) => s.entries);
  const params = useFleet((s) => s.params);
  const scenario = useFleet((s) => s.scenario);
  const loadDemo = useFleet((s) => s.loadDemo);
  const importData = useFleet((s) => s.importData);
  const mode = useSession((s) => s.mode);
  /* Pierwsze logowanie: dane wpisane wcześniej bez konta można przenieść. */
  const localCopy = useMemo(() => (mode === "cloud" ? readLocalCopy() : null), [mode]);

  const [week, setWeek] = useState(lastFullWeek);

  const inWeek = useMemo(() => entries.filter((e) => e.week === week), [entries, week]);
  const r = useMemo(() => weekResult(inWeek, vehicles, params), [inWeek, vehicles, params]);

  /* Próg rentowności dla tej floty i tych godzin: przy jakiej stawce
     z aplikacji tydzień wychodzi na zero. Przybliżenie, bo model zakłada
     te same godziny na każdym aucie. */
  const breakEven = useMemo(() => {
    if (vehicles.length === 0) return null;
    const commission = inWeek.filter((e) => e.mode === "commission");
    const cHours = commission.reduce((s, e) => s + e.hours, 0);
    const studentHours = commission.filter((e) => e.student).reduce((s, e) => s + e.hours, 0);
    const reached = inWeek.filter((e) => e.trips >= params.tripThreshold).length;
    return breakEvenRate(
      {
        ...scenarioFromFleet(vehicles, scenario),
        hoursPerCar: r.hours > 0 ? r.hours / vehicles.length : params.targetHoursPerCar,
        studentShare: cHours > 0 ? studentHours / cHours : scenario.studentShare,
        thresholdShare: inWeek.length > 0 ? reached / inWeek.length : scenario.thresholdShare,
        includeBoard: true,
      },
      params,
    );
  }, [vehicles, inWeek, params, scenario, r.hours]);

  const trend = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const key = shiftWeek(week, i - 7);
        const list = entries.filter((e) => e.week === key);
        return { week: key, value: weekResult(list, vehicles, params).result, empty: list.length === 0 };
      }),
    [entries, vehicles, params, week],
  );

  const tasks = useMemo<Task[]>(() => {
    const list: Task[] = [];

    let toPay = 0;
    let payCount = 0;
    let toCollect = 0;
    let collectCount = 0;
    for (const e of entries) {
      if (e.paid || e.owner) continue;
      const s = settle(e, params);
      if (e.mode === "commission") {
        toPay += s.payout;
        payCount += 1;
      } else {
        toCollect += s.dueFromDriver;
        collectCount += 1;
      }
    }
    if (payCount > 0)
      list.push({
        icon: Receipt,
        text: `${payCount} ${plural(payCount, "wypłata", "wypłaty", "wypłat")} dla kierowców`,
        detail: zl(toPay),
        to: "/rozliczenia",
      });
    if (collectCount > 0)
      list.push({
        icon: Receipt,
        text: `${collectCount} ${plural(collectCount, "czynsz", "czynsze", "czynszów")} do pobrania`,
        detail: zl(toCollect),
        to: "/rozliczenia",
      });

    /* Kto jeździł według grafiku, a nie ma jeszcze rozliczenia. */
    const worked = driverWeeks(schedule, week);
    const missing = [...worked.keys()].filter((id) => !inWeek.some((e) => e.driverId === id)).length;
    if (missing > 0)
      list.push({
        icon: Receipt,
        text: `${missing} ${plural(missing, "kierowca", "kierowców", "kierowców")} z grafiku bez danych za tydzień ${weekNumber(week)}`,
        to: "/rozliczenia",
        tone: "amber",
      });

    /* Wolne zmiany w najbliższych siedmiu dniach na jeżdżących autach. */
    const today = toIso(new Date());
    const next = Array.from({ length: 7 }, (_, i) => addDays(today, i));
    const taken = new Set(schedule.filter((a) => next.includes(a.date)).map(keyOf));
    let free = 0;
    for (const v of vehicles)
      if (v.status === "active")
        for (const date of next) for (const duty of DUTIES) if (!taken.has(slotKey(date, v.id, duty))) free += 1;
    if (free > 0)
      list.push({
        icon: CalendarBlank,
        text: `${free} ${plural(free, "wolna zmiana", "wolne zmiany", "wolnych zmian")} w grafiku na 7 dni`,
        to: "/grafik",
      });
    const thisWeek = driverWeeks(schedule, currentWeek());

    for (const v of vehicles) {
      for (const [label, iso] of [
        ["Przegląd", v.inspectionDue],
        ["OC", v.insuranceDue],
      ] as const) {
        const days = daysUntil(iso);
        if (days === null || days > 30) continue;
        list.push({
          icon: CalendarCheck,
          text: `${label} ${v.plate}`,
          detail: days < 0 ? "po terminie" : `za ${days} ${plural(days, "dzień", "dni", "dni")}`,
          to: "/flota",
          tone: days < 0 ? "red" : "amber",
        });
      }
      const done = PREP_STEPS.filter((s) => v.prep[s.key]).length;
      if (done < PREP_STEPS.length)
        list.push({
          icon: Wrench,
          text: `${v.plate} nie jest gotowe do taxi`,
          detail: `${done} z ${PREP_STEPS.length} kroków`,
          to: "/flota",
          tone: "amber",
        });
      if (v.status === "active" && !inWeekSchedule(schedule, currentWeek()).some((a) => a.vehicleId === v.id))
        list.push({ icon: Car, text: `${v.plate} nie ma nikogo w grafiku w tym tygodniu`, to: "/grafik", tone: "amber" });
    }

    const benched = drivers.filter((d) => d.active && !thisWeek.has(d.id)).length;
    if (benched > 0)
      list.push({
        icon: IdentificationCard,
        text: `${benched} ${plural(benched, "aktywny kierowca", "aktywnych kierowców", "aktywnych kierowców")} bez zmian w tym tygodniu`,
        to: "/grafik",
      });

    return list;
  }, [entries, drivers, vehicles, params, inWeek, week, schedule]);

  if (vehicles.length === 0 && drivers.length === 0) {
    return (
      <>
        <PageHeader title="Pulpit" />
        <Panel flush>
          <Empty
            icon={<Car size={20} />}
            title="Zacznij od dodania aut"
            action={
              <div className="flex flex-wrap gap-2">
                <Link
                  to="/flota"
                  className="press inline-flex h-10 items-center rounded-control bg-green px-4 text-[0.9375rem] font-medium text-white hover:bg-green-hover"
                >
                  Dodaj auto
                </Link>
                {localCopy ? (
                  <Button
                    onClick={() => {
                      importData(localCopy);
                      toast.ok("Dane z tej przeglądarki są teraz na Twoim koncie.");
                    }}
                  >
                    <UploadSimple size={16} />
                    Przenieś dane z tej przeglądarki
                  </Button>
                ) : null}
                <Button variant="quiet" onClick={loadDemo}>
                  Wczytaj dane przykładowe
                </Button>
              </div>
            }
          >
            Gdy dodasz auta, kierowców i pierwsze rozliczenie, zobaczysz tu wynik tygodnia, stawkę na
            godzinę na tle progu rentowności i listę spraw do załatwienia. Zanim to zrobisz, możesz
            policzyć warianty w kalkulatorze.
          </Empty>
        </Panel>
      </>
    );
  }

  /* Ile rozliczeń z paliwem ma koszt z rachunków, a ile szacunek. */
  const fuelEntries = inWeek.filter((e) => e.mode === "commission" || e.owner);
  const fuelReal = fuelEntries.filter((e) => e.fuelGross !== null).length;
  const fuelHint =
    fuelEntries.length === 0
      ? "auta na procent"
      : fuelReal === 0
        ? "szacunek z godzin"
        : fuelReal === fuelEntries.length
          ? "z rachunków"
          : `${fuelReal} z ${fuelEntries.length} z rachunków, reszta szacunek`;

  const ledger = [
    { label: "Przychód spółki", hint: "utarg aut na procent, czynsze i opłaty najmu", value: r.income, kind: "in" },
    { label: "Kierowcy", hint: "wypłaty, dopłaty do minimum, ZUS", value: -r.driverCost, kind: "out" },
    { label: "Paliwo", hint: fuelHint, value: -r.lpg, kind: "out" },
    { label: "Auta", hint: "leasing, ubezpieczenie, serwis", value: -r.fixedCars, kind: "out" },
    { label: "Spółka", hint: "zarząd, księgowość", value: -r.overhead, kind: "out" },
  ] as const;
  const scale = Math.max(r.income, r.driverCost, r.fixedCars, r.overhead, 1);
  const working = vehicles.filter((v) => v.status === "active").length;
  const hoursPerCar = working > 0 ? r.hours / working : 0;
  const above = breakEven !== null && r.avgRate >= breakEven;
  const urgent = tasks.filter((t) => t.tone === "red").length;

  return (
    <>
      <PageHeader
        title="Pulpit"
        lead={
          r.count > 0
            ? `${r.count} ${plural(r.count, "rozliczenie", "rozliczenia", "rozliczeń")}, ${num1(r.hours)} godzin online i ${r.trips} kursów w tym tygodniu.`
            : "W tym tygodniu nie ma jeszcze rozliczeń. Koszty stałe liczą się mimo to."
        }
      >
        <WeekSwitcher week={week} onChange={setWeek} />
      </PageHeader>

      {/* Na telefonie jedna kolumna w kolejności ważności: wynik, sprawy,
          wskaźniki, trend. Na komputerze dwie kolumny. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start">
        <div className="contents lg:flex lg:flex-col lg:gap-4">
          {/* Rachunek tygodnia: skąd bierze się wynik */}
          <Panel title="Rachunek tygodnia" aside="kwoty netto" className="order-1 lg:order-none">
            <div className="flex flex-col">
              {ledger.map((row, i) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 border-b border-line py-2.5 first:pt-0"
                >
                  <div className="min-w-0">
                    <span className="text-[0.9375rem] font-medium text-ink">{row.label}</span>
                    <span className="ml-2 hidden text-[0.75rem] text-ink-3 sm:inline">{row.hint}</span>
                  </div>
                  <span className="num text-[0.9375rem] font-medium text-ink">
                    <Tween value={row.value} format={zl} />
                  </span>
                  <div className="col-span-2 mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
                    <div
                      className={cn("bar-grow h-full w-full rounded-full", row.kind === "in" ? "bg-green" : "bg-ink-3")}
                      style={{ transform: `scaleX(${Math.min(1, Math.abs(row.value) / scale)})`, "--i": i } as CSSProperties}
                    />
                  </div>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-4 pt-4">
                <span className="text-[1rem] font-semibold text-ink">Wynik tygodnia</span>
                <span
                  className={cn(
                    "num text-[1.875rem] leading-none font-semibold tracking-[-0.02em] transition-colors duration-300",
                    r.result < 0 ? "text-red" : "text-green-ink",
                  )}
                >
                  <Tween value={r.result} format={zl} ms={560} />
                </span>
              </div>
              <p className="mt-2 text-[0.75rem] text-ink-3">
                Przed CIT. Koszty miesięczne podzielone przez {num1(params.weeksPerMonth)} tygodnia.
              </p>
            </div>
          </Panel>

          <Panel title="Ostatnie osiem tygodni" aside="wynik przed CIT" className="order-5 lg:order-none">
            <WeekBars items={trend} selected={week} onSelect={setWeek} />
          </Panel>
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-4">
          <Panel
            title="Do załatwienia"
            aside={
              tasks.length > 0 ? (
                <span className={cn("num", urgent > 0 && "font-medium text-red")}>
                  {urgent > 0 ? `${urgent} po terminie, ` : ""}
                  {tasks.length} {plural(tasks.length, "sprawa", "sprawy", "spraw")}
                </span>
              ) : null
            }
            flush
            className="order-2 lg:order-none"
          >
            {tasks.length === 0 ? (
              <p className="flex items-center gap-2.5 px-4 py-5 text-[0.875rem] text-ink-2 md:px-5">
                <CheckCircle size={18} weight="fill" className="text-green" />
                Nic nie czeka. Rozliczenia zamknięte, terminy odległe.
              </p>
            ) : (
              <ul>
                {tasks.map((t, i) => (
                  <li
                    key={`${t.text}-${i}`}
                    className="stagger-item border-b border-line last:border-b-0"
                    style={{ "--i": i } as CSSProperties}
                  >
                    <Link
                      to={t.to}
                      className="group flex items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-bg md:px-5"
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-control",
                          t.tone === "red"
                            ? "bg-red-soft text-red"
                            : t.tone === "amber"
                              ? "bg-amber-soft text-amber"
                              : "bg-sunken text-ink-2",
                        )}
                      >
                        <t.icon size={17} />
                      </span>
                      <span className="min-w-0 flex-1 text-[0.875rem] text-ink">{t.text}</span>
                      {t.detail ? (
                        <span
                          className={cn(
                            "num shrink-0 text-[0.8125rem] font-medium",
                            t.tone === "red" ? "text-red" : t.tone === "amber" ? "text-amber" : "text-ink",
                          )}
                        >
                          {t.detail}
                        </span>
                      ) : null}
                      <ArrowRight
                        size={14}
                        className="shrink-0 text-ink-3 transition-transform duration-200 ease-[var(--ease-out)] group-hover:translate-x-0.5"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Stawka na godzinę" aside="netto, po prowizji" className="order-3 lg:order-none">
            <div className="flex items-baseline justify-between gap-3">
              <span className="num text-[1.75rem] leading-none font-semibold tracking-[-0.02em] text-ink">
                {r.avgRate > 0 ? <Tween value={r.avgRate} format={(v) => `${num1(v)} zł`} /> : "brak"}
              </span>
              {r.avgRate > 0 && breakEven !== null ? (
                <span className={cn("num text-[0.8125rem] font-medium", above ? "text-green-ink" : "text-red")}>
                  {above ? "+" : "−"}
                  {num1(Math.abs(r.avgRate - breakEven))} zł {above ? "nad progiem" : "pod progiem"}
                </span>
              ) : null}
            </div>
            <RateTrack actual={r.avgRate} breakEven={breakEven} plan={scenario.ratePerHour} />
            <p className="text-[0.75rem] leading-snug text-ink-3">
              Próg to stawka, przy której ta flota wychodzi na zero przy godzinach z tego tygodnia.
            </p>
          </Panel>

          <Panel
            title="Godziny na auto"
            aside={`cel ${params.targetHoursPerCar} h tygodniowo`}
            className="order-4 lg:order-none"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="num text-[1.75rem] leading-none font-semibold tracking-[-0.02em] text-ink">
                <Tween value={hoursPerCar} format={(v) => `${num1(v)} h`} />
              </span>
              <span className="num text-[0.8125rem] text-ink-2">{pct(r.utilization)} wykorzystania</span>
            </div>
            <div
              className="mt-4 h-2 overflow-hidden rounded-full bg-sunken"
              role="img"
              aria-label={`Wykorzystanie ${pct(r.utilization)}`}
            >
              <div
                className="bar-grow h-full w-full rounded-full bg-green"
                style={{ transform: `scaleX(${Math.min(1, r.utilization)})`, "--i": 3 } as CSSProperties}
              />
            </div>
            <p className="mt-2.5 text-[0.75rem] text-ink-3">
              Liczone dla {working} {plural(working, "auta, które jeździ", "aut, które jeżdżą", "aut, które jeżdżą")}.
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------
   Pulpit kierowcy: najbliższe zmiany i ostatnie rozliczenie.
   ------------------------------------------------------------------ */

function DriverHome() {
  const meId = useSession((s) => s.meId);
  const drivers = useFleet((s) => s.drivers);
  const vehicles = useFleet((s) => s.vehicles);
  const schedule = useFleet((s) => s.schedule);
  const entries = useFleet((s) => s.entries);
  const params = useFleet((s) => s.params);

  const me = drivers.find((d) => d.id === meId);
  const today = toIso(new Date());
  const plates = new Map(vehicles.map((v) => [v.id, v.plate]));
  const upcoming = schedule
    .filter((a) => a.driverId === meId && a.date >= today && a.date <= addDays(today, 13))
    .sort((a, b) => (a.date + (a.duty === "day" ? 0 : 1)).localeCompare(b.date + (b.duty === "day" ? 0 : 1)));
  const last = [...entries].filter((e) => e.driverId === meId).sort((a, b) => (a.week < b.week ? 1 : -1))[0];
  const s = last ? settle(last, params) : null;

  return (
    <>
      <PageHeader
        title={me ? `Cześć, ${me.name.split(" ")[0]}` : "Pulpit"}
        lead="Twoje zmiany w grafiku i ostatnie rozliczenie. Zmiany wprowadza szef floty."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start">
        <Panel
          title="Najbliższe zmiany"
          aside={<Link to="/grafik" className="font-medium text-green-ink hover:underline">cały grafik</Link>}
          flush
        >
          {upcoming.length === 0 ? (
            <p className="px-4 py-5 text-[0.875rem] text-ink-2 md:px-5">Na najbliższe dwa tygodnie nie masz zmian w grafiku.</p>
          ) : (
            <ul>
              {upcoming.map((a, i) => (
                <li
                  key={`${a.date}-${a.duty}`}
                  style={{ "--i": i } as CSSProperties}
                  className={cn(
                    "stagger-item flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0 md:px-5",
                    a.date === today && "bg-green-soft/50",
                  )}
                >
                  {a.duty === "day" ? (
                    <Sun size={16} weight="fill" className="shrink-0 text-amber" />
                  ) : (
                    <Moon size={16} weight="fill" className="shrink-0 text-green-deep-2" />
                  )}
                  <span className="min-w-0 flex-1 text-[0.875rem] text-ink">
                    <span className="font-medium capitalize">{a.date === today ? "dziś" : dayLabel(a.date).long}</span>
                    <span className="num ml-1.5 text-ink-3">{dayLabel(a.date).date}</span>
                    <span className="ml-2 text-ink-2">{DUTY_LABEL[a.duty]}</span>
                  </span>
                  {plates.get(a.vehicleId) ? <Plate>{plates.get(a.vehicleId)}</Plate> : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Ostatnie rozliczenie"
          aside={<Link to="/rozliczenia" className="font-medium text-green-ink hover:underline">wszystkie</Link>}
        >
          {last && s ? (
            <div className="flex flex-col gap-2">
              <div className="text-[0.8125rem] text-ink-3">
                Tydzień {weekNumber(last.week)}, {weekRange(last.week)}
              </div>
              <div className="num text-[1.875rem] leading-none font-semibold tracking-[-0.02em] text-ink">
                {s.ownerDrive ? "—" : <Tween value={last.mode === "rental" ? s.dueFromDriver : s.payout} format={zl} />}
              </div>
              <div className="text-[0.8125rem] text-ink-2">
                {s.ownerDrive ? "właściciel, bez wypłaty" : last.mode === "rental" ? "do zapłaty za wynajem" : "wypłata brutto"}
                {" · "}
                {last.paid ? "rozliczone" : "czeka na rozliczenie"}
              </div>
              <div className="num mt-2 border-t border-line pt-2 text-[0.8125rem] text-ink-2">
                {zl(last.revenue)} utargu · {num1(last.hours)} h · {last.trips} kursów
              </div>
            </div>
          ) : (
            <p className="text-[0.875rem] text-ink-2">Nie masz jeszcze rozliczeń.</p>
          )}
        </Panel>
      </div>
    </>
  );
}

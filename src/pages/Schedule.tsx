import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { CalendarBlank, CopySimple, Moon, Sun, Trash, Warning } from "@phosphor-icons/react";
import { pct, plural, toIso } from "../domain/format";
import {
  DUTIES,
  DUTY_LABEL,
  carUsage,
  conflicts,
  copyWeek,
  dayLabel,
  driverWeeks,
  inWeek,
  slotKey,
  share,
  slotMap,
  weekDates,
} from "../domain/schedule";
import type { Conflict } from "../domain/schedule";
import type { Driver, Duty, Vehicle } from "../domain/types";
import { currentWeek, shiftWeek, weekNumber } from "../domain/week";
import { useSession } from "../data/session";
import { useFleet } from "../store/useFleet";
import { toast } from "../ui/Toast";
import { WeekSwitcher } from "../ui/WeekSwitcher";
import { Badge, Button, Empty, PageHeader, Panel, Plate, cn } from "../ui/kit";

const DutyIcon = ({ duty, className }: { duty: Duty; className?: string }) =>
  duty === "day" ? (
    <Sun size={14} weight="fill" className={cn("text-amber", className)} aria-hidden="true" />
  ) : (
    <Moon size={14} weight="fill" className={cn("text-green-deep-2", className)} aria-hidden="true" />
  );

const CONFLICT_TEXT: Record<Conflict, string> = {
  double: "Ten kierowca ma w tym czasie inne auto",
  rest: "Bez odpoczynku między nocką a dniówką",
};

export function Schedule() {
  const vehicles = useFleet((s) => s.vehicles);
  const drivers = useFleet((s) => s.drivers);
  const schedule = useFleet((s) => s.schedule);
  const setSlot = useFleet((s) => s.setSlot);
  const setWeekSchedule = useFleet((s) => s.setWeekSchedule);
  const role = useSession((s) => s.role);
  const meId = useSession((s) => s.meId);
  const editable = role === "admin";

  const [week, setWeek] = useState(currentWeek);
  const dates = useMemo(() => weekDates(week), [week]);
  const today = toIso(new Date());
  const [day, setDay] = useState(() => {
    const i = weekDates(currentWeek()).indexOf(toIso(new Date()));
    return i < 0 ? 0 : i;
  });

  const thisWeek = useMemo(() => inWeek(schedule, week), [schedule, week]);
  const slots = useMemo(() => slotMap(thisWeek), [thisWeek]);
  /* Konflikty liczone z sąsiednimi dniami: nocka w niedzielę poprzedniego
     tygodnia też odbiera odpoczynek przed poniedziałkową dniówką. */
  const problems = useMemo(
    () => conflicts([...inWeek(schedule, shiftWeek(week, -1)), ...thisWeek]),
    [schedule, thisWeek, week],
  );
  const perDriver = useMemo(() => driverWeeks(schedule, week), [schedule, week]);

  const names = useMemo(() => new Map(drivers.map((d) => [d.id, d.name])), [drivers]);
  const plates = useMemo(() => new Map(vehicles.map((v) => [v.id, v.plate])), [vehicles]);
  const pickable = useMemo(
    () => drivers.filter((d) => d.active).sort((a, b) => a.name.localeCompare(b.name, "pl")),
    [drivers],
  );

  /* W grafiku są auta, które jeżdżą albo stoją w serwisie, oraz każde auto
     z wpisami w tym tygodniu. */
  const cars = useMemo(
    () =>
      vehicles
        .filter((v) => v.status !== "idle" || thisWeek.some((a) => a.vehicleId === v.id))
        .sort((a, b) => a.plate.localeCompare(b.plate)),
    [vehicles, thisWeek],
  );

  /* Wykorzystanie: obsadzone zmiany do możliwych (7 dniówek i 7 nocek na auto).
     Flota liczona z aut, które jeżdżą. */
  const usage = useMemo(() => carUsage(schedule, week), [schedule, week]);
  const working = cars.filter((v) => v.status === "active");
  const fleetDay = working.reduce((s, v) => s + (usage.get(v.id)?.day ?? 0), 0);
  const fleetNight = working.reduce((s, v) => s + (usage.get(v.id)?.night ?? 0), 0);
  const capacity = working.length * 14;
  const filled = fleetDay + fleetNight;
  const onDay = (date: string, duty: Duty) =>
    working.filter((v) => slots.has(slotKey(date, v.id, duty))).length;
  const doubles = [...problems.entries()].filter(([k, c]) => c === "double" && dates.some((d) => k.startsWith(d))).length;
  const tired = [...problems.entries()].filter(([k, c]) => c === "rest" && dates.some((d) => k.startsWith(d))).length;

  const mine = useMemo(
    () =>
      meId
        ? thisWeek
            .filter((a) => a.driverId === meId)
            .sort((a, b) => (a.date + a.duty).localeCompare(b.date + b.duty))
        : [],
    [thisWeek, meId],
  );

  function copyPrevious() {
    const prev = shiftWeek(week, -1);
    const copied = copyWeek(schedule, prev, week, vehicles);
    if (copied.length === 0) {
      toast.error(`Tydzień ${weekNumber(prev)} jest pusty, nie ma czego kopiować.`);
      return;
    }
    if (thisWeek.length > 0 && !window.confirm(`Zastąpić grafik tygodnia ${weekNumber(week)} kopią tygodnia ${weekNumber(prev)}?`))
      return;
    setWeekSchedule(week, copied);
    toast.ok(`Skopiowano ${copied.length} ${plural(copied.length, "zmianę", "zmiany", "zmian")} z tygodnia ${weekNumber(prev)}.`);
  }

  function clearWeek() {
    if (!window.confirm(`Wyczyścić cały grafik tygodnia ${weekNumber(week)}?`)) return;
    setWeekSchedule(week, []);
    toast.ok("Grafik tygodnia wyczyszczony.");
  }

  if (vehicles.length === 0) {
    return (
      <>
        <PageHeader title="Grafik" />
        <Panel flush>
          <Empty icon={<CalendarBlank size={20} />} title="Najpierw dodaj auta">
            Grafik układa się na auta: na każdy dzień dniówka i nocka. Gdy we flocie pojawią się auta, a w zakładce
            Kierowcy ludzie, wpiszesz ich tutaj.
          </Empty>
        </Panel>
      </>
    );
  }

  const cell = (v: Vehicle, date: string, duty: Duty) => {
    const key = slotKey(date, v.id, duty);
    const driverId = slots.get(key) ?? "";
    const problem = problems.get(key);
    const isMe = meId !== null && driverId === meId;

    if (!editable)
      return (
        <span
          className={cn(
            "flex h-9 min-w-0 items-center rounded-[6px] px-2 text-[0.8125rem]",
            driverId ? "text-ink" : "text-ink-3",
            isMe && "bg-green-soft font-semibold text-green-ink",
          )}
        >
          <span className="truncate">{driverId ? (names.get(driverId) ?? "Kierowca") : "wolne"}</span>
        </span>
      );

    return (
      <span className="relative block min-w-0">
        <select
          aria-label={`${v.plate}, ${dayLabel(date).long} ${dayLabel(date).date}, ${DUTY_LABEL[duty].toLowerCase()}`}
          value={driverId}
          onChange={(e) => setSlot(date, v.id, duty, e.target.value || null)}
          title={problem ? CONFLICT_TEXT[problem] : undefined}
          className={cn(
            "h-9 w-full min-w-0 cursor-pointer appearance-none truncate rounded-[6px] border px-2 text-[0.8125rem] outline-none",
            "transition-[border-color,background-color,box-shadow] duration-150",
            "focus-visible:border-green focus-visible:shadow-[0_0_0_3px_var(--color-green-soft)]",
            driverId
              ? "border-transparent bg-sunken text-ink hover:border-line-strong"
              : "border-dashed border-line-strong bg-surface text-ink-3 hover:border-ink-3",
            problem === "double" && "border-red bg-red-soft text-red",
            problem === "rest" && "border-amber bg-amber-soft text-amber",
          )}
        >
          <option value="">wolne</option>
          {pickable.map((d) => (
            <DriverOption key={d.id} d={d} date={date} duty={duty} vehicleId={v.id} slots={slots} plates={plates} cars={cars} />
          ))}
          {/* Kierowca nieaktywny, ale wciąż wpisany w grafiku: musi dać się go zobaczyć. */}
          {driverId && !pickable.some((d) => d.id === driverId) ? (
            <option value={driverId}>{names.get(driverId) ?? "Usunięty kierowca"}</option>
          ) : null}
        </select>
      </span>
    );
  };

  return (
    <>
      <PageHeader
        title="Grafik"
        lead={
          editable
            ? `Wykorzystanie aut ${pct(share(filled, capacity))}: dniówki ${pct(share(fleetDay, working.length * 7))}, nocki ${pct(share(fleetNight, working.length * 7))}. Obsadzone ${filled} z ${capacity} zmian.`
            : mine.length > 0
              ? `Masz w tym tygodniu ${mine.length} ${plural(mine.length, "zmianę", "zmiany", "zmian")}. Twoje pola są podświetlone.`
              : "W tym tygodniu nie masz zmian w grafiku."
        }
      >
        <WeekSwitcher week={week} onChange={setWeek} ahead={8} />
      </PageHeader>

      {editable ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={copyPrevious}>
            <CopySimple size={15} />
            Kopiuj poprzedni tydzień
          </Button>
          {thisWeek.length > 0 ? (
            <Button size="sm" variant="quiet" onClick={clearWeek}>
              <Trash size={15} />
              Wyczyść tydzień
            </Button>
          ) : null}
          {doubles + tired > 0 ? (
            <span className="enter ml-auto inline-flex items-center gap-1.5 rounded-full bg-amber-soft px-3 py-1 text-[0.8125rem] font-medium text-amber">
              <Warning size={14} weight="fill" />
              {doubles > 0 ? `${doubles} ${plural(doubles, "zmiana", "zmiany", "zmian")} na dwóch autach` : ""}
              {doubles > 0 && tired > 0 ? ", " : ""}
              {tired > 0 ? `${tired} bez odpoczynku` : ""}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Kierowca na telefonie: najpierw własne zmiany. */}
      {!editable && mine.length > 0 ? (
        <Panel title="Twoje zmiany" flush className="mb-4">
          <ul>
            {mine.map((a, i) => (
              <li
                key={`${a.date}-${a.duty}`}
                style={{ "--i": i } as CSSProperties}
                className={cn(
                  "stagger-item flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0 md:px-5",
                  a.date === today && "bg-green-soft/50",
                )}
              >
                <DutyIcon duty={a.duty} />
                <span className="min-w-[9.5rem] text-[0.875rem] font-medium text-ink capitalize">
                  {dayLabel(a.date).long}
                  <span className="num ml-1.5 font-normal text-ink-3">{dayLabel(a.date).date}</span>
                </span>
                <span className="text-[0.8125rem] text-ink-2">{DUTY_LABEL[a.duty]}</span>
                <span className="ml-auto">{plates.get(a.vehicleId) ? <Plate>{plates.get(a.vehicleId)}</Plate> : null}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {/* Komputer i tablet: cały tydzień w siatce */}
      <Panel flush className="hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="w-[132px] px-4 py-2.5 text-[0.75rem] font-medium text-ink-3">
                  Auto
                </th>
                {dates.map((date) => {
                  const l = dayLabel(date);
                  const isToday = date === today;
                  return (
                    <th
                      key={date}
                      scope="col"
                      className={cn("px-1.5 py-2 text-[0.75rem] font-medium", isToday ? "bg-green-soft/60 text-green-ink" : "text-ink-3")}
                    >
                      <span className="capitalize">{l.short}</span> <span className="num">{l.date}</span>
                      {isToday ? <span className="ml-1 font-semibold">dziś</span> : null}
                    </th>
                  );
                })}
                <th scope="col" className="w-[108px] border-l border-line px-3 py-2 text-[0.75rem] font-medium text-ink-3">
                  Wykorzystanie
                </th>
              </tr>
            </thead>
            <tbody>
              {cars.map((v, i) =>
                DUTIES.map((duty) => (
                  <tr
                    key={`${v.id}-${duty}`}
                    style={{ "--i": i } as CSSProperties}
                    className={cn("stagger-item", duty === "night" ? "border-b border-line" : undefined)}
                  >
                    {duty === "day" ? (
                      <th scope="rowgroup" rowSpan={2} className="border-r border-line px-4 py-2 align-middle font-normal">
                        <div className="flex flex-col items-start gap-1">
                          <Plate>{v.plate}</Plate>
                          <span className="text-[0.6875rem] text-ink-3">
                            {v.mode === "rental" ? "wynajem" : "na procent"}
                            {v.status === "service" ? ", w serwisie" : ""}
                          </span>
                          <span className="num text-[0.75rem] font-semibold text-ink">
                            {pct(share((usage.get(v.id)?.day ?? 0) + (usage.get(v.id)?.night ?? 0), 14))}
                            <span className="ml-1 font-normal text-ink-3">tygodnia</span>
                          </span>
                        </div>
                      </th>
                    ) : null}
                    {dates.map((date) => (
                      <td
                        key={date}
                        className={cn(
                          "px-1 py-[3px]",
                          date === today && "bg-green-soft/35",
                          duty === "day" ? "pt-2" : "pb-2",
                        )}
                      >
                        <div className="flex items-center gap-1">
                          <DutyIcon duty={duty} className="shrink-0 opacity-70" />
                          <div className="min-w-0 flex-1">{cell(v, date, duty)}</div>
                        </div>
                      </td>
                    ))}
                    <td className={cn("border-l border-line px-3", duty === "day" ? "pt-2" : "pb-2")}>
                      <UsageCell filled={usage.get(v.id)?.[duty] ?? 0} possible={7} label={DUTY_LABEL[duty]} />
                    </td>
                  </tr>
                )),
              )}
            </tbody>
            <tfoot>
              {DUTIES.map((duty) => (
                <tr key={duty} className={cn(duty === "day" ? "border-t-2 border-line" : undefined, "bg-bg/60")}>
                  {duty === "day" ? (
                    <th scope="rowgroup" rowSpan={2} className="border-r border-line px-4 py-2 align-middle font-normal">
                      <span className="text-[0.8125rem] font-semibold text-ink">Cała flota</span>
                      <span className="mt-0.5 block text-[0.6875rem] text-ink-3">
                        {working.length} {plural(working.length, "auto jeździ", "auta jeżdżą", "aut jeździ")}
                      </span>
                    </th>
                  ) : null}
                  {dates.map((date) => {
                    const n = onDay(date, duty);
                    return (
                      <td
                        key={date}
                        className={cn("px-2 py-1.5 text-[0.75rem]", date === today && "bg-green-soft/35")}
                      >
                        <span className="flex items-center gap-1">
                          <DutyIcon duty={duty} className="shrink-0 opacity-70" />
                          <span className="num text-ink-2">
                            {n}/{working.length}
                          </span>
                          <span className={cn("num ml-auto font-medium", n < working.length ? "text-amber" : "text-green-ink")}>
                            {pct(share(n, working.length))}
                          </span>
                        </span>
                      </td>
                    );
                  })}
                  <td className="border-l border-line px-3 py-1.5">
                    <UsageCell
                      filled={duty === "day" ? fleetDay : fleetNight}
                      possible={working.length * 7}
                      label={DUTY_LABEL[duty]}
                    />
                  </td>
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      </Panel>

      {/* Telefon: jeden dzień naraz */}
      <div className="md:hidden">
        <div
          role="tablist"
          aria-label="Dzień tygodnia"
          className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {dates.map((date, i) => {
            const l = dayLabel(date);
            const active = i === day;
            const free = cars.filter((v) => v.status === "active").length * 2 -
              thisWeek.filter((a) => a.date === date).length;
            return (
              <button
                key={date}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setDay(i)}
                className={cn(
                  "press flex min-w-[3.25rem] shrink-0 flex-col items-center rounded-control border px-2 py-1.5",
                  active ? "border-green bg-green text-white" : "border-line-strong bg-surface text-ink-2",
                )}
              >
                <span className="text-[0.75rem] font-semibold capitalize">{l.short}</span>
                <span className="num text-[0.6875rem] opacity-80">{l.date}</span>
                {editable ? (
                  <span
                    className={cn(
                      "mt-0.5 h-1.5 w-1.5 rounded-full",
                      free > 0 ? (active ? "bg-white/70" : "bg-amber") : "bg-transparent",
                    )}
                    aria-label={free > 0 ? `${free} wolnych zmian` : undefined}
                  />
                ) : date === today ? (
                  <span className={cn("mt-0.5 h-1.5 w-1.5 rounded-full", active ? "bg-white/70" : "bg-green")} />
                ) : null}
              </button>
            );
          })}
        </div>

        <Panel
          title={
            <span className="capitalize">
              {dayLabel(dates[day]).long} <span className="num font-normal text-ink-3">{dayLabel(dates[day]).date}</span>
            </span>
          }
          flush
        >
          <ul key={dates[day]}>
            {cars.map((v, i) => (
              <li
                key={v.id}
                style={{ "--i": i } as CSSProperties}
                className="stagger-item grid grid-cols-[5.5rem_1fr_1fr] items-center gap-2 border-b border-line px-4 py-2.5 last:border-b-0"
              >
                <Plate>{v.plate}</Plate>
                {DUTIES.map((duty) => (
                  <div key={duty} className="flex min-w-0 items-center gap-1">
                    <DutyIcon duty={duty} className="shrink-0" />
                    <div className="min-w-0 flex-1">{cell(v, dates[day], duty)}</div>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* Telefon: wykorzystanie aut w tygodniu (na komputerze jest w siatce). */}
      <Panel
        title="Wykorzystanie aut w tygodniu"
        aside={`flota ${pct(share(filled, capacity))}`}
        flush
        className="mt-4 md:hidden"
      >
        <ul>
          {cars.map((v) => {
            const u = usage.get(v.id) ?? { day: 0, night: 0 };
            return (
              <li key={v.id} className="grid grid-cols-[5.5rem_1fr_1fr_3rem] items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                <Plate>{v.plate}</Plate>
                <UsageCell filled={u.day} possible={7} label="Dniówki" icon="day" />
                <UsageCell filled={u.night} possible={7} label="Nocki" icon="night" />
                <span className="num text-right text-[0.875rem] font-semibold text-ink">{pct(share(u.day + u.night, 14))}</span>
              </li>
            );
          })}
        </ul>
      </Panel>

      {editable ? (
        <Panel title="Kierowcy w tym tygodniu" aside="zmiany i auta" flush className="mt-4">
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {pickable.map((d) => {
              const w = perDriver.get(d.id);
              return (
                <li key={d.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 md:px-5">
                  <span className="min-w-0 truncate text-[0.875rem] text-ink">{d.name}</span>
                  {w ? (
                    <span className="num flex shrink-0 items-center gap-2 text-[0.8125rem] text-ink-2">
                      <span title="dniówki" className="inline-flex items-center gap-0.5">
                        <Sun size={12} weight="fill" className="text-amber" />
                        {w.day}
                      </span>
                      <span title="nocki" className="inline-flex items-center gap-0.5">
                        <Moon size={12} weight="fill" className="text-green-deep-2" />
                        {w.night}
                      </span>
                      <span className="font-semibold text-ink">{w.total}</span>
                    </span>
                  ) : (
                    <Badge tone="amber">bez zmian</Badge>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}
    </>
  );
}

/** Pozycja na liście wyboru z podpowiedzią, czy kierowca jest już zajęty. */
function DriverOption({
  d,
  date,
  duty,
  vehicleId,
  slots,
  plates,
  cars,
}: {
  d: Driver;
  date: string;
  duty: Duty;
  vehicleId: string;
  slots: Map<string, string>;
  plates: Map<string, string>;
  cars: Vehicle[];
}) {
  const elsewhere = cars.find((c) => c.id !== vehicleId && slots.get(slotKey(date, c.id, duty)) === d.id);
  return (
    <option value={d.id}>
      {d.name}
      {elsewhere ? ` (już na ${plates.get(elsewhere.id)})` : ""}
    </option>
  );
}

/** Obsadzone zmiany z paskiem: 6/7 i 86%. */
function UsageCell({
  filled,
  possible,
  label,
  icon,
}: {
  filled: number;
  possible: number;
  label: string;
  icon?: Duty;
}) {
  const ratio = share(filled, possible);
  return (
    <div className="min-w-0" title={`${label}: ${filled} z ${possible}`}>
      <div className="flex items-baseline justify-between gap-2 text-[0.75rem]">
        <span className="num inline-flex items-center gap-1 text-ink-2">
          {icon ? <DutyIcon duty={icon} /> : null}
          {filled}/{possible}
        </span>
        <span className="num font-semibold text-ink">{pct(ratio)}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-sunken">
        <div
          className={cn("bar-grow h-full w-full rounded-full", ratio < 0.5 ? "bg-amber" : "bg-green")}
          style={{ transform: `scaleX(${ratio})` }}
        />
      </div>
    </div>
  );
}

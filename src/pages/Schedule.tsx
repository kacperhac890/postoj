import { useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { CalendarBlank, CopySimple, Moon, Sun, Trash, Warning, X } from "@phosphor-icons/react";
import { pct, plural, toIso } from "../domain/format";
import {
  DUTIES,
  DUTY_LABEL,
  addDays,
  carUsage,
  conflicts,
  copyWeek,
  dayLabel,
  driverWeeks,
  inWeek,
  share,
  shortNames,
  slotKey,
  slotMap,
  weekDates,
} from "../domain/schedule";
import type { Conflict } from "../domain/schedule";
import type { Assignment, Duty, Vehicle } from "../domain/types";
import { currentWeek, shiftWeek, weekNumber } from "../domain/week";
import { useSession } from "../data/session";
import { useFleet } from "../store/useFleet";
import { toast } from "../ui/Toast";
import { WeekSwitcher } from "../ui/WeekSwitcher";
import { Button, Empty, PageHeader, Panel, Plate, Segmented, cn } from "../ui/kit";

const DutyIcon = ({ duty, className, size = 14 }: { duty: Duty; className?: string; size?: number }) =>
  duty === "day" ? (
    <Sun size={size} weight="fill" className={cn("text-amber", className)} aria-hidden="true" />
  ) : (
    <Moon size={size} weight="fill" className={cn("text-green-deep-2", className)} aria-hidden="true" />
  );

const ORDER = { active: 0, service: 1, idle: 2 } as const;

const CONFLICT_TEXT: Record<Conflict, string> = {
  double: "Ten kierowca ma w tym czasie inne auto",
  rest: "Bez odpoczynku między nocką a dniówką",
};

type View = "cars" | "drivers";
const VIEW_KEY = "postoj-grafik-widok";

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "drivers" ? "drivers" : "cars";
  } catch {
    return "cars";
  }
}

const cssId = (id: string) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/"/g, ""));

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
  const [view, setViewState] = useState<View>(readView);
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* Bez pamięci przeglądarki widok wraca do domyślnego. */
    }
  };
  /* Kierowca przypięty z listy: jego zmiany są wyraźne, reszta przygaszona. */
  const [pinned, setPinned] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);

  const thisWeek = useMemo(() => inWeek(schedule, week), [schedule, week]);
  const prevWeek = useMemo(() => inWeek(schedule, shiftWeek(week, -1)), [schedule, week]);
  const slots = useMemo(() => slotMap(thisWeek), [thisWeek]);
  /* Konflikty liczone z sąsiednimi dniami: nocka w niedzielę poprzedniego
     tygodnia też odbiera odpoczynek przed poniedziałkową dniówką. */
  const problems = useMemo(() => conflicts([...prevWeek, ...thisWeek]), [prevWeek, thisWeek]);
  const perDriver = useMemo(() => driverWeeks(schedule, week), [schedule, week]);
  /* Kto gdzie jeździ: data|zmiana|kierowca → auto. Do podpowiedzi na liście wyboru. */
  const busy = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of [...prevWeek, ...thisWeek]) m.set(`${a.date}|${a.duty}|${a.driverId}`, a.vehicleId);
    return m;
  }, [prevWeek, thisWeek]);

  const names = useMemo(() => new Map(drivers.map((d) => [d.id, d.name])), [drivers]);
  const short = useMemo(() => shortNames(drivers), [drivers]);
  const plates = useMemo(() => new Map(vehicles.map((v) => [v.id, v.plate])), [vehicles]);
  const pickable = useMemo(
    () => drivers.filter((d) => d.active).sort((a, b) => a.name.localeCompare(b.name, "pl")),
    [drivers],
  );

  /* W grafiku są wszystkie auta: najpierw jeżdżące, potem w serwisie,
     na końcu stojące. Status nie blokuje wpisania kierowcy. */
  const cars = useMemo(
    () => [...vehicles].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.plate.localeCompare(b.plate)),
    [vehicles],
  );

  /* Wykorzystanie: obsadzone zmiany do możliwych (7 dniówek i 7 nocek na auto).
     Flota: auta, które jeżdżą, i każde auto z wpisami w tym tygodniu. */
  const usage = useMemo(() => carUsage(schedule, week), [schedule, week]);
  const working = cars.filter((v) => v.status === "active" || usage.has(v.id));
  const fleetDay = working.reduce((s, v) => s + (usage.get(v.id)?.day ?? 0), 0);
  const fleetNight = working.reduce((s, v) => s + (usage.get(v.id)?.night ?? 0), 0);
  const capacity = working.length * 14;
  const filled = fleetDay + fleetNight;
  const onDay = (date: string, duty: Duty) => working.filter((v) => slots.has(slotKey(date, v.id, duty))).length;
  const inThisWeek = (k: string) => dates.some((d) => k.startsWith(d));
  const doubles = [...problems.entries()].filter(([k, c]) => c === "double" && inThisWeek(k)).length;
  const tired = [...problems.entries()].filter(([k, c]) => c === "rest" && inThisWeek(k)).length;

  /* Kierowcy w widoku kierowców i na liście do podświetlania: aktywni
     oraz każdy, kto ma zmiany w tym tygodniu. */
  const crew = useMemo(() => {
    const ids = new Set([...pickable.map((d) => d.id), ...thisWeek.map((a) => a.driverId)]);
    return [...ids]
      .map((id) => ({ id, name: names.get(id) ?? "Usunięty kierowca", total: perDriver.get(id)?.total ?? 0 }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pl"));
  }, [pickable, thisWeek, names, perDriver]);

  const byDriverDay = useMemo(() => {
    const m = new Map<string, Assignment[]>();
    for (const a of thisWeek) {
      const k = `${a.driverId}|${a.date}`;
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    for (const list of m.values()) list.sort((a, b) => (a.duty === "day" ? -1 : 1) - (b.duty === "day" ? -1 : 1));
    return m;
  }, [thisWeek]);

  const mine = useMemo(
    () =>
      meId
        ? thisWeek.filter((a) => a.driverId === meId).sort((a, b) => (a.date + a.duty).localeCompare(b.date + b.duty))
        : [],
    [thisWeek, meId],
  );

  /* Reguły podświetlenia: jedna para na kierowcę, bez przeliczania siatki przy ruchu myszy. */
  const focusCss = useMemo(
    () =>
      crew
        .map(({ id }) => {
          const s = cssId(id);
          return (
            `.slots[data-hover="${s}"] .slot[data-driver="${s}"] .slot-chip{background:var(--color-green-soft);color:var(--color-green-ink);box-shadow:inset 0 0 0 1.5px var(--color-green)}` +
            `.slots[data-pin="${s}"] .slot[data-driver="${s}"]{opacity:1}` +
            `.slots[data-pin="${s}"] .slot[data-driver="${s}"] .slot-chip{background:var(--color-green);color:#fff;box-shadow:none}`
          );
        })
        .join(""),
    [crew],
  );

  const onHover = (e: MouseEvent<HTMLDivElement>) => {
    const el = grid.current;
    if (!el) return;
    const slot = (e.target as HTMLElement).closest<HTMLElement>(".slot");
    if (!slot) return;
    const id = slot.dataset.driver;
    if (id) el.dataset.hover = id;
    else delete el.dataset.hover;
  };
  const onLeave = () => {
    if (grid.current) delete grid.current.dataset.hover;
  };

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

  /** Jedno pole siatki: auto, dzień, zmiana. Widać krótkie imię, a pod spodem
      leży zwykła lista wyboru, więc na telefonie otwiera się systemowy wybór. */
  const slot = (v: Vehicle, date: string, duty: Duty, size: "sm" | "lg" = "sm") => {
    const key = slotKey(date, v.id, duty);
    const driverId = slots.get(key) ?? "";
    const problem = problems.get(key);
    const isMe = meId !== null && driverId === meId;
    const label = driverId ? (short.get(driverId) ?? "Kierowca") : editable ? "wolne" : "–";
    const where = `${v.plate}, ${dayLabel(date).long} ${dayLabel(date).date}, ${DUTY_LABEL[duty].toLowerCase()}`;

    const chip = (
      <span
        className={cn(
          "slot-chip pointer-events-none flex w-full min-w-0 items-center gap-1 rounded-[7px] px-2 text-[0.8125rem]",
          size === "lg" ? "h-10" : "h-9",
          driverId
            ? "bg-sunken font-medium text-ink"
            : "border border-dashed border-line-strong text-ink-3",
          editable && driverId && "group-hover:bg-line",
          editable && !driverId && "group-hover:border-ink-3 group-hover:text-ink-2",
          isMe && "bg-green-soft font-semibold text-green-ink",
          problem === "double" && "bg-red-soft text-red shadow-[inset_0_0_0_1px_var(--color-red)]",
          problem === "rest" && "bg-amber-soft text-amber shadow-[inset_0_0_0_1px_var(--color-amber)]",
        )}
      >
        {problem ? <Warning size={12} weight="fill" className="shrink-0" /> : null}
        <span className="truncate">{label}</span>
      </span>
    );

    return (
      <div
        className={cn(
          "slot group relative min-w-0 rounded-[7px]",
          editable && "has-[select:focus-visible]:shadow-[0_0_0_2px_var(--color-surface),0_0_0_4px_var(--color-green)]",
        )}
        data-driver={driverId || undefined}
        title={problem ? CONFLICT_TEXT[problem] : !editable && driverId ? names.get(driverId) : undefined}
      >
        {chip}
        {editable ? (
          <select
            aria-label={where}
            value={driverId}
            onChange={(e) => setSlot(date, v.id, duty, e.target.value || null)}
            className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
          >
            <option value="">wolne</option>
            {/* Najpierw wolni, potem po zmianie bez odpoczynku, na końcu zajęci na innym aucie. */}
            {pickable
              .map((d) => ({ d, h: hint(d.id, date, duty, v.id) }))
              .sort((x, y) => rank(x.h) - rank(y.h))
              .map(({ d, h }) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {h}
                </option>
              ))}
            {/* Kierowca nieaktywny, ale wciąż wpisany w grafiku: musi dać się go zobaczyć. */}
            {driverId && !pickable.some((d) => d.id === driverId) ? (
              <option value={driverId}>{names.get(driverId) ?? "Usunięty kierowca"}</option>
            ) : null}
          </select>
        ) : null}
      </div>
    );
  };

  /** Podpowiedź przy nazwisku na liście: czy kierowca jest już zajęty. */
  function hint(driverId: string, date: string, duty: Duty, vehicleId: string) {
    const other = busy.get(`${date}|${duty}|${driverId}`);
    if (other && other !== vehicleId) return ` (już na ${plates.get(other) ?? "innym aucie"})`;
    if (duty === "day" && (busy.has(`${addDays(date, -1)}|night|${driverId}`) || busy.has(`${date}|night|${driverId}`)))
      return " (po nocce)";
    if (duty === "night" && busy.has(`${date}|day|${driverId}`)) return " (ma dniówkę)";
    return "";
  }

  const rank = (h: string) => (h === "" ? 0 : h.startsWith(" (już") ? 2 : 1);

  const carMeta = (v: Vehicle) =>
    `${v.mode === "rental" ? "wynajem" : "na procent"}${v.status === "service" ? ", serwis" : v.status === "idle" ? ", nie jeździ" : ""}`;

  const freeOn = (date: string) => working.length * 2 - DUTIES.reduce((s, d) => s + onDay(date, d), 0);

  /* Dni tygodnia na telefonie: wspólne dla obu widoków. */
  const dayTabs = (
    <div
      role="tablist"
      aria-label="Dzień tygodnia"
      className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {dates.map((date, i) => {
        const l = dayLabel(date);
        const active = i === day;
        const free = freeOn(date);
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
  );

  const dayTitle = (
    <span className="capitalize">
      {dayLabel(dates[day]).long} <span className="num font-normal text-ink-3">{dayLabel(dates[day]).date}</span>
    </span>
  );

  return (
    <>
      <PageHeader
        title="Grafik"
        lead={
          editable
            ? working.length > 0
              ? `Wykorzystanie aut ${pct(share(filled, capacity))}: dniówki ${pct(share(fleetDay, working.length * 7))}, nocki ${pct(share(fleetNight, working.length * 7))}. ${capacity - filled > 0 ? `Wolnych zmian: ${capacity - filled}.` : "Wszystkie zmiany obsadzone."}`
              : "Żadne auto nie ma statusu „Jeździ”. Zmień go we Flocie albo wpisz kierowców, a wykorzystanie się policzy."
            : mine.length > 0
              ? `Masz w tym tygodniu ${mine.length} ${plural(mine.length, "zmianę", "zmiany", "zmian")}. Twoje pola są podświetlone.`
              : "W tym tygodniu nie masz zmian w grafiku."
        }
      >
        <WeekSwitcher week={week} onChange={setWeek} ahead={8} />
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-auto">
          <Segmented
            label="Układ grafiku"
            value={view}
            onChange={setView}
            options={[
              { value: "cars", label: "Auta" },
              { value: "drivers", label: "Kierowcy" },
            ]}
          />
        </div>
        {doubles + tired > 0 ? (
          <span className="enter inline-flex items-center gap-1.5 rounded-full bg-amber-soft px-3 py-1 text-[0.8125rem] font-medium text-amber">
            <Warning size={14} weight="fill" />
            {doubles > 0 ? `${doubles} ${plural(doubles, "zmiana", "zmiany", "zmian")} na dwóch autach` : ""}
            {doubles > 0 && tired > 0 ? ", " : ""}
            {tired > 0 ? `${tired} bez odpoczynku` : ""}
          </span>
        ) : null}
        {editable ? (
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
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
          </div>
        ) : null}
      </div>

      {/* Kierowca: najpierw własne zmiany. */}
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

      <style>{focusCss}</style>

      {view === "cars" ? (
        <div ref={grid} className="slots" data-pin={pinned ?? undefined} onMouseOver={onHover} onMouseLeave={onLeave}>
          {crew.length > 0 ? (
            <DriverPicker crew={crew} short={short} pinned={pinned} onPin={setPinned} />
          ) : null}

          {/* Komputer i tablet: cały tydzień, każde auto to blok dniówka + nocka. */}
          <Panel flush className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] table-fixed border-collapse text-left">
                <colgroup>
                  <col className="w-[156px]" />
                  <col className="w-[92px]" />
                  {dates.map((d) => (
                    <col key={d} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="sticky left-0 z-[1] bg-surface px-4 py-2.5 text-[0.75rem] font-medium text-ink-3">
                      Auto
                    </th>
                    <th scope="col" className="px-2 py-2.5 text-[0.75rem] font-medium text-ink-3">
                      Zmiana
                    </th>
                    {dates.map((date) => (
                      <DayHead key={date} date={date} today={today} />
                    ))}
                  </tr>
                </thead>
                {cars.map((v, i) => {
                  const u = usage.get(v.id) ?? { day: 0, night: 0 };
                  const ratio = share(u.day + u.night, 14);
                  const resting = v.status !== "active" && !usage.has(v.id);
                  return (
                    <tbody
                      key={v.id}
                      style={{ "--i": i } as CSSProperties}
                      className={cn("stagger-item border-b border-line last:border-b-0", resting && "opacity-60")}
                    >
                      {DUTIES.map((duty) => (
                        <tr key={duty} className={duty === "night" ? "bg-bg/70" : undefined}>
                          {duty === "day" ? (
                            <th
                              scope="rowgroup"
                              rowSpan={2}
                              className="sticky left-0 z-[1] border-r border-line bg-surface px-4 py-2.5 align-top font-normal"
                            >
                              <div className="flex flex-col items-start gap-1.5">
                                <Plate>{v.plate}</Plate>
                                <span className="text-[0.6875rem] leading-tight text-ink-3">{carMeta(v)}</span>
                                <span className="flex w-full items-center gap-2" title={`Obsadzone ${u.day + u.night} z 14 zmian`}>
                                  <MiniBar ratio={ratio} />
                                  <span className="num text-[0.75rem] font-semibold text-ink">{pct(ratio)}</span>
                                </span>
                              </div>
                            </th>
                          ) : null}
                          <td className={cn("px-2", duty === "day" ? "pt-2 pb-0.5" : "pt-0.5 pb-2")}>
                            <span className="flex items-center gap-1.5 text-[0.75rem] text-ink-2">
                              <DutyIcon duty={duty} />
                              {duty === "day" ? "Dzień" : "Noc"}
                              <span className="num ml-auto text-ink-3">{u[duty]}/7</span>
                            </span>
                          </td>
                          {dates.map((date) => (
                            <td
                              key={date}
                              className={cn(
                                "px-[3px]",
                                duty === "day" ? "pt-2 pb-0.5" : "pt-0.5 pb-2",
                                date === today && "bg-green-soft/40",
                              )}
                            >
                              {slot(v, date, duty)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  );
                })}
                {working.length > 0 ? (
                  <tfoot className="border-t-2 border-line bg-bg/60">
                    {DUTIES.map((duty) => (
                      <tr key={duty}>
                        {duty === "day" ? (
                          <th
                            scope="rowgroup"
                            rowSpan={2}
                            className="sticky left-0 z-[1] border-r border-line bg-bg px-4 py-2 align-middle font-normal"
                          >
                            <span className="text-[0.8125rem] font-semibold text-ink">Obsadzone</span>
                            <span className="mt-0.5 block text-[0.6875rem] text-ink-3">
                              z {working.length} {plural(working.length, "auta", "aut", "aut")}
                            </span>
                          </th>
                        ) : null}
                        <td className="px-2 py-1.5">
                          <span className="flex items-center gap-1.5 text-[0.75rem] text-ink-2">
                            <DutyIcon duty={duty} />
                            {duty === "day" ? "Dzień" : "Noc"}
                          </span>
                        </td>
                        {dates.map((date) => {
                          const n = onDay(date, duty);
                          return (
                            <td key={date} className={cn("px-2 py-1.5 text-center", date === today && "bg-green-soft/40")}>
                              <span className={cn("num text-[0.75rem] font-medium", n < working.length ? "text-amber" : "text-green-ink")}>
                                {n}/{working.length}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tfoot>
                ) : null}
              </table>
            </div>
          </Panel>

          {/* Telefon: jeden dzień naraz, każde auto osobno. */}
          <div className="md:hidden">
            {dayTabs}
            <Panel title={dayTitle} aside={working.length ? `${freeOn(dates[day])} wolnych` : undefined} flush>
              <ul key={dates[day]}>
                {cars.map((v, i) => {
                  const u = usage.get(v.id) ?? { day: 0, night: 0 };
                  const resting = v.status !== "active" && !usage.has(v.id);
                  return (
                    <li
                      key={v.id}
                      style={{ "--i": i } as CSSProperties}
                      className={cn("stagger-item border-b border-line px-4 py-3 last:border-b-0", resting && "opacity-60")}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <Plate>{v.plate}</Plate>
                        <span className="min-w-0 truncate text-[0.75rem] text-ink-3">{carMeta(v)}</span>
                        <span className="num ml-auto text-[0.75rem] font-semibold text-ink">
                          {pct(share(u.day + u.night, 14))}
                          <span className="ml-1 font-normal text-ink-3">tyg.</span>
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {DUTIES.map((duty) => (
                          <div key={duty} className="min-w-0">
                            <span className="mb-1 flex items-center gap-1 text-[0.6875rem] font-medium text-ink-3">
                              <DutyIcon duty={duty} size={12} />
                              {DUTY_LABEL[duty]}
                            </span>
                            {slot(v, dates[day], duty, "lg")}
                          </div>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </div>
        </div>
      ) : (
        <>
          {editable ? (
            <p className="mb-3 text-[0.8125rem] text-ink-3">
              Podgląd: kto i kiedy jeździ, na jakim aucie. Kierowców wpisujesz w układzie Auta.
            </p>
          ) : null}

          {/* Komputer i tablet: wiersz to kierowca, w polu auto i zmiana. */}
          <Panel flush className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] table-fixed border-collapse text-left">
                <colgroup>
                  <col className="w-[180px]" />
                  {dates.map((d) => (
                    <col key={d} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="sticky left-0 z-[1] bg-surface px-4 py-2.5 text-[0.75rem] font-medium text-ink-3">
                      Kierowca
                    </th>
                    {dates.map((date) => (
                      <DayHead key={date} date={date} today={today} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {crew.map((d, i) => {
                    const w = perDriver.get(d.id);
                    const isMe = d.id === meId;
                    return (
                      <tr
                        key={d.id}
                        style={{ "--i": i } as CSSProperties}
                        className={cn("stagger-item border-b border-line", w ? undefined : "text-ink-3")}
                      >
                        <th
                          scope="row"
                          className={cn(
                            "sticky left-0 z-[1] border-r border-line px-4 py-2 font-normal",
                            isMe ? "bg-green-soft" : "bg-surface",
                          )}
                        >
                          <span className={cn("block truncate text-[0.875rem]", w ? "font-medium text-ink" : "text-ink-3")}>
                            {d.name}
                          </span>
                          <span className="num mt-0.5 flex items-center gap-2 text-[0.75rem] text-ink-3">
                            {w ? (
                              <>
                                <span>
                                  {w.total} {plural(w.total, "zmiana", "zmiany", "zmian")}
                                </span>
                                <span className="inline-flex items-center gap-0.5">
                                  <Sun size={11} weight="fill" className="text-amber" />
                                  {w.day}
                                </span>
                                <span className="inline-flex items-center gap-0.5">
                                  <Moon size={11} weight="fill" className="text-green-deep-2" />
                                  {w.night}
                                </span>
                              </>
                            ) : (
                              "bez zmian"
                            )}
                          </span>
                        </th>
                        {dates.map((date) => {
                          const list = byDriverDay.get(`${d.id}|${date}`) ?? [];
                          return (
                            <td key={date} className={cn("px-1 py-1.5 align-top", date === today && "bg-green-soft/40")}>
                              <div className="flex flex-col gap-1">
                                {list.map((a) => (
                                  <ShiftPill key={a.duty + a.vehicleId} a={a} plate={plates.get(a.vehicleId)} problem={problems.get(slotKey(a.date, a.vehicleId, a.duty))} />
                                ))}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
                {working.length > 0 ? (
                  <tfoot className="bg-bg/60">
                    <tr>
                      <th scope="row" className="sticky left-0 z-[1] border-r border-line bg-bg px-4 py-2 font-normal">
                        <span className="text-[0.8125rem] font-semibold text-ink">Nieobsadzone</span>
                        <span className="mt-0.5 block text-[0.6875rem] text-ink-3">zmiany bez kierowcy</span>
                      </th>
                      {dates.map((date) => {
                        const free = freeOn(date);
                        return (
                          <td key={date} className={cn("px-2 py-2 text-center", date === today && "bg-green-soft/40")}>
                            <span className={cn("num text-[0.75rem] font-medium", free > 0 ? "text-amber" : "text-green-ink")}>
                              {free > 0 ? free : "komplet"}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </Panel>

          {/* Telefon: wybrany dzień, kto ma dniówkę, kto nockę, kto wolne. */}
          <div className="md:hidden">
            {dayTabs}
            <Panel title={dayTitle} flush>
              <div key={dates[day]}>
                {DUTIES.map((duty) => {
                  const list = thisWeek
                    .filter((a) => a.date === dates[day] && a.duty === duty)
                    .sort((a, b) => (names.get(a.driverId) ?? "").localeCompare(names.get(b.driverId) ?? "", "pl"));
                  return (
                    <section key={duty} className="border-b border-line">
                      <h3 className="flex items-center gap-1.5 bg-bg/70 px-4 py-2 text-[0.75rem] font-semibold text-ink-2">
                        <DutyIcon duty={duty} size={12} />
                        {DUTY_LABEL[duty]}
                        <span className="num ml-auto font-normal text-ink-3">
                          {list.length}/{working.length} aut
                        </span>
                      </h3>
                      {list.length === 0 ? (
                        <p className="px-4 py-3 text-[0.8125rem] text-ink-3">Nikt nie jeździ.</p>
                      ) : (
                        <ul>
                          {list.map((a, i) => {
                            const problem = problems.get(slotKey(a.date, a.vehicleId, a.duty));
                            return (
                              <li
                                key={a.vehicleId}
                                style={{ "--i": i } as CSSProperties}
                                className={cn(
                                  "stagger-item flex items-center gap-2 border-t border-line px-4 py-2.5 first:border-t-0",
                                  a.driverId === meId && "bg-green-soft/60",
                                )}
                              >
                                {problem ? <Warning size={14} weight="fill" className={problem === "double" ? "text-red" : "text-amber"} /> : null}
                                <span className="min-w-0 truncate text-[0.875rem] text-ink">
                                  {names.get(a.driverId) ?? "Usunięty kierowca"}
                                </span>
                                <span className="ml-auto">
                                  <Plate>{plates.get(a.vehicleId) ?? "?"}</Plate>
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                  );
                })}
                {(() => {
                  const off = pickable.filter((d) => !thisWeek.some((a) => a.date === dates[day] && a.driverId === d.id));
                  return off.length > 0 ? (
                    <p className="px-4 py-3 text-[0.8125rem] leading-relaxed text-ink-3">
                      <span className="font-medium text-ink-2">Wolne: </span>
                      {off.map((d) => short.get(d.id) ?? d.name).join(", ")}
                    </p>
                  ) : null;
                })()}
              </div>
            </Panel>
          </div>
        </>
      )}
    </>
  );
}

function DayHead({ date, today }: { date: string; today: string }) {
  const l = dayLabel(date);
  const isToday = date === today;
  return (
    <th
      scope="col"
      className={cn(
        "px-2 py-2 text-center text-[0.75rem] font-medium",
        isToday ? "bg-green-soft/70 text-green-ink" : "text-ink-3",
      )}
    >
      <span className={cn("capitalize", isToday && "font-semibold")}>{isToday ? "dziś" : l.short}</span>{" "}
      <span className="num">{l.date}</span>
    </th>
  );
}

/** Lista kierowców nad siatką: ile mają zmian, kliknięcie podświetla ich w całym tygodniu. */
function DriverPicker({
  crew,
  short,
  pinned,
  onPin,
}: {
  crew: Array<{ id: string; name: string; total: number }>;
  short: Map<string, string>;
  pinned: string | null;
  onPin: (id: string | null) => void;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="hidden shrink-0 text-[0.75rem] text-ink-3 sm:inline">Podświetl:</span>
      <div className="-mx-4 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
        {crew.map((d) => {
          const on = pinned === d.id;
          return (
            <button
              key={d.id}
              type="button"
              aria-pressed={on}
              onClick={() => onPin(on ? null : d.id)}
              title={d.name}
              className={cn(
                "press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border pr-1.5 pl-3 text-[0.8125rem] transition-colors duration-150",
                on
                  ? "border-green bg-green text-white"
                  : "border-line-strong bg-surface text-ink-2 hover:border-ink-3 hover:text-ink",
              )}
            >
              {short.get(d.id) ?? d.name}
              <span
                className={cn(
                  "num inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[0.6875rem] font-semibold",
                  on ? "bg-white/20 text-white" : d.total ? "bg-sunken text-ink-2" : "bg-amber-soft text-amber",
                )}
              >
                {d.total}
              </span>
            </button>
          );
        })}
      </div>
      {pinned ? (
        <button
          type="button"
          onClick={() => onPin(null)}
          aria-label="Wyłącz podświetlenie"
          className="press inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-sunken hover:text-ink"
        >
          <X size={15} />
        </button>
      ) : null}
    </div>
  );
}

/** Zmiana w widoku kierowców: ikona pory i tablica auta. */
function ShiftPill({ a, plate, problem }: { a: Assignment; plate: string | undefined; problem: Conflict | undefined }) {
  return (
    <span
      title={problem ? CONFLICT_TEXT[problem] : `${DUTY_LABEL[a.duty]}, ${plate ?? "auto usunięte"}`}
      className={cn(
        "flex h-8 min-w-0 items-center gap-1.5 rounded-[7px] px-2",
        a.duty === "day" ? "bg-amber-soft/70" : "bg-sunken",
        problem === "double" && "bg-red-soft text-red shadow-[inset_0_0_0_1px_var(--color-red)]",
        problem === "rest" && "shadow-[inset_0_0_0_1px_var(--color-amber)]",
      )}
    >
      {problem ? <Warning size={12} weight="fill" className="shrink-0" /> : <DutyIcon duty={a.duty} size={12} className="shrink-0" />}
      <span className="truncate font-mono text-[0.75rem] font-medium tracking-wide text-ink">{plate ?? "?"}</span>
    </span>
  );
}

/** Wąski pasek proporcji. */
function MiniBar({ ratio }: { ratio: number }): ReactNode {
  return (
    <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-sunken">
      <span
        className={cn("bar-grow block h-full w-full rounded-full", ratio < 0.5 ? "bg-amber" : "bg-green")}
        style={{ transform: `scaleX(${ratio})` }}
      />
    </span>
  );
}

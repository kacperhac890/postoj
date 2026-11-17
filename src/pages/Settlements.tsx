import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Check, Receipt } from "@phosphor-icons/react";
import { fuelNet, settle } from "../domain/engine";
import { num1, pct, plural, zl, zlExact } from "../domain/format";
import type { Driver, Entry, Vehicle } from "../domain/types";
import { driverWeeks } from "../domain/schedule";
import { lastFullWeek, weekNumber } from "../domain/week";
import { useSession } from "../data/session";
import { MySettlements } from "./MySettlements";
import { newId, useFleet } from "../store/useFleet";
import { Sheet, useRetained } from "../ui/Sheet";
import { toast } from "../ui/Toast";
import { Tween } from "../ui/motion";
import { WeekSwitcher } from "../ui/WeekSwitcher";
import {
  Badge,
  Button,
  Empty,
  Field,
  NumberInput,
  OptionalNumberInput,
  PageHeader,
  Panel,
  Plate,
  Row,
  Select,
  Toggle,
  cn,
} from "../ui/kit";

const COLS =
  "md:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,0.55fr)_minmax(0,0.55fr)_minmax(0,0.7fr)_minmax(0,1fr)_7.5rem]";

interface Line {
  driver: Driver;
  vehicle: Vehicle | undefined;
  entry: Entry | undefined;
  /** Liczba zmian w grafiku w tym tygodniu. */
  shifts: number;
}

export function Settlements() {
  const role = useSession((s) => s.role);
  /* Konto kierowcy widzi wyłącznie własne rozliczenia, bez kwot spółki. */
  if (role !== "admin") return <MySettlements />;
  return <FleetSettlements />;
}

function FleetSettlements() {
  const drivers = useFleet((s) => s.drivers);
  const schedule = useFleet((s) => s.schedule);
  const vehicles = useFleet((s) => s.vehicles);
  const entries = useFleet((s) => s.entries);
  const params = useFleet((s) => s.params);
  const saveEntry = useFleet((s) => s.saveEntry);
  const removeEntry = useFleet((s) => s.removeEntry);
  const setPaid = useFleet((s) => s.setPaid);

  const [week, setWeek] = useState(lastFullWeek);
  const [draft, setDraft] = useState<Entry | null>(null);
  const shown = useRetained(draft);

  /* Zmiany z grafiku w tym tygodniu: kto jeździł i na czym najczęściej. */
  const worked = useMemo(() => driverWeeks(schedule, week), [schedule, week]);
  const [extra, setExtra] = useState<string[]>([]);

  /* W tygodniu pokazujemy kierowców, którzy mieli zmiany w grafiku, każdego
     z wpisanym rozliczeniem (nawet jeśli potem odszedł) i dodanych ręcznie. */
  const lines = useMemo<Line[]>(() => {
    const inWeek = entries.filter((e) => e.week === week);
    return drivers
      .map((driver) => {
        const entry = inWeek.find((e) => e.driverId === driver.id);
        const main = worked.get(driver.id)?.cars[0]?.vehicleId;
        const vehicle = vehicles.find((v) => v.id === (entry?.vehicleId ?? main));
        return { driver, vehicle, entry, shifts: worked.get(driver.id)?.total ?? 0 };
      })
      .filter((l) => l.entry || l.shifts > 0 || extra.includes(`${week}:${l.driver.id}`))
      .sort(
        (a, b) =>
          (a.vehicle?.plate ?? "").localeCompare(b.vehicle?.plate ?? "") ||
          a.driver.name.localeCompare(b.driver.name, "pl"),
      );
  }, [drivers, vehicles, entries, week]);

  const totals = useMemo(() => {
    let toPay = 0;
    let toCollect = 0;
    let revenue = 0;
    let margin = 0;
    const unpaid: string[] = [];
    for (const l of lines) {
      if (!l.entry) continue;
      const s = settle(l.entry, params);
      revenue += l.entry.revenue;
      margin += s.margin;
      /* Właściciel nie dostaje wypłaty: nie ma czego rozliczać. */
      if (!l.entry.paid && !s.ownerDrive) {
        unpaid.push(l.entry.id);
        if (l.entry.mode === "commission") toPay += s.payout;
        else toCollect += s.dueFromDriver;
      }
    }
    return { toPay, toCollect, revenue, margin, unpaid };
  }, [lines, params]);

  const missing = lines.filter((l) => !l.entry).length;
  const shownDriver = shown ? drivers.find((d) => d.id === shown.driverId) : undefined;
  const shownVehicle = shown ? vehicles.find((v) => v.id === shown.vehicleId) : undefined;
  const preview = shown ? settle(shown, params) : null;
  const isNew = shown ? !entries.some((e) => e.id === shown.id) : false;
  const patch = (p: Partial<Entry>) => setDraft((d) => (d ? { ...d, ...p } : d));

  function open(l: Line) {
    if (l.entry) {
      setDraft(l.entry);
      return;
    }
    /* Auto z grafiku, a bez grafiku pierwsze jeżdżące. Można je zmienić w formularzu. */
    const car = l.vehicle ?? vehicles.find((v) => v.status === "active") ?? vehicles[0];
    if (!car) return;
    setDraft({
      id: newId(),
      driverId: l.driver.id,
      week,
      mode: car.mode,
      student: l.driver.student,
      owner: l.driver.owner,
      vehicleId: car.id,
      fuelGross: null,
      revenue: 0,
      hours: 0,
      trips: 0,
      bonus: 0,
      deduction: 0,
      paid: false,
    });
  }

  function save() {
    if (!draft) return;
    saveEntry(draft);
    toast.ok("Rozliczenie zapisane.");
    setDraft(null);
  }

  const noFleet = drivers.length === 0 || vehicles.length === 0;

  return (
    <>
      <PageHeader
        title="Rozliczenia"
        lead="Wpisujesz utarg netto po prowizji aplikacji, godziny online i liczbę kursów. Resztę liczy aplikacja według stawek z ustawień."
      >
        <WeekSwitcher week={week} onChange={setWeek} />
      </PageHeader>

      {lines.length > 0 ? (
        <dl className="mb-4 grid grid-cols-2 overflow-hidden rounded-panel border border-line bg-surface md:grid-cols-4">
          {[
            {
              label: "Do wypłaty kierowcom",
              value: <Tween value={totals.toPay} format={zl} />,
              accent: totals.toPay > 0,
            },
            {
              label: "Do pobrania od najemców",
              value: <Tween value={totals.toCollect} format={zl} />,
              accent: totals.toCollect > 0,
            },
            { label: "Utarg z aplikacji", value: <Tween value={totals.revenue} format={zl} />, accent: false },
            {
              label: "Zostaje po kierowcach i paliwie",
              value: <Tween value={totals.margin} format={zl} />,
              accent: false,
            },
          ].map((item, i) => (
            <div
              key={item.label}
              className={cn(
                "border-line px-4 py-3 md:px-5 md:py-4",
                i % 2 === 1 && "border-l",
                i >= 2 && "border-t md:border-t-0",
                i === 2 && "md:border-l",
              )}
            >
              <dt className="text-[0.75rem] text-ink-3">{item.label}</dt>
              <dd
                className={cn(
                  "num mt-0.5 text-[1.125rem] font-semibold tracking-[-0.01em] md:text-[1.25rem]",
                  item.accent ? "text-green-ink" : "text-ink",
                )}
              >
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <Panel
        flush
        title={lines.length > 0 ? `Tydzień ${weekNumber(week)}` : undefined}
        aside={
          lines.length > 0 ? (
            <span className="flex items-center gap-3">
              {missing > 0 ? (
                <span className="hidden text-amber sm:inline">
                  {missing} {plural(missing, "kierowca", "kierowców", "kierowców")} bez danych
                </span>
              ) : null}
              {totals.unpaid.length > 0 ? (
                <Button
                  size="sm"
                  onClick={() => {
                    const n = totals.unpaid.length;
                    setPaid(totals.unpaid, true);
                    toast.ok(`Oznaczono ${n} ${plural(n, "rozliczenie", "rozliczenia", "rozliczeń")} jako rozliczone.`);
                  }}
                >
                  <Check size={14} weight="bold" />
                  Rozlicz wszystkie
                </Button>
              ) : null}
            </span>
          ) : undefined
        }
      >
        {lines.length === 0 ? (
          <Empty
            icon={<Receipt size={20} />}
            title={noFleet ? "Najpierw dodaj auto i kierowcę" : "W tym tygodniu nikt nie ma zmian w grafiku"}
            action={
              <Link
                to={noFleet ? (vehicles.length === 0 ? "/flota" : "/kierowcy") : "/grafik"}
                className="press inline-flex h-10 items-center rounded-control bg-green px-4 text-[0.9375rem] font-medium text-white hover:bg-green-hover"
              >
                {noFleet ? (vehicles.length === 0 ? "Przejdź do floty" : "Przejdź do kierowców") : "Otwórz grafik"}
              </Link>
            }
          >
            {noFleet
              ? "Rozliczenie tygodnia powstaje dla każdego kierowcy, który ma zmiany w grafiku."
              : "Rozliczenie powstaje dla każdego, kto ma w tym tygodniu zmiany w grafiku. Kierowcę spoza grafiku dodasz poniżej."}
          </Empty>
        ) : (
          <>
            <div
              className={cn(
                "hidden gap-3 border-b border-line px-5 py-2.5 text-[0.75rem] font-medium text-ink-3 md:grid",
                COLS,
              )}
            >
              <span>Kierowca</span>
              <span className="text-right">Utarg</span>
              <span className="text-right">Godziny</span>
              <span className="text-right">Kursy</span>
              <span className="text-right">Na godzinę</span>
              <span className="text-right">Kwota</span>
              <span className="text-right">Stan</span>
            </div>
            <ul>
              {lines.map((l, i) => {
                const s = l.entry ? settle(l.entry, params) : null;
                const rental = (l.entry?.mode ?? l.vehicle?.mode) === "rental";
                return (
                  <li
                    key={l.driver.id}
                    style={{ "--i": i } as CSSProperties}
                    className={cn(
                      "stagger-item grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 last:border-b-0 md:px-5",
                      COLS,
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => open(l)}
                      className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-left md:col-span-1"
                    >
                      <span className="truncate text-[0.9375rem] font-medium text-ink underline-offset-2 hover:underline">
                        {l.driver.name}
                      </span>
                      {l.vehicle ? <Plate>{l.vehicle.plate}</Plate> : null}
                      {rental && !s?.ownerDrive ? <Badge>Wynajem</Badge> : null}
                      {(l.entry ? l.entry.owner : l.driver.owner) ? <Badge tone="green">Właściciel</Badge> : null}
                      {l.shifts > 0 ? (
                        <span className="num text-[0.75rem] text-ink-3">
                          {l.shifts} {plural(l.shifts, "zmiana", "zmiany", "zmian")}
                        </span>
                      ) : null}
                      {s?.reached ? <Badge tone="green">Próg kursów</Badge> : null}
                    </button>

                    {l.entry && s ? (
                      <>
                        <span className="num hidden text-right text-[0.9375rem] text-ink md:block">
                          {zl(l.entry.revenue)}
                        </span>
                        <span className="num hidden text-right text-[0.875rem] text-ink-2 md:block">
                          {num1(l.entry.hours)}
                        </span>
                        <span className="num hidden text-right text-[0.875rem] text-ink-2 md:block">
                          {l.entry.trips}
                        </span>
                        <span className="num hidden text-right text-[0.875rem] text-ink-2 md:block">
                          {num1(s.ratePerHour)} zł
                        </span>

                        {/* Telefon: liczby w jednej linii pod nazwiskiem */}
                        <span className="num text-[0.8125rem] text-ink-2 md:hidden">
                          {zl(l.entry.revenue)} · {num1(l.entry.hours)} h · {l.entry.trips} kursów ·{" "}
                          {num1(s.ratePerHour)} zł/h
                        </span>
                        <span className="text-right">
                          <span className="num block text-[0.9375rem] font-semibold text-ink">
                            {zl(s.ownerDrive ? s.income : rental ? s.dueFromDriver : s.payout)}
                          </span>
                          <span className="block text-[0.6875rem] text-ink-3">
                            {s.ownerDrive
                              ? "całość do spółki"
                              : rental
                                ? "do pobrania"
                                : s.topUp > 0
                                  ? "z dopłatą do minimum"
                                  : `stawka ${pct(s.rate)}`}
                          </span>
                        </span>
                        {s.ownerDrive ? (
                          <span className="col-span-2 text-[0.8125rem] text-ink-3 md:col-span-1 md:text-right">
                            Bez wypłaty
                          </span>
                        ) : (
                          <span className="col-span-2 md:col-span-1 md:text-right">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={l.entry.paid}
                              aria-label={`Rozliczone: ${l.driver.name}`}
                              onClick={() => setPaid([l.entry!.id], !l.entry!.paid)}
                              className={cn(
                                "press inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[0.8125rem] font-medium transition-colors duration-200",
                                l.entry.paid
                                  ? "border-green-line bg-green-soft text-green-ink"
                                  : "border-line-strong bg-surface text-ink-2 hover:bg-sunken",
                              )}
                            >
                              {l.entry.paid ? <Check size={13} weight="bold" className="check-pop" /> : null}
                              {l.entry.paid ? "Rozliczone" : "Do rozliczenia"}
                            </button>
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="text-[0.8125rem] text-ink-3 md:col-span-5">Brak danych za ten tydzień</span>
                        <span className="text-right">
                          <Button size="sm" variant="primary" onClick={() => open(l)}>
                            Wpisz
                          </Button>
                        </span>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Panel>

      {(() => {
        const others = drivers
          .filter((d) => d.active && !lines.some((l) => l.driver.id === d.id))
          .sort((a, b) => a.name.localeCompare(b.name, "pl"));
        if (others.length === 0 || vehicles.length === 0) return null;
        return (
          <label className="mt-3 flex flex-wrap items-center gap-2 text-[0.8125rem] text-ink-2">
            <span>Rozliczenie kierowcy spoza grafiku:</span>
            <span className="w-56">
              <Select
                value=""
                onChange={(e) => {
                  const d = drivers.find((x) => x.id === e.target.value);
                  if (!d) return;
                  setExtra((x) => [...x, `${week}:${d.id}`]);
                  open({ driver: d, vehicle: undefined, entry: undefined, shifts: 0 });
                }}
                className="h-9"
              >
                <option value="">wybierz kierowcę</option>
                {others.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </span>
          </label>
        );
      })()}

      <Sheet
        open={draft !== null}
        onClose={() => setDraft(null)}
        onSubmit={save}
        title={shownDriver ? `${shownDriver.name}, tydzień ${shown ? weekNumber(shown.week) : ""}` : "Rozliczenie"}
        footer={
          <>
            <Button variant="primary" type="submit">
              Zapisz
            </Button>
            <Button onClick={() => setDraft(null)}>Anuluj</Button>
            {!isNew && shown ? (
              <Button
                variant="danger"
                className="ml-auto"
                onClick={() => {
                  if (window.confirm("Usunąć to rozliczenie?")) {
                    removeEntry(shown.id);
                    setDraft(null);
                  }
                }}
              >
                Usuń
              </Button>
            ) : null}
          </>
        }
      >
        {shown && preview ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2 text-[0.8125rem] text-ink-2">
              <Badge>{shown.mode === "rental" ? "Wynajem" : "Na procent"}</Badge>
              {shown.mode === "commission" && !shown.owner ? (
                <Badge tone={shown.student ? "green" : "neutral"}>
                  {shown.student ? "Student" : "Bez statusu studenta"}
                </Badge>
              ) : null}
            </div>

            <Field
              label="Auto w tym tygodniu"
              hint={
                shownDriver && worked.get(shownDriver.id)
                  ? `Z grafiku: ${worked
                      .get(shownDriver.id)!
                      .cars.map((c) => `${vehicles.find((v) => v.id === c.vehicleId)?.plate ?? "?"} (${c.count})`)
                      .join(", ")}. Sposób rozliczenia wynika z auta.`
                  : "Sposób rozliczenia (procent albo wynajem) wynika z auta."
              }
            >
              <Select
                value={shown.vehicleId ?? ""}
                onChange={(e) => {
                  const car = vehicles.find((v) => v.id === e.target.value);
                  if (car) patch({ vehicleId: car.id, mode: car.mode });
                }}
              >
                {!shownVehicle && shown.vehicleId ? <option value={shown.vehicleId}>Usunięte auto</option> : null}
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate} · {v.mode === "rental" ? "wynajem" : "na procent"}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Utarg netto z aplikacji" hint="Po prowizji aplikacji, bez napiwków.">
              <NumberInput value={shown.revenue} onChange={(revenue) => patch({ revenue })} suffix="zł" autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Godziny online">
                <NumberInput value={shown.hours} onChange={(hours) => patch({ hours })} suffix="h" />
              </Field>
              <Field label="Liczba kursów" hint={`Próg: ${params.tripThreshold}`}>
                <NumberInput value={shown.trips} onChange={(trips) => patch({ trips: Math.round(trips) })} />
              </Field>
            </div>
            {shown.mode === "commission" || shown.owner ? (
              <Field
                label="Paliwo, realny koszt brutto"
                hint={
                  shown.fuelGross === null
                    ? `Z rachunków lub karty paliwowej tego auta za ten tydzień. Puste pole: szacunek ${zl(
                        fuelNet({ hours: shown.hours, fuelGross: null }, params) * (1 + params.vatStd),
                      )} brutto z godzin online.`
                    : "Wpisany koszt zastępuje szacunek. Wyczyść pole, żeby wrócić do szacunku."
                }
              >
                <OptionalNumberInput
                  value={shown.fuelGross}
                  onChange={(fuelGross) => patch({ fuelGross })}
                  suffix="zł"
                  placeholder="szacunek"
                />
              </Field>
            ) : null}

            <Toggle
              checked={shown.owner}
              onChange={(owner) => patch({ owner })}
              label="Jeździł właściciel spółki"
              hint="Bez wypłaty i składek. Utarg w całości trafia do spółki."
            />

            {!shown.owner ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Premia">
                  <NumberInput value={shown.bonus} onChange={(bonus) => patch({ bonus })} suffix="zł" />
                </Field>
                <Field label="Potrącenie" hint="Mandat, szkoda, zaliczka.">
                  <NumberInput value={shown.deduction} onChange={(deduction) => patch({ deduction })} suffix="zł" />
                </Field>
              </div>
            ) : null}

            <div className="rounded-control bg-sunken px-4 py-3" aria-live="polite">
              {preview.ownerDrive ? (
                <>
                  <Row label="Utarg dla spółki" value={zlExact(preview.income)} />
                  <Row label="Wypłata" hint="właściciel" value={zlExact(0)} />
                  <Row
                    label="Paliwo netto"
                    hint={preview.fuelActual ? "z rachunków" : "szacunek"}
                    value={zlExact(-preview.lpgNet)}
                  />
                  <div className="my-1.5 border-t border-line-strong" />
                  <Row
                    label="Zostaje spółce"
                    hint="przed kosztami auta"
                    value={zlExact(preview.margin)}
                    strong
                    tone={preview.margin < 0 ? "red" : "green"}
                  />
                </>
              ) : shown.mode === "commission" ? (
                <>
                  <Row
                    label="Udział w utargu"
                    hint={`${pct(preview.rate)}${preview.reached ? ", próg kursów" : ""}`}
                    value={zlExact(preview.share)}
                  />
                  {preview.topUp > 0 ? (
                    <Row
                      label="Dopłata do minimalnej stawki"
                      hint={`do ${zlExact(params.minWage)} za godzinę`}
                      value={zlExact(preview.topUp)}
                    />
                  ) : null}
                  {shown.bonus > 0 ? <Row label="Premia" value={zlExact(shown.bonus)} /> : null}
                  {shown.deduction > 0 ? <Row label="Potrącenie" value={zlExact(-shown.deduction)} /> : null}
                  <div className="my-1.5 border-t border-line-strong" />
                  <Row label="Do wypłaty brutto" value={zlExact(preview.payout)} strong tone="green" />
                  <div className="mt-2 border-t border-line pt-2">
                    {preview.employerZus > 0 ? (
                      <Row label="ZUS pracodawcy" value={zlExact(preview.employerZus)} />
                    ) : null}
                    <Row
                      label="Paliwo netto"
                      hint={preview.fuelActual ? "z rachunków" : "szacunek"}
                      value={zlExact(preview.lpgNet)}
                    />
                    <Row
                      label="Zostaje spółce"
                      hint="przed kosztami auta"
                      value={zlExact(preview.margin)}
                      tone={preview.margin < 0 ? "red" : undefined}
                    />
                  </div>
                </>
              ) : (
                <>
                  <Row
                    label="Czynsz tygodniowy brutto"
                    hint={preview.reached ? "obniżony, próg kursów" : undefined}
                    value={zlExact(preview.rentGross)}
                  />
                  <Row label="Opłata od utargu" hint={pct(params.rentalFee)} value={zlExact(preview.fee)} />
                  {shown.deduction > 0 ? <Row label="Potrącenie" value={zlExact(shown.deduction)} /> : null}
                  {shown.bonus > 0 ? <Row label="Premia" value={zlExact(-shown.bonus)} /> : null}
                  <div className="my-1.5 border-t border-line-strong" />
                  <Row label="Do pobrania od kierowcy" value={zlExact(preview.dueFromDriver)} strong tone="green" />
                  <div className="mt-2 border-t border-line pt-2">
                    <Row label="Przychód spółki netto" hint="czynsz bez VAT i opłata" value={zlExact(preview.income)} />
                  </div>
                </>
              )}
              {shown.hours > 0 ? (
                <p className="num mt-2 text-[0.75rem] text-ink-3">
                  Stawka z aplikacji: {num1(preview.ratePerHour)} zł netto na godzinę online.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}

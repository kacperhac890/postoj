import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Receipt } from "@phosphor-icons/react";
import { settle } from "../domain/engine";
import { num1, pct, plural, zl, zlExact } from "../domain/format";
import type { Driver, Entry, Vehicle } from "../domain/types";
import { lastFullWeek, weekNumber } from "../domain/week";
import { newId, useFleet } from "../store/useFleet";
import { Sheet, useRetained } from "../ui/Sheet";
import { WeekSwitcher } from "../ui/WeekSwitcher";
import { Badge, Button, Empty, Field, NumberInput, PageHeader, Panel, Plate, Row, cn } from "../ui/kit";

const COLS =
  "md:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,0.55fr)_minmax(0,0.55fr)_minmax(0,0.7fr)_minmax(0,1fr)_7.5rem]";

interface Line {
  driver: Driver;
  vehicle: Vehicle | undefined;
  entry: Entry | undefined;
}

export function Settlements() {
  const drivers = useFleet((s) => s.drivers);
  const vehicles = useFleet((s) => s.vehicles);
  const entries = useFleet((s) => s.entries);
  const params = useFleet((s) => s.params);
  const saveEntry = useFleet((s) => s.saveEntry);
  const removeEntry = useFleet((s) => s.removeEntry);
  const setPaid = useFleet((s) => s.setPaid);

  const [week, setWeek] = useState(lastFullWeek);
  const [draft, setDraft] = useState<Entry | null>(null);
  const shown = useRetained(draft);

  /* W tygodniu pokazujemy aktywnych kierowców z autem oraz każdego,
     kto ma już w nim rozliczenie, nawet jeśli potem odszedł. */
  const lines = useMemo<Line[]>(() => {
    const inWeek = entries.filter((e) => e.week === week);
    return drivers
      .map((driver) => {
        const entry = inWeek.find((e) => e.driverId === driver.id);
        const vehicle = vehicles.find((v) => v.id === (entry?.vehicleId ?? driver.vehicleId));
        return { driver, vehicle, entry };
      })
      .filter((l) => l.entry || (l.driver.active && l.vehicle))
      .sort((a, b) => (a.vehicle?.plate ?? "").localeCompare(b.vehicle?.plate ?? "") || a.driver.name.localeCompare(b.driver.name, "pl"));
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
      if (!l.entry.paid) {
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
    if (!l.vehicle) return;
    setDraft({
      id: newId(),
      driverId: l.driver.id,
      week,
      mode: l.vehicle.mode,
      student: l.driver.student,
      vehicleId: l.vehicle.id,
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
            { label: "Do wypłaty kierowcom", value: zl(totals.toPay), accent: totals.toPay > 0 },
            { label: "Do pobrania od najemców", value: zl(totals.toCollect), accent: totals.toCollect > 0 },
            { label: "Utarg z aplikacji", value: zl(totals.revenue), accent: false },
            { label: "Zostaje po kierowcach i paliwie", value: zl(totals.margin), accent: false },
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
                <Button size="sm" onClick={() => setPaid(totals.unpaid, true)}>
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
            title={noFleet ? "Najpierw dodaj auto i kierowcę" : "W tym tygodniu nie ma kogo rozliczać"}
            action={
              noFleet ? (
                <Link
                  to={vehicles.length === 0 ? "/flota" : "/kierowcy"}
                  className="press inline-flex h-10 items-center rounded-control bg-green px-4 text-[0.9375rem] font-medium text-white hover:bg-green-hover"
                >
                  {vehicles.length === 0 ? "Przejdź do floty" : "Przejdź do kierowców"}
                </Link>
              ) : undefined
            }
          >
            {noFleet
              ? "Rozliczenie tygodnia powstaje dla każdego aktywnego kierowcy, który ma przypisane auto."
              : "Przypisz kierowcom auta, a pojawią się tutaj co tydzień."}
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
              {lines.map((l) => {
                const s = l.entry ? settle(l.entry, params) : null;
                const rental = (l.entry?.mode ?? l.vehicle?.mode) === "rental";
                return (
                  <li
                    key={l.driver.id}
                    className={cn(
                      "grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 last:border-b-0 md:px-5",
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
                      {rental ? <Badge>Wynajem</Badge> : null}
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
                            {zl(rental ? s.dueFromDriver : s.payout)}
                          </span>
                          <span className="block text-[0.6875rem] text-ink-3">
                            {rental ? "do pobrania" : s.topUp > 0 ? "z dopłatą do minimum" : `stawka ${pct(s.rate)}`}
                          </span>
                        </span>
                        <span className="col-span-2 md:col-span-1 md:text-right">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={l.entry.paid}
                            aria-label={`Rozliczone: ${l.driver.name}`}
                            onClick={() => setPaid([l.entry!.id], !l.entry!.paid)}
                            className={cn(
                              "press inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[0.8125rem] font-medium",
                              l.entry.paid
                                ? "border-green-line bg-green-soft text-green-ink"
                                : "border-line-strong bg-surface text-ink-2 hover:bg-sunken",
                            )}
                          >
                            {l.entry.paid ? <Check size={13} weight="bold" /> : null}
                            {l.entry.paid ? "Rozliczone" : "Do rozliczenia"}
                          </button>
                        </span>
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
              {shownVehicle ? <Plate>{shownVehicle.plate}</Plate> : null}
              <Badge>{shown.mode === "rental" ? "Wynajem" : "Na procent"}</Badge>
              {shown.mode === "commission" ? (
                <Badge tone={shown.student ? "green" : "neutral"}>
                  {shown.student ? "Student" : "Bez statusu studenta"}
                </Badge>
              ) : null}
            </div>

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
            <div className="grid grid-cols-2 gap-3">
              <Field label="Premia">
                <NumberInput value={shown.bonus} onChange={(bonus) => patch({ bonus })} suffix="zł" />
              </Field>
              <Field label="Potrącenie" hint="Mandat, szkoda, zaliczka.">
                <NumberInput value={shown.deduction} onChange={(deduction) => patch({ deduction })} suffix="zł" />
              </Field>
            </div>

            <div className="rounded-control bg-sunken px-4 py-3" aria-live="polite">
              {shown.mode === "commission" ? (
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
                    <Row label="LPG, szacunek netto" value={zlExact(preview.lpgNet)} />
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

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Car, Check, Plus } from "@phosphor-icons/react";
import { vehicleMonthlyNet } from "../domain/engine";
import { daysUntil, plural, shortDate, toIso, zl } from "../domain/format";
import { MODE_LABEL, PREP_STEPS, STATUS_LABEL } from "../domain/labels";
import { weekNumber } from "../domain/week";
import type { Mode, Vehicle, VehicleStatus } from "../domain/types";
import { newId, useFleet } from "../store/useFleet";
import { ListToolbar, NoMatches, fold } from "../ui/Filters";
import { Sheet, useRetained } from "../ui/Sheet";
import { toast } from "../ui/Toast";
import {
  Badge,
  Button,
  Empty,
  Field,
  NumberInput,
  PageHeader,
  Panel,
  Plate,
  Segmented,
  Select,
  TextInput,
  cn,
} from "../ui/kit";

const blank = (): Vehicle => {
  const year = new Date();
  const nextYear = new Date(year.getFullYear() + 1, year.getMonth(), year.getDate());
  return {
    id: newId(),
    plate: "",
    model: "",
    year: year.getFullYear(),
    mode: "commission",
    leaseNet: 1100,
    insurance: 550,
    serviceGross: 400,
    status: "idle",
    inspectionDue: toIso(nextYear),
    insuranceDue: toIso(nextYear),
    prep: { inspection: false, registration: false, marking: false, extract: false, meter: false },
  };
};

/** Termin: zwykła data, a przy zbliżającym się albo przekroczonym znacznik. */
export function Deadline({ label, iso }: { label: string; iso: string }) {
  const days = daysUntil(iso);
  if (days === null) return <span className="text-ink-3">{label}: brak daty</span>;
  if (days < 0) return <Badge tone="red">{label} po terminie</Badge>;
  if (days <= 30)
    return (
      <Badge tone="amber">
        {label} za {days} {plural(days, "dzień", "dni", "dni")}
      </Badge>
    );
  return (
    <span className="num text-ink-2">
      {label} {shortDate(iso)}
    </span>
  );
}

type Filter = "all" | "active" | "service" | "idle" | "attention";

/** Auto wymaga uwagi: termin w ciągu 30 dni, nieukończone przygotowanie albo brak kierowcy. */
function needsAttention(v: Vehicle, hasCrew: boolean) {
  const soon = [v.inspectionDue, v.insuranceDue].some((iso) => {
    const d = daysUntil(iso);
    return d !== null && d <= 30;
  });
  const prep = PREP_STEPS.some((s) => !v.prep[s.key]);
  return soon || prep || (v.status === "active" && !hasCrew);
}

const COLS = "md:grid-cols-[minmax(0,2fr)_minmax(0,0.7fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1.6fr)]";

export function Fleet() {
  const vehicles = useFleet((s) => s.vehicles);
  const drivers = useFleet((s) => s.drivers);
  const params = useFleet((s) => s.params);
  const saveVehicle = useFleet((s) => s.saveVehicle);
  const removeVehicle = useFleet((s) => s.removeVehicle);

  const [draft, setDraft] = useState<Vehicle | null>(null);
  const shown = useRetained(draft);
  const isNew = shown ? !vehicles.some((v) => v.id === shown.id) : false;
  const patch = (p: Partial<Vehicle>) => setDraft((d) => (d ? { ...d, ...p } : d));

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const crewOf = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const d of drivers) {
      if (!d.active || !d.vehicleId) continue;
      map.set(d.vehicleId, [...(map.get(d.vehicleId) ?? []), d.name]);
    }
    return map;
  }, [drivers]);

  const counts = useMemo(() => {
    const c = { all: vehicles.length, active: 0, service: 0, idle: 0, attention: 0 };
    for (const v of vehicles) {
      c[v.status] += 1;
      if (needsAttention(v, crewOf.has(v.id))) c.attention += 1;
    }
    return c;
  }, [vehicles, crewOf]);

  const visible = useMemo(() => {
    const q = fold(query);
    return vehicles.filter((v) => {
      if (filter === "attention" && !needsAttention(v, crewOf.has(v.id))) return false;
      if (filter !== "all" && filter !== "attention" && v.status !== filter) return false;
      if (!q) return true;
      const hay = fold([v.plate, v.plate.replace(/\s/g, ""), v.model, String(v.year), ...(crewOf.get(v.id) ?? [])].join(" "));
      return hay.includes(q);
    });
  }, [vehicles, query, filter, crewOf]);

  const rental = vehicles.filter((v) => v.mode === "rental").length;
  const monthly = vehicles.reduce((sum, v) => sum + vehicleMonthlyNet(v, params), 0);

  function save() {
    if (!draft || !draft.plate.trim()) return;
    const plate = draft.plate.trim().toUpperCase();
    saveVehicle({ ...draft, plate, model: draft.model.trim() });
    toast.ok(isNew ? `Dodano auto ${plate}.` : `Zapisano zmiany w ${plate}.`);
    setDraft(null);
  }

  return (
    <>
      <PageHeader
        title="Flota"
        lead={
          vehicles.length > 0 ? (
            <>
              {vehicles.length} {plural(vehicles.length, "auto", "auta", "aut")}: {vehicles.length - rental} na
              procent, {rental} na wynajem. Koszty stałe aut to{" "}
              <span className="num font-medium text-ink">{zl(monthly)}</span> netto miesięcznie.
            </>
          ) : (
            "Auta, ich koszty i terminy w jednym miejscu."
          )
        }
      >
        <Button variant="primary" onClick={() => setDraft(blank())}>
          <Plus size={16} weight="bold" />
          Dodaj auto
        </Button>
      </PageHeader>

      <Panel flush>
        {vehicles.length === 0 ? (
          <Empty
            icon={<Car size={20} />}
            title="Nie masz jeszcze żadnego auta"
            action={
              <Button variant="primary" onClick={() => setDraft(blank())}>
                Dodaj pierwsze auto
              </Button>
            }
          >
            Dodaj auto z ratą leasingu, ubezpieczeniem i serwisem. Od tych kwot zależy próg
            rentowności, który zobaczysz na pulpicie.
          </Empty>
        ) : (
          <>
            {vehicles.length > 3 ? (
              <ListToolbar
                query={query}
                onQuery={setQuery}
                placeholder="Rejestracja, model, kierowca"
                value={filter}
                onChange={setFilter}
                chips={[
                  { value: "all", label: "Wszystkie", count: counts.all },
                  { value: "attention", label: "Wymaga uwagi", count: counts.attention, tone: "amber" },
                  { value: "active", label: "Jeżdżą", count: counts.active },
                  { value: "service", label: "W serwisie", count: counts.service },
                  { value: "idle", label: "Postój", count: counts.idle },
                ]}
              />
            ) : null}
            <div
              className={cn(
                "hidden gap-4 border-b border-line bg-bg/60 px-5 py-2.5 text-[0.75rem] font-medium text-ink-3 md:grid",
                COLS,
              )}
            >
              <span>Auto</span>
              <span>Rozliczenie</span>
              <span>Kierowcy</span>
              <span className="text-right">Koszt miesięczny</span>
              <span>Terminy i gotowość</span>
            </div>
            {visible.length === 0 ? (
              <NoMatches
                onReset={() => {
                  setQuery("");
                  setFilter("all");
                }}
              />
            ) : null}
            <ul>
              {visible.map((v, i) => {
                const crew = drivers.filter((d) => d.vehicleId === v.id && d.active);
                const done = PREP_STEPS.filter((s) => v.prep[s.key]).length;
                return (
                  <li
                    key={v.id}
                    className="stagger-item border-b border-line last:border-b-0"
                    style={{ "--i": i } as CSSProperties}
                  >
                    <button
                      type="button"
                      onClick={() => setDraft(v)}
                      className={cn(
                        "flex w-full flex-wrap items-baseline gap-x-2 gap-y-1.5 px-4 py-3.5 text-left transition-colors duration-150 hover:bg-bg md:grid md:items-center md:gap-x-4 md:px-5",
                        COLS,
                      )}
                    >
                      <span className="flex w-full min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 md:w-auto">
                        <Plate>{v.plate}</Plate>
                        <span className="min-w-0 truncate">
                          <span className="text-[0.9375rem] font-medium text-ink">{v.model || "Bez nazwy"}</span>
                          <span className="num ml-2 text-[0.8125rem] text-ink-3">{v.year}</span>
                        </span>
                        {v.status !== "active" ? (
                          <Badge tone={v.status === "service" ? "amber" : "neutral"}>
                            {STATUS_LABEL[v.status]}
                          </Badge>
                        ) : null}
                      </span>

                      <span className="text-[0.875rem] text-ink-2">
                        {MODE_LABEL[v.mode]}
                        <span className="md:hidden">,</span>
                      </span>

                      <span className="min-w-0 flex-1 truncate text-[0.875rem] text-ink-2">
                        {crew.length > 0 ? (
                          crew.map((d) => d.name).join(", ")
                        ) : (
                          <span className="text-amber">Brak kierowcy</span>
                        )}
                      </span>

                      <span className="num text-[0.9375rem] font-medium text-ink md:text-right">
                        {zl(vehicleMonthlyNet(v, params))}
                        <span className="ml-1 text-[0.75rem] font-normal text-ink-3 md:hidden">mies.</span>
                      </span>

                      <span className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] md:w-auto">
                        <Deadline label="Przegląd" iso={v.inspectionDue} />
                        <Deadline label="OC" iso={v.insuranceDue} />
                        {done < PREP_STEPS.length ? (
                          <Badge tone="amber">
                            Taxi {done}/{PREP_STEPS.length}
                          </Badge>
                        ) : null}
                      </span>
                    </button>
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
        title={isNew ? "Nowe auto" : "Edycja auta"}
        footer={
          <>
            <Button variant="primary" type="submit" disabled={!shown?.plate.trim()}>
              Zapisz
            </Button>
            <Button onClick={() => setDraft(null)}>Anuluj</Button>
            {!isNew && shown ? (
              <Button
                variant="danger"
                className="ml-auto"
                onClick={() => {
                  if (window.confirm(`Usunąć auto ${shown.plate}? Kierowcy zostaną bez przypisania.`)) {
                    removeVehicle(shown.id);
                    toast.ok(`Usunięto auto ${shown.plate}.`);
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
        {shown ? (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Numer rejestracyjny">
                <TextInput
                  value={shown.plate}
                  onChange={(e) => patch({ plate: e.target.value })}
                  className="font-mono uppercase"
                  autoCapitalize="characters"
                  required
                />
              </Field>
              <Field label="Rok produkcji">
                <NumberInput value={shown.year} onChange={(year) => patch({ year: Math.round(year) })} />
              </Field>
            </div>
            <Field label="Marka i model">
              <TextInput value={shown.model} onChange={(e) => patch({ model: e.target.value })} />
            </Field>

            <Field
              label="Sposób rozliczenia"
              hint={
                shown.mode === "commission"
                  ? "Kierowca dostaje procent od utargu, paliwo i serwis płaci spółka."
                  : "Kierowca płaci tygodniowy czynsz i opłatę od utargu, paliwo po jego stronie."
              }
            >
              <Segmented<Mode>
                label="Sposób rozliczenia"
                value={shown.mode}
                onChange={(mode) => patch({ mode })}
                options={[
                  { value: "commission", label: "Na procent" },
                  { value: "rental", label: "Wynajem" },
                ]}
              />
            </Field>

            <Field label="Status">
              <Select
                value={shown.status}
                onChange={(e) => patch({ status: e.target.value as VehicleStatus })}
              >
                <option value="active">Jeździ</option>
                <option value="service">W serwisie</option>
                <option value="idle">Nie jeździ</option>
              </Select>
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Leasing netto">
                <NumberInput value={shown.leaseNet} onChange={(leaseNet) => patch({ leaseNet })} suffix="zł" />
              </Field>
              <Field label="Ubezpieczenie">
                <NumberInput value={shown.insurance} onChange={(insurance) => patch({ insurance })} suffix="zł" />
              </Field>
              <Field label="Serwis brutto">
                <NumberInput
                  value={shown.serviceGross}
                  onChange={(serviceGross) => patch({ serviceGross })}
                  suffix="zł"
                />
              </Field>
            </div>
            <p className="-mt-3 text-[0.75rem] text-ink-3">
              Kwoty miesięczne. Razem <span className="num">{zl(vehicleMonthlyNet(shown, params))}</span>{" "}
              netto.
            </p>

            {!isNew ? <FuelSummary vehicleId={shown.id} /> : null}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Przegląd ważny do">
                <TextInput
                  type="date"
                  value={shown.inspectionDue}
                  onChange={(e) => patch({ inspectionDue: e.target.value })}
                />
              </Field>
              <Field label="OC ważne do">
                <TextInput
                  type="date"
                  value={shown.insuranceDue}
                  onChange={(e) => patch({ insuranceDue: e.target.value })}
                />
              </Field>
            </div>

            <fieldset>
              <legend className="mb-2 text-[0.8125rem] font-medium text-ink-2">Przygotowanie do taxi</legend>
              <ul className="overflow-hidden rounded-control border border-line">
                {PREP_STEPS.map((step) => {
                  const on = shown.prep[step.key];
                  return (
                    <li key={step.key} className="border-b border-line last:border-b-0">
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-bg">
                        <input
                          type="checkbox"
                          className="peer sr-only"
                          checked={on}
                          onChange={(e) => patch({ prep: { ...shown.prep, [step.key]: e.target.checked } })}
                        />
                        <span
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-green",
                            on ? "border-green bg-green text-white" : "border-line-strong bg-surface",
                          )}
                        >
                          {on ? <Check size={13} weight="bold" /> : null}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[0.875rem] font-medium text-ink">{step.label}</span>
                          <span className="block text-[0.75rem] text-ink-3">{step.hint}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}

/** Realne paliwo auta z ostatnich tygodni, na podstawie wpisów w rozliczeniach. */
function FuelSummary({ vehicleId }: { vehicleId: string }) {
  const entries = useFleet((s) => s.entries);
  const weeks = useMemo(() => {
    const byWeek = new Map<string, number>();
    for (const e of entries) {
      if (e.vehicleId !== vehicleId || e.fuelGross === null) continue;
      byWeek.set(e.week, (byWeek.get(e.week) ?? 0) + e.fuelGross);
    }
    return [...byWeek.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 4);
  }, [entries, vehicleId]);

  if (weeks.length === 0)
    return (
      <p className="rounded-control bg-sunken px-3 py-2.5 text-[0.8125rem] leading-snug text-ink-2">
        Paliwo tego auta liczymy na razie szacunkiem. Realny koszt z rachunków wpiszesz w rozliczeniu tygodnia.
      </p>
    );

  const avg = weeks.reduce((s, [, v]) => s + v, 0) / weeks.length;
  return (
    <div className="rounded-control bg-sunken px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
        <span className="font-medium text-ink">Paliwo z rachunków</span>
        <span className="num text-ink-2">
          średnio <span className="font-semibold text-ink">{zl(avg)}</span> brutto na tydzień
        </span>
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-ink-3">
        {weeks.map(([week, value]) => (
          <li key={week} className="num">
            tydz. {weekNumber(week)}: {zl(value)}
          </li>
        ))}
      </ul>
    </div>
  );
}

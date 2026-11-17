import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { IdentificationCard, Plus } from "@phosphor-icons/react";
import { num1, pct, plural, zl } from "../domain/format";
import { driverWeeks } from "../domain/schedule";
import { currentWeek } from "../domain/week";
import type { Driver, Shift } from "../domain/types";
import { newId, useFleet } from "../store/useFleet";
import { ListToolbar, NoMatches, fold } from "../ui/Filters";
import { Sheet, useRetained } from "../ui/Sheet";
import { toast } from "../ui/Toast";
import {
  Badge,
  Button,
  Empty,
  Field,
  PageHeader,
  Panel,
  Plate,
  Segmented,
  TextInput,
  Toggle,
  cn,
} from "../ui/kit";

const blank = (): Driver => ({
  id: newId(),
  name: "",
  phone: "",
  student: false,
  owner: false,
  email: "",
  shift: "day",
  active: true,
});

const COLS = "md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.3fr)]";

export function Drivers() {
  const drivers = useFleet((s) => s.drivers);
  const vehicles = useFleet((s) => s.vehicles);
  const entries = useFleet((s) => s.entries);
  const schedule = useFleet((s) => s.schedule);
  const params = useFleet((s) => s.params);
  const saveDriver = useFleet((s) => s.saveDriver);
  const removeDriver = useFleet((s) => s.removeDriver);

  const [draft, setDraft] = useState<Driver | null>(null);
  const shown = useRetained(draft);
  const isNew = shown ? !drivers.some((d) => d.id === shown.id) : false;
  const patch = (p: Partial<Driver>) => setDraft((d) => (d ? { ...d, ...p } : d));

  /* Średnie z ostatnich czterech rozliczonych tygodni każdego kierowcy. */
  const stats = useMemo(() => {
    const map = new Map<string, { revenue: number; hours: number; trips: number; weeks: number }>();
    const byDriver = new Map<string, typeof entries>();
    for (const e of entries) {
      const list = byDriver.get(e.driverId) ?? [];
      list.push(e);
      byDriver.set(e.driverId, list);
    }
    for (const [id, list] of byDriver) {
      const recent = [...list].sort((a, b) => (a.week < b.week ? 1 : -1)).slice(0, 4);
      map.set(id, {
        revenue: recent.reduce((s, e) => s + e.revenue, 0),
        hours: recent.reduce((s, e) => s + e.hours, 0),
        trips: recent.reduce((s, e) => s + e.trips, 0),
        weeks: recent.length,
      });
    }
    return map;
  }, [entries]);

  const sorted = useMemo(
    () => [...drivers].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pl")),
    [drivers],
  );

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "benched" | "students" | "inactive">("all");

  /* Auta i zmiany wynikają z grafiku bieżącego tygodnia. */
  const week = useMemo(() => driverWeeks(schedule, currentWeek()), [schedule]);
  const plates = useMemo(() => new Map(vehicles.map((v) => [v.id, v.plate])), [vehicles]);

  const visible = useMemo(() => {
    const q = fold(query);
    return sorted.filter((d) => {
      if (filter === "active" && !d.active) return false;
      if (filter === "benched" && !(d.active && !week.has(d.id))) return false;
      if (filter === "students" && !(d.active && d.student && !d.owner)) return false;
      if (filter === "inactive" && d.active) return false;
      if (!q) return true;
      const cars = (week.get(d.id)?.cars ?? []).map((c) => plates.get(c.vehicleId) ?? "");
      return fold([d.name, d.phone, d.email, ...cars, ...cars.map((p) => p.replace(/\s/g, ""))].join(" ")).includes(q);
    });
  }, [sorted, plates, week, query, filter]);

  const active = drivers.filter((d) => d.active).length;
  const benched = drivers.filter((d) => d.active && !week.has(d.id)).length;
  const students = drivers.filter((d) => d.active && d.student && !d.owner).length;
  const entryCount = shown ? entries.filter((e) => e.driverId === shown.id).length : 0;

  function save() {
    if (!draft || !draft.name.trim()) return;
    const email = draft.email.trim().toLowerCase();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      toast.error("Adres e-mail konta wygląda na niepoprawny.");
      return;
    }
    /* Jedno konto to jeden kierowca: inaczej nie wiadomo, czyje rozliczenia pokazać. */
    const taken = email ? drivers.find((d) => d.id !== draft.id && d.email.toLowerCase() === email) : undefined;
    if (taken) {
      toast.error(`Ten e-mail ma już ${taken.name}.`);
      return;
    }
    saveDriver({ ...draft, name: draft.name.trim(), phone: draft.phone.trim(), email });
    toast.ok(isNew ? `Dodano kierowcę ${draft.name.trim()}.` : `Zapisano zmiany: ${draft.name.trim()}.`);
    setDraft(null);
  }

  return (
    <>
      <PageHeader
        title="Kierowcy"
        lead={
          drivers.length > 0
            ? `${active} ${plural(active, "aktywny kierowca", "aktywnych kierowców", "aktywnych kierowców")}, w tym ${students} ze statusem studenta. Średnie liczone z czterech ostatnich tygodni.`
            : "Kierowcy, ich auta i zmiany."
        }
      >
        <Button variant="primary" onClick={() => setDraft(blank())}>
          <Plus size={16} weight="bold" />
          Dodaj kierowcę
        </Button>
      </PageHeader>

      <Panel flush>
        {drivers.length === 0 ? (
          <Empty
            icon={<IdentificationCard size={20} />}
            title="Nie masz jeszcze kierowców"
            action={
              <Button variant="primary" onClick={() => setDraft(blank())}>
                Dodaj pierwszego kierowcę
              </Button>
            }
          >
            Przy każdym kierowcy zaznaczasz status studenta i auto. Z tego wynika stawka procentowa,
            składki i sposób rozliczenia tygodnia.
          </Empty>
        ) : (
          <>
            {drivers.length > 3 ? (
              <ListToolbar
                query={query}
                onQuery={setQuery}
                placeholder="Imię, telefon, rejestracja"
                value={filter}
                onChange={setFilter}
                chips={[
                  { value: "all", label: "Wszyscy", count: drivers.length },
                  { value: "active", label: "Aktywni", count: active },
                  { value: "benched", label: "Bez zmian", count: benched, tone: "amber" },
                  { value: "students", label: "Studenci", count: students },
                  { value: "inactive", label: "Nieaktywni", count: drivers.length - active },
                ]}
              />
            ) : null}
            <div
              className={cn(
                "hidden gap-4 border-b border-line bg-bg/60 px-5 py-2.5 text-[0.75rem] font-medium text-ink-3 md:grid",
                COLS,
              )}
            >
              <span>Kierowca</span>
              <span>Ten tydzień w grafiku</span>
              <span className="text-right">Stawka na godzinę</span>
              <span className="text-right">Średnio na tydzień</span>
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
              {visible.map((d, i) => {
                const w = week.get(d.id);
                const s = stats.get(d.id);
                const perHour = s && s.hours > 0 ? s.revenue / s.hours : null;
                const tripsPerWeek = s && s.weeks > 0 ? s.trips / s.weeks : null;
                return (
                  <li
                    key={d.id}
                    className="stagger-item border-b border-line last:border-b-0"
                    style={{ "--i": i } as CSSProperties}
                  >
                    <button
                      type="button"
                      onClick={() => setDraft(d)}
                      className={cn(
                        "grid w-full grid-cols-1 gap-x-4 gap-y-1.5 px-4 py-3.5 text-left transition-colors duration-150 hover:bg-bg md:items-center md:px-5",
                        COLS,
                        !d.active && "opacity-60",
                      )}
                    >
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate text-[0.9375rem] font-medium text-ink">{d.name}</span>
                        {d.owner ? <Badge tone="green">Właściciel</Badge> : null}
                        {d.student && !d.owner ? <Badge tone="green">Student</Badge> : null}
                        {!d.active ? <Badge>Nieaktywny</Badge> : null}
                      </span>

                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[0.875rem] text-ink-2">
                        {w ? (
                          <>
                            <span className="num">
                              {w.total} {plural(w.total, "zmiana", "zmiany", "zmian")}
                              <span className="text-ink-3">
                                {" "}
                                ({w.day} D, {w.night} N)
                              </span>
                            </span>
                            {w.cars.slice(0, 2).map((c) => (
                              <Plate key={c.vehicleId}>{plates.get(c.vehicleId) ?? "?"}</Plate>
                            ))}
                            {w.cars.length > 2 ? <span className="text-ink-3">+{w.cars.length - 2}</span> : null}
                          </>
                        ) : (
                          <span className={d.active ? "text-amber" : "text-ink-3"}>Bez zmian w grafiku</span>
                        )}
                        {d.email ? (
                          <span className="text-[0.75rem] text-ink-3" title={`Konto: ${d.email}`}>
                            · ma konto
                          </span>
                        ) : null}
                      </span>

                      <span className="num text-[0.9375rem] font-medium text-ink md:text-right">
                        {perHour !== null ? (
                          <>
                            {num1(perHour)} zł
                            <span className="ml-1 text-[0.75rem] font-normal text-ink-3 md:hidden">na godzinę</span>
                          </>
                        ) : (
                          <span className="font-normal text-ink-3">brak rozliczeń</span>
                        )}
                      </span>

                      <span className="num text-[0.875rem] text-ink-2 md:text-right">
                        {s && s.weeks > 0 ? (
                          <>
                            {zl(s.revenue / s.weeks)}, {num1(s.hours / s.weeks)} h,{" "}
                            <span
                              className={
                                tripsPerWeek !== null && tripsPerWeek >= params.tripThreshold
                                  ? "font-medium text-green-ink"
                                  : undefined
                              }
                            >
                              {Math.round(tripsPerWeek ?? 0)} kursów
                            </span>
                          </>
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
        title={isNew ? "Nowy kierowca" : "Edycja kierowcy"}
        footer={
          <>
            <Button variant="primary" type="submit" disabled={!shown?.name.trim()}>
              Zapisz
            </Button>
            <Button onClick={() => setDraft(null)}>Anuluj</Button>
            {!isNew && shown && entryCount === 0 ? (
              <Button
                variant="danger"
                className="ml-auto"
                onClick={() => {
                  if (window.confirm(`Usunąć kierowcę ${shown.name}?`)) {
                    removeDriver(shown.id);
                    toast.ok(`Usunięto kierowcę ${shown.name}.`);
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
            <Field label="Imię i nazwisko">
              <TextInput
                value={shown.name}
                onChange={(e) => patch({ name: e.target.value })}
                autoComplete="off"
                required
              />
            </Field>
            <Field label="Telefon" hint="Opcjonalnie.">
              <TextInput
                type="tel"
                inputMode="tel"
                value={shown.phone}
                onChange={(e) => patch({ phone: e.target.value })}
                autoComplete="off"
              />
            </Field>
            <Field
              label="E-mail konta w aplikacji"
              hint="Kierowca zakłada konto na ten adres i po zalogowaniu widzi grafik, flotę i tylko swoje rozliczenia. Niczego nie może zmienić."
            >
              <TextInput
                type="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                value={shown.email}
                onChange={(e) => patch({ email: e.target.value })}
                placeholder="opcjonalnie"
                autoComplete="off"
              />
            </Field>

            <Toggle
              checked={shown.owner}
              onChange={(owner) => patch({ owner })}
              label="Właściciel spółki"
              hint={
                shown.owner
                  ? "Bez wypłaty, dopłaty do minimum i ZUS. Cały utarg trafia na konto spółki, spółka płaci za paliwo."
                  : "Zaznacz, jeśli za kierownicą siedzi właściciel. Wtedy nie liczymy mu wypłaty."
              }
            />

            {!shown.owner ? (
              <Toggle
                checked={shown.student}
                onChange={(student) => patch({ student })}
                label="Student do 26 lat"
                hint={
                  shown.student
                    ? `Stawka ${pct(params.studentBase)}, po progu kursów ${pct(params.studentHigh)}. Bez składek ZUS po stronie spółki.`
                    : `Stawka ${pct(params.regularBase)}, po progu kursów ${pct(params.regularHigh)}. Spółka dolicza ZUS pracodawcy.`
                }
              />
            ) : null}

            <Field label="Preferowana zmiana" hint="Podpowiedź do układania grafiku. Auta i dni ustawiasz w zakładce Grafik.">
              <Segmented<Shift>
                label="Preferowana zmiana"
                value={shown.shift}
                onChange={(shift) => patch({ shift })}
                options={[
                  { value: "day", label: "Dzienna" },
                  { value: "night", label: "Nocna" },
                  { value: "flex", label: "Elastyczna" },
                ]}
              />
            </Field>

            <Toggle
              checked={shown.active}
              onChange={(a) => patch({ active: a })}
              label="Aktywny"
              hint="Nieaktywny kierowca zostaje w historii, ale nie trafia do nowych rozliczeń."
            />

            {!isNew && entryCount > 0 ? (
              <p className="rounded-control bg-sunken px-3 py-2.5 text-[0.8125rem] text-ink-2">
                Ten kierowca ma {entryCount} {plural(entryCount, "rozliczenie", "rozliczenia", "rozliczeń")} w
                historii, dlatego nie da się go usunąć. Zamiast tego wyłącz aktywność.
              </p>
            ) : null}
          </div>
        ) : null}
      </Sheet>
    </>
  );
}

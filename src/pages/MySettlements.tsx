import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Check, Receipt } from "@phosphor-icons/react";
import { settle } from "../domain/engine";
import { num1, pct, plural, zl, zlExact } from "../domain/format";
import { driverWeeks } from "../domain/schedule";
import type { Entry } from "../domain/types";
import { weekNumber, weekRange } from "../domain/week";
import { useSession } from "../data/session";
import { useFleet } from "../store/useFleet";
import { Sheet, useRetained } from "../ui/Sheet";
import { Badge, Empty, PageHeader, Panel, Plate, Row, cn } from "../ui/kit";
import { Tween } from "../ui/motion";

/* Rozliczenia z perspektywy kierowcy: tylko jego tygodnie, tylko jego
   kwoty. Bez wyniku spółki i bez możliwości zmiany czegokolwiek. */

export function MySettlements() {
  const entries = useFleet((s) => s.entries);
  const vehicles = useFleet((s) => s.vehicles);
  const schedule = useFleet((s) => s.schedule);
  const params = useFleet((s) => s.params);
  const meId = useSession((s) => s.meId);
  const [open, setOpen] = useState<Entry | null>(null);
  const shown = useRetained(open);

  const mine = useMemo(
    () =>
      entries
        .filter((e) => e.driverId === meId)
        .sort((a, b) => (a.week < b.week ? 1 : -1))
        .map((e) => ({ e, s: settle(e, params) })),
    [entries, meId, params],
  );

  const plates = useMemo(() => new Map(vehicles.map((v) => [v.id, v.plate])), [vehicles]);
  const recent = mine.slice(0, 4);
  const earned = recent.reduce((sum, x) => sum + (x.e.mode === "commission" && !x.s.ownerDrive ? x.s.payout : 0), 0);
  const hours = recent.reduce((sum, x) => sum + x.e.hours, 0);
  const revenue = recent.reduce((sum, x) => sum + x.e.revenue, 0);
  const waiting = mine.filter((x) => !x.e.paid && !x.s.ownerDrive).length;

  if (mine.length === 0) {
    return (
      <>
        <PageHeader title="Moje rozliczenia" />
        <Panel flush>
          <Empty icon={<Receipt size={20} />} title="Nie masz jeszcze rozliczeń">
            Gdy szef floty wpisze Twój utarg, godziny i kursy za tydzień, zobaczysz tu wyliczenie wypłaty albo kwoty
            do zapłaty za wynajem.
          </Empty>
        </Panel>
      </>
    );
  }

  const preview = shown ? settle(shown, params) : null;
  const shownShifts = shown ? driverWeeks(schedule, shown.week).get(shown.driverId) : undefined;

  return (
    <>
      <PageHeader
        title="Moje rozliczenia"
        lead={
          waiting > 0
            ? `${waiting} ${plural(waiting, "tydzień czeka", "tygodnie czekają", "tygodni czeka")} na rozliczenie.`
            : "Wszystkie tygodnie rozliczone."
        }
      />

      <dl className="mb-4 grid grid-cols-3 overflow-hidden rounded-panel border border-line bg-surface">
        {[
          { label: `Wypłaty, ${recent.length} ${plural(recent.length, "tydzień", "tygodnie", "tygodni")}`, v: earned, f: zl },
          { label: "Utarg z aplikacji", v: revenue, f: zl },
          { label: "Średnio na godzinę", v: hours > 0 ? revenue / hours : 0, f: (x: number) => `${num1(x)} zł` },
        ].map((item, i) => (
          <div key={item.label} className={cn("px-3 py-3 md:px-5 md:py-4", i > 0 && "border-l border-line")}>
            <dt className="text-[0.6875rem] leading-tight text-ink-3 md:text-[0.75rem]">{item.label}</dt>
            <dd className="num mt-1 text-[1rem] font-semibold tracking-[-0.01em] text-ink md:text-[1.25rem]">
              <Tween value={item.v} format={item.f} />
            </dd>
          </div>
        ))}
      </dl>

      <Panel title="Tygodnie" flush>
        <ul>
          {mine.map(({ e, s }, i) => {
            const rental = e.mode === "rental" && !s.ownerDrive;
            return (
              <li key={e.id} style={{ "--i": i } as CSSProperties} className="stagger-item border-b border-line last:border-b-0">
                <button
                  type="button"
                  onClick={() => setOpen(e)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-bg md:px-5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[0.9375rem] font-medium text-ink">Tydzień {weekNumber(e.week)}</span>
                      <span className="num text-[0.75rem] text-ink-3">{weekRange(e.week)}</span>
                      {e.vehicleId && plates.get(e.vehicleId) ? <Plate>{plates.get(e.vehicleId)}</Plate> : null}
                    </span>
                    <span className="num mt-0.5 block text-[0.8125rem] text-ink-2">
                      {zl(e.revenue)} · {num1(e.hours)} h · {e.trips} kursów · {num1(s.ratePerHour)} zł/h
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block text-[0.9375rem] font-semibold text-ink">
                      {s.ownerDrive ? "—" : zl(rental ? s.dueFromDriver : s.payout)}
                    </span>
                    <span className="block text-[0.6875rem] text-ink-3">
                      {s.ownerDrive ? "właściciel" : rental ? "do zapłaty" : "wypłata brutto"}
                    </span>
                  </span>
                  <span className="hidden w-28 shrink-0 text-right sm:block">
                    {s.ownerDrive ? null : e.paid ? (
                      <Badge tone="green">
                        <Check size={12} weight="bold" className="mr-1" />
                        Rozliczone
                      </Badge>
                    ) : (
                      <Badge tone="amber">Czeka</Badge>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Sheet
        open={open !== null}
        onClose={() => setOpen(null)}
        title={shown ? `Tydzień ${weekNumber(shown.week)}, ${weekRange(shown.week)}` : "Rozliczenie"}
      >
        {shown && preview ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {shown.vehicleId && plates.get(shown.vehicleId) ? <Plate>{plates.get(shown.vehicleId)}</Plate> : null}
              <Badge>{shown.mode === "rental" ? "Wynajem" : "Na procent"}</Badge>
              {preview.ownerDrive ? null : shown.paid ? <Badge tone="green">Rozliczone</Badge> : <Badge tone="amber">Czeka na rozliczenie</Badge>}
            </div>

            <div className="rounded-control bg-sunken px-4 py-3">
              <Row label="Utarg netto z aplikacji" value={zlExact(shown.revenue)} />
              <Row label="Godziny online" value={`${num1(shown.hours)} h`} />
              <Row label="Kursy" hint={`próg ${params.tripThreshold}`} value={String(shown.trips)} />
              {shownShifts ? (
                <Row
                  label="Zmiany w grafiku"
                  value={`${shownShifts.total} (${shownShifts.day} D, ${shownShifts.night} N)`}
                />
              ) : null}
            </div>

            <div className="rounded-control border border-line px-4 py-3">
              {preview.ownerDrive ? (
                <p className="text-[0.875rem] text-ink-2">Jako właściciel nie dostajesz wypłaty z tego tygodnia.</p>
              ) : shown.mode === "commission" ? (
                <>
                  <Row
                    label="Udział w utargu"
                    hint={`${pct(preview.rate)}${preview.reached ? ", próg kursów" : ""}`}
                    value={zlExact(preview.share)}
                  />
                  {preview.topUp > 0 ? (
                    <Row label="Dopłata do minimalnej stawki" value={zlExact(preview.topUp)} />
                  ) : null}
                  {shown.bonus > 0 ? <Row label="Premia" value={zlExact(shown.bonus)} /> : null}
                  {shown.deduction > 0 ? <Row label="Potrącenie" value={zlExact(-shown.deduction)} /> : null}
                  <div className="my-1.5 border-t border-line-strong" />
                  <Row label="Do wypłaty brutto" value={zlExact(preview.payout)} strong tone="green" />
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
                  <Row label="Do zapłaty" value={zlExact(preview.dueFromDriver)} strong tone="green" />
                </>
              )}
            </div>
            <p className="text-[0.75rem] leading-snug text-ink-3">
              Pytania o rozliczenie kieruj do szefa floty. W aplikacji nie możesz niczego zmienić.
            </p>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}

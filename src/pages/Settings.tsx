import { useRef, useState } from "react";
import { DownloadSimple, UploadSimple } from "@phosphor-icons/react";
import { plural } from "../domain/format";
import type { Params } from "../domain/types";
import { exportSnapshot, useFleet } from "../store/useFleet";
import { Button, Field, NumberInput, PageHeader, Panel, Toggle } from "../ui/kit";

export function Settings() {
  const params = useFleet((s) => s.params);
  const setParams = useFleet((s) => s.setParams);
  const resetParams = useFleet((s) => s.resetParams);
  const demo = useFleet((s) => s.demo);
  const counts = useFleet((s) => [s.vehicles.length, s.drivers.length, s.entries.length].join("/"));
  const loadDemo = useFleet((s) => s.loadDemo);
  const clearAll = useFleet((s) => s.clearAll);
  const importData = useFleet((s) => s.importData);

  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [vehicles, drivers, entries] = counts.split("/").map(Number);

  const num = (key: keyof Params, label: string, suffix?: string, hint?: string, percent?: boolean) => (
    <Field label={label} hint={hint}>
      <NumberInput
        value={params[key] as number}
        onChange={(v) => setParams({ [key]: v } as Partial<Params>)}
        suffix={suffix}
        percent={percent}
      />
    </Field>
  );

  function download() {
    const blob = new Blob([JSON.stringify(exportSnapshot(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `postoj-kopia-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ ok: true, text: "Kopia zapisana do pliku." });
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    try {
      const ok = importData(JSON.parse(await file.text()));
      setMessage(
        ok
          ? { ok: true, text: "Dane wczytane z pliku." }
          : { ok: false, text: "Ten plik nie wygląda na kopię z tej aplikacji." },
      );
    } catch {
      setMessage({ ok: false, text: "Nie udało się odczytać pliku." });
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <>
      <PageHeader
        title="Ustawienia"
        lead="Stawki i koszty, według których liczone są rozliczenia, pulpit i kalkulator. Zmiana działa od razu, także wstecz."
      >
        <Button
          size="sm"
          onClick={() => {
            if (window.confirm("Przywrócić stawki i koszty z biznesplanu?")) resetParams();
          }}
        >
          Przywróć wartości z biznesplanu
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <Panel title="Kierowcy na procent">
          <div className="grid grid-cols-2 gap-3">
            {num("studentBase", "Student", "%", undefined, true)}
            {num("studentHigh", "Student po progu", "%", undefined, true)}
            {num("regularBase", "Pozostali", "%", undefined, true)}
            {num("regularHigh", "Pozostali po progu", "%", undefined, true)}
            {num("tripThreshold", "Próg kursów w tygodniu", undefined, "Od tylu kursów działa wyższa stawka i niższy czynsz.")}
            {num("employerZus", "ZUS pracodawcy", "%", "Od wypłaty kierowców bez statusu studenta.", true)}
          </div>
        </Panel>

        <Panel title="Wynajem auta">
          <div className="grid grid-cols-2 gap-3">
            {num("rentBase", "Czynsz tygodniowy brutto", "zł")}
            {num("rentReduced", "Czynsz po progu kursów", "zł")}
            {num("rentalFee", "Opłata od utargu", "%", "Od utargu netto najemcy.", true)}
            {num("vatStd", "VAT na czynsz i koszty", "%", undefined, true)}
          </div>
        </Panel>

        <Panel title="Minimalna stawka godzinowa">
          <div className="flex flex-col gap-4">
            <Toggle
              checked={params.minWageTopUp}
              onChange={(minWageTopUp) => setParams({ minWageTopUp })}
              label="Dopłacaj do minimum"
              hint="Gdy procent od utargu daje mniej niż minimalna stawka za godzinę online, spółka dopłaca różnicę."
            />
            <div className="grid grid-cols-2 gap-3">{num("minWage", "Stawka brutto za godzinę", "zł")}</div>
            <p className="rounded-control bg-amber-soft px-3 py-2.5 text-[0.8125rem] leading-snug text-amber">
              Wyłączenie dopłaty zakłada, że wynagrodzenie czysto prowizyjne zwalnia z minimalnej stawki.
              Przy grafiku ustalanym przez spółkę to założenie jest wątpliwe. Potwierdź je z prawnikiem,
              zanim na nim oprzesz plan.
            </p>
          </div>
        </Panel>

        <Panel title="Paliwo aut na procent">
          <div className="grid grid-cols-2 gap-3">
            {num("lpgPerShiftGross", "LPG brutto na zmianę", "zł")}
            {num("lpgShiftHours", "Długość zmiany", "h", "Koszt paliwa liczony jest proporcjonalnie do godzin.")}
          </div>
        </Panel>

        <Panel title="Spółka i podatki">
          <div className="grid grid-cols-2 gap-3">
            {num("boardGross", "Zarząd, koszt miesięczny", "zł", "Pełny koszt wynagrodzenia z powołania.")}
            {num("admin", "Księgowość i administracja", "zł", "Miesięcznie.")}
            {num("cit", "CIT", "%", undefined, true)}
            {num("weeksPerMonth", "Tygodni w miesiącu")}
            {num("targetHoursPerCar", "Cel godzin na auto", "h", "Tygodniowo, do liczenia wykorzystania.")}
          </div>
        </Panel>

        <Panel title="Dane">
          <p className="text-[0.875rem] text-ink-2">
            Wszystko zapisuje się w tej przeglądarce i nie jest nigdzie wysyłane. W aplikacji jest teraz{" "}
            {vehicles} {plural(vehicles, "auto", "auta", "aut")}, {drivers}{" "}
            {plural(drivers, "kierowca", "kierowców", "kierowców")} i {entries}{" "}
            {plural(entries, "rozliczenie", "rozliczenia", "rozliczeń")}.
            {demo ? " To dane przykładowe, wymyślone na potrzeby pokazu." : ""}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={download}>
              <DownloadSimple size={16} />
              Zapisz kopię
            </Button>
            <Button onClick={() => fileRef.current?.click()}>
              <UploadSimple size={16} />
              Wczytaj kopię
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              tabIndex={-1}
              aria-label="Plik z kopią danych"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </div>

          {message ? (
            <p
              role="status"
              className={`mt-3 text-[0.8125rem] font-medium ${message.ok ? "text-green-ink" : "text-red"}`}
            >
              {message.text}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
            <Button
              variant="danger"
              className="border border-line-strong"
              onClick={() => {
                if (
                  window.confirm(
                    demo
                      ? "Usunąć dane przykładowe i zacząć od pustej floty?"
                      : "Usunąć wszystkie auta, kierowców i rozliczenia? Tego nie da się cofnąć. Najpierw zapisz kopię.",
                  )
                ) {
                  clearAll();
                  setMessage({ ok: true, text: "Dane usunięte. Zaczynasz od pustej floty." });
                }
              }}
            >
              {demo ? "Usuń dane przykładowe" : "Usuń wszystkie dane"}
            </Button>
            {!demo ? (
              <Button
                variant="quiet"
                onClick={() => {
                  if (
                    vehicles + drivers + entries === 0 ||
                    window.confirm("Zastąpić obecne dane przykładowymi? Obecne dane znikną.")
                  ) {
                    loadDemo();
                    setMessage({ ok: true, text: "Wczytano dane przykładowe." });
                  }
                }}
              >
                Wczytaj dane przykładowe
              </Button>
            ) : null}
          </div>
        </Panel>
      </div>
    </>
  );
}

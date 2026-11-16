# Postój

Aplikacja do prowadzenia floty taxi pracującej w aplikacjach: auta, kierowcy,
tygodniowe rozliczenia i model finansowy spółki.

## Uruchomienie

```bash
npm install
npm run dev
```

Pozostałe polecenia: `npm run build`, `npm run typecheck`, `npm test`.

## Co jest w środku

- `src/domain/engine.ts`: silnik wyliczeń, czyste funkcje. Rozliczenie kierowcy za tydzień,
  wynik spółki, model miesięczny floty i próg rentowności.
- `src/domain/engine.test.ts`: testy. Liczby kontrolne pochodzą z biznesplanu
  (20 aut, 55 zł na godzinę, zysk netto 39 662,96 zł miesięcznie).
- `src/domain/seed.ts`: dane przykładowe, wymyślone i oznaczone w aplikacji.
- `src/store/useFleet.ts`: stan aplikacji zapisywany w przeglądarce (localStorage).
- `src/pages`: Pulpit, Flota, Kierowcy, Rozliczenia, Kalkulator, Ustawienia.
- `PRODUCT.md`, `DESIGN.md`: dla kogo jest aplikacja i zasady wyglądu.

## Dane

Wszystko zostaje w przeglądarce, nie ma serwera ani kont. Kopię robi się w
Ustawieniach (zapis do pliku JSON), tam też można ją wczytać na innym urządzeniu.

## Założenia modelu

Kwoty netto, pełne odliczenie VAT od leasingu, serwisu i LPG, czynsz najmu przeliczany
z brutto na netto, CIT 9%, miesiąc liczony jako 4,33 tygodnia. To model zarządczy,
a nie rozliczenie podatkowe. Założenia trzeba potwierdzić z księgowym.

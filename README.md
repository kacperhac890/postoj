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

## Dane, baza i logowanie

Aplikacja działa w dwóch trybach:

- **Bez bazy** (gdy nie ma zmiennych `VITE_SUPABASE_*`): wszystko zostaje w przeglądarce, nie ma kont.
  Kopię robi się w Ustawieniach (plik JSON).
- **Z bazą Supabase**: logowanie e-mailem i hasłem, dane zapisane w Postgresie i dostępne na każdym
  urządzeniu. Każdy widzi tylko swoje dane (zasady RLS). Można też wejść bez konta, na danych przykładowych.
  Przy pierwszym logowaniu dane z przeglądarki przenosi się jednym przyciskiem na pulpicie.

Zmiany pokazują się od razu i idą do bazy w tle, jedną kolejką. Gdy zapis się nie uda, pojawia się
komunikat, a stan jest pobierany z bazy od nowa.

### Podłączenie bazy

1. W [Supabase](https://supabase.com) utwórz projekt (albo użyj istniejącego: tabele mają przedrostek `postoj_`).
2. SQL Editor → wklej `supabase/schema.sql` → Run.
3. Authentication → URL Configuration: **Site URL** `https://kacperhac890.github.io/postoj/`, w **Redirect URLs**
   dodaj ten sam adres oraz `http://localhost:5210/`.
4. Lokalnie: skopiuj `.env.example` jako `.env.local` i wpisz Project URL oraz klucz `anon` (Project Settings → API).
5. Na GitHub Pages: repozytorium → Settings → Secrets and variables → Actions → **Variables**:
   `SUPABASE_URL` i `SUPABASE_ANON_KEY`. Następny push zbuduje wersję z logowaniem.

Klucz `anon` jest jawny z założenia (trafia do przeglądarki). Klucza `service_role` nie wpisuj nigdzie w tej aplikacji.

Pliki: `src/data/cloud.ts` (połączenie, odczyt, kolejka zapisów), `src/data/session.ts` (sesja, tryby,
logowanie), `src/data/rows.ts` (zamiana obiektów na wiersze tabel, z testami).

## Założenia modelu

Kwoty netto, pełne odliczenie VAT od leasingu, serwisu i LPG, czynsz najmu przeliczany
z brutto na netto, CIT 9%, miesiąc liczony jako 4,33 tygodnia. To model zarządczy,
a nie rozliczenie podatkowe. Założenia trzeba potwierdzić z księgowym.

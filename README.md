# FlotBase

Aplikacja do prowadzenia floty taxi pracującej w aplikacjach: auta, kierowcy,
tygodniowe rozliczenia i model finansowy spółki.

Nazwa techniczna (repozytorium, tabele i funkcje w bazie `postoj_*`, klucze w przeglądarce `postoj-*`)
zostaje `postoj`, żeby nie ruszać danych. FlotBase to nazwa widoczna dla użytkownika.

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

## Grafik i konta kierowców

- **Grafik** (`/grafik`): na każdy dzień tygodnia, każde auto i każdą zmianę (dniówka, nocka) wybiera się
  kierowcę. Kierowca nie ma stałego auta. Aplikacja ostrzega, gdy ktoś jest na dwóch autach naraz albo ma
  dniówkę zaraz po nocce, i kopiuje poprzedni tydzień jednym przyciskiem.
- **Rozliczenia** pokazują kierowców, którzy mieli zmiany w grafiku. Auto w rozliczeniu podpowiada się
  z grafiku (najczęstsze w tygodniu) i można je zmienić; od auta zależy, czy liczymy procent, czy wynajem.
- **Role.** O roli decyduje baza, aplikacja nie zna żadnego adresu na stałe:
  - **operator aplikacji** (Ty): zarządza własną flotą i zaprasza właścicieli innych flot
    (Ustawienia → Właściciele flot);
  - **właściciel floty**: adres jest w tabeli `postoj_owners`. Zarządza tylko swoją flotą i sam zaprasza
    swoich kierowców. Floty są rozdzielone w bazie: właściciel nie widzi cudzych danych, operator też nie;
  - **kierowca**: jego e-mail jest w karcie kierowcy. Widzi grafik, flotę bez kosztów i tylko swoje
    rozliczenia, zgłasza usterki. Niczego poza tym nie zmieni. Pilnuje tego baza (RLS), nie tylko ekran.
- Konto z adresem, którego nie ma ani na liście właścicieli, ani w żadnej karcie kierowcy, widzi tylko
  prośbę o przypisanie. Jeden adres e-mail może należeć tylko do jednego kierowcy w całej aplikacji.
- **Zaproszenia.** Konta kierowców zakłada właściciel floty: w karcie kierowcy wpisuje e-mail i wybiera
  „Wyślij e-mailem” albo „Skopiuj link zaproszenia” (do wysłania SMS-em). Właścicieli flot tak samo
  zaprasza operator w Ustawieniach. Zaproszony klika link, ustawia hasło i jest zalogowany. Wysyłkę robi
  Edge Function `supabase/functions/invite-driver` (klucz administratora Supabase zostaje na serwerze).
  Na ekranie logowania nie ma samodzielnej rejestracji.

## Usterki

Kierowca zgłasza usterkę auta (`/usterki`, także z pulpitu): wybiera auto, pisze, co się dzieje, i może
zaznaczyć, że auto nie nadaje się do jazdy. Przy zgłoszeniu jest rozmowa z szefem floty. Szef odpisuje,
ustawia stan (zgłoszone, w naprawie, naprawione) i widzi otwarte usterki na pulpicie i przy autach we Flocie.
Nowe wiadomości przychodzą na żywo (Supabase Realtime), a licznik przy ikonie usterek pokazuje nieprzeczytane.
Kierowca widzi tylko swoje zgłoszenia. Podpis i autora wiadomości ustawia baza, więc nie da się podszyć
pod szefa. Odpowiedź kierowcy w naprawionym zgłoszeniu otwiera je ponownie. Bez konta (gość) usterki są
zapisane w przeglądarce, z przykładowymi rozmowami przy danych przykładowych.

### Wdrożenie (po każdej zmianie tych plików)

1. Supabase → SQL Editor: uruchom cały `supabase/schema.sql`. Konto, które ma już dane floty, zostaje
   automatycznie operatorem. Na zupełnie pustej bazie dopisz siebie jedną komendą:
   `insert into public.postoj_owners (email, operator) values ('twoj@adres.pl', true);`
2. Supabase → Edge Functions → `invite-driver` → Code: wklej `supabase/functions/invite-driver/index.ts`,
   Deploy. Pierwszy raz: Deploy a new function → Via Editor, nazwa `invite-driver`. W ustawieniach funkcji
   wyłącz weryfikację JWT („Verify JWT”): funkcja sama sprawdza uprawnienia w bazie.
3. Authentication → Sign In / Providers: wyłącz „Allow new users to sign up”. Zaproszenia działają dalej.
4. Wbudowana poczta Supabase wysyła tylko do członków zespołu projektu i kilka e-maili na godzinę.
   Żeby zaproszenia e-mailem docierały, ustaw własny SMTP (Authentication → Emails → SMTP), albo używaj
   „Skopiuj link”.

## Bezpieczeństwo

- Dostęp do danych pilnuje baza: zasady RLS na każdej tabeli, osobne widoki dla kierowców bez kosztów
  i danych kolegów, funkcje zamknięte dla niezalogowanych. Klucz publiczny w przeglądarce jest jawny
  z założenia i bez zalogowania nie daje dostępu do niczego.
- Rolę ustala baza (`postoj_my_role`), w kodzie strony nie ma żadnego adresu administratora.
- Strona ma zasady bezpieczeństwa treści (CSP): skrypty tylko z tej strony, połączenia tylko do własnego
  projektu Supabase. Nie daje się osadzić w cudzej ramce, nie przekazuje adresu dalej (referrer)
  i nie jest indeksowana przez wyszukiwarki.
- Limity w bazie: najwyżej 15 wiadomości na minutę i 10 zgłoszeń na godzinę na konto.
- Do zrobienia w panelu Supabase: wyłączona rejestracja (wyżej), Authentication → URL Configuration
  z adresem strony jako jedynym Redirect URL, minimalna długość hasła 8 znaków (Authentication →
  Providers → Email) i potwierdzanie zmiany adresu e-mail („Secure email change”).
- Testy uprawnień: `supabase/schema.sql` sprawdzany na prawdziwym Postgresie (PGlite) z kontami
  operatora, drugiego właściciela, kierowców, obcego i niezalogowanego.

## Paliwo i właściciel za kierownicą

- W rozliczeniu tygodnia auta na procent można wpisać realny koszt paliwa brutto z rachunków. Puste pole
  oznacza szacunek z ustawień (koszt LPG na zmianę, proporcjonalnie do godzin online). W karcie auta widać
  średnią z ostatnich tygodni z rachunkami.
- Kierowca oznaczony jako właściciel spółki nie dostaje wypłaty, dopłaty do minimum ani ZUS i nie płaci
  czynszu. Cały utarg trafia do spółki, spółka płaci za paliwo. Znacznik zapisuje się też w rozliczeniu
  tygodnia, więc późniejsza zmiana nie przepisuje historii.

Po aktualizacji aplikacji z bazą trzeba ponownie uruchomić `supabase/schema.sql` (dopisuje nowe kolumny).

## Założenia modelu

Kwoty netto, pełne odliczenie VAT od leasingu, serwisu i LPG, czynsz najmu przeliczany
z brutto na netto, CIT 9%, miesiąc liczony jako 4,33 tygodnia. To model zarządczy,
a nie rozliczenie podatkowe. Założenia trzeba potwierdzić z księgowym.

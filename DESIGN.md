# FlotBase: zasady wyglądu

Scena: dzienne światło, telefon w ręce albo monitor w biurze. Jasny motyw, bez trybu ciemnego.

## Kolor (strategia: powściągliwa)
- Tło: bardzo jasny neutralny odcień podbarwiony w stronę zieleni marki (nie krem, nie beż).
- Powierzchnie: czysta biel. Linie włosowe zamiast cieni.
- Jeden akcent: głęboka zieleń. Używana do akcji głównych, zaznaczenia i stanów dodatnich.
- Ciemnozielony panel nawigacji na komputerze to jedyne miejsce, gdzie zieleń niesie powierzchnię.
- Czerwień tylko dla strat i błędów, bursztyn tylko dla terminów.

## Typografia
- Geist, jedna rodzina. Skala stała w rem, bez clamp.
- Liczby tabelaryczne. Geist Mono tylko dla tablic rejestracyjnych i kluczy tygodni.
- Brak nadtytułów wersalikami nad sekcjami.

## Kształt
- Promień 10 px dla paneli, 8 px dla kontrolek, pełny dla znaczników.
- Bez kart w kartach. Panel to biała powierzchnia z linią 1 px.

## Ruch
- 140 do 260 ms dla interakcji, do 640 ms dla wejścia wykresów. Krzywa cubic-bezier(0.23, 1, 0.32, 1). Tylko transform i opacity.
- Ruch pokazuje stan albo zmianę, nie zdobi:
  - nowy ekran wchodzi krótkim uniesieniem (`.page`), wiersze list jeden po drugim (`.stagger-item`, najwyżej 12 opóźnień);
  - paski proporcji rosną od lewej i przy zmianie tygodnia dochodzą do nowej długości (`.bar-grow`, transform scaleX);
  - słupki trendu rosną od linii zera (`.bar-rise`);
  - kwoty na pulpicie i w rozliczeniach dochodzą do nowej wartości (`Tween`), startując od poprzedniej, nie od zera;
  - wskaźnik aktywnej pozycji w nawigacji przesuwa się między pozycjami;
  - komunikaty (toast) wchodzą od dołu i znikają same, błędy wiszą dłużej.
- Treść jest widoczna także bez animacji. Przy prefers-reduced-motion czasy i opóźnienia spadają do zera.

## Układ
- Komputer (od 1024 px): panel boczny 240 px z kontem i stanem zapisu, treść do 1180 px.
- Tablet (768 do 1023 px): wąska szyna 84 px z ikonami i podpisami, bez dolnej nawigacji.
- Telefon: górny pasek, dolna nawigacja z pięcioma pozycjami (kalkulator w górnym pasku), tabele zamieniają się w wiersze.
- Kierowca ma cztery pozycje: Pulpit, Grafik, Flota, Moje rozliczenia. Bez przycisków edycji.
- Grafik: na komputerze siatka tydzień × auta × dniówka i nocka (natywne pola wyboru), dziś podświetlone;
  na telefonie jeden dzień naraz z przełącznikiem dni. Konflikt: czerwona ramka (dwa auta naraz), bursztynowa
  (brak odpoczynku). Słońce i księżyc odróżniają zmiany obok nazw, nie zamiast nich.
- Pulpit na telefonie w kolejności ważności: wynik tygodnia, sprawy do załatwienia, stawka, godziny, trend.
- Listy aut i kierowców mają wyszukiwanie i filtry z licznikami (od czterech pozycji).

## Logowanie
- Na komputerze lewa kolumna w ciemnej zieleni z przykładowym rachunkiem tygodnia zamiast ilustracji, po prawej formularz.
- Na telefonie sam formularz. Pod formularzem wejście bez konta.

# Postój: zasady wyglądu

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
- 140 do 260 ms, krzywa cubic-bezier(0.23, 1, 0.32, 1). Tylko transform i opacity.
- Ruch pokazuje stan (panel boczny, naciśnięcie), nie zdobi. Szanujemy prefers-reduced-motion.

## Układ
- Komputer: stały panel boczny 232 px, treść do 1180 px.
- Telefon: górny pasek, dolna nawigacja z pięcioma pozycjami, tabele zamieniają się w wiersze.

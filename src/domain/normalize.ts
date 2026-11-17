import type { Driver, Entry } from "./types";

/* Dane zapisane przez starszą wersję aplikacji (w przeglądarce albo w pliku
   kopii) nie mają nowszych pól. Uzupełniamy je wartościami, które zachowują
   dawne wyliczenia: nikt nie jest właścicielem, paliwo liczone szacunkiem. */

export const normDriver = (d: Driver): Driver => ({ ...d, owner: d.owner === true });

export const normEntry = (e: Entry): Entry => ({
  ...e,
  owner: e.owner === true,
  fuelGross: typeof e.fuelGross === "number" && Number.isFinite(e.fuelGross) ? e.fuelGross : null,
});

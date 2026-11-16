/* Formatowanie po polsku. Jedno miejsce, żeby kwoty wszędzie wyglądały tak samo. */

const zl0 = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 });
const zl2 = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n1 = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 });

/* Prawdziwy minus zamiast łącznika, żeby straty były czytelne w kolumnie. */
const sign = (s: string) => s.replace(/^-/, "−");

/** Kwota bez groszy: 12 345 zł */
export const zl = (v: number) => `${sign(zl0.format(Math.round(v)))} zł`;

/** Kwota z groszami: 12 345,67 zł */
export const zlExact = (v: number) => `${sign(zl2.format(v))} zł`;

/** Sama liczba, do osi i krótkich etykiet. */
export const num = (v: number) => sign(zl0.format(Math.round(v)));

export const num1 = (v: number) => sign(n1.format(v));

export const pct = (v: number, digits = 0) =>
  `${sign(new Intl.NumberFormat("pl-PL", { maximumFractionDigits: digits }).format(v * 100))}%`;

/** Skrót do osi wykresu: 12,5 tys. */
export const short = (v: number) =>
  Math.abs(v) >= 1000 ? `${sign(n1.format(v / 1000))} tys.` : num(v);

const dayMonth = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short" });
const full = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", year: "numeric" });

export const parseDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

export const toIso = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const shortDate = (iso: string) => (iso ? dayMonth.format(parseDate(iso)) : "brak");
export const longDate = (iso: string) => (iso ? full.format(parseDate(iso)) : "brak");

/** Ile dni zostało do daty. Ujemne: termin minął. */
export function daysUntil(iso: string, today = new Date()): number | null {
  if (!iso) return null;
  const a = parseDate(iso).getTime();
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((a - b) / 86_400_000);
}

/** Polska odmiana: 1 auto, 2 auta, 5 aut. */
export function plural(n: number, one: string, few: string, many: string) {
  const abs = Math.abs(n);
  if (abs === 1) return one;
  const d = abs % 10;
  const h = abs % 100;
  if (d >= 2 && d <= 4 && !(h >= 12 && h <= 14)) return few;
  return many;
}

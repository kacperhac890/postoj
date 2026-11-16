/* Tygodnie ISO: od poniedziałku do niedzieli, klucz w postaci 2026-W46. */

const WEEK_MS = 7 * 86_400_000;

const monday = (d: Date) => {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  c.setDate(c.getDate() - ((c.getDay() + 6) % 7));
  return c;
};

export function weekKey(date: Date): string {
  const m = monday(date);
  /* Czwartek tygodnia decyduje o roku ISO. */
  const thursday = new Date(m);
  thursday.setDate(m.getDate() + 3);
  const year = thursday.getFullYear();
  const firstMonday = monday(new Date(year, 0, 4));
  const week = Math.round((m.getTime() - firstMonday.getTime()) / WEEK_MS) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function weekStart(key: string): Date {
  const [y, w] = key.split("-W").map(Number);
  const d = monday(new Date(y, 0, 4));
  d.setDate(d.getDate() + (w - 1) * 7);
  return d;
}

export function shiftWeek(key: string, by: number): string {
  const d = weekStart(key);
  d.setDate(d.getDate() + by * 7);
  return weekKey(d);
}

export const currentWeek = () => weekKey(new Date());
export const lastFullWeek = () => shiftWeek(currentWeek(), -1);

export const weekNumber = (key: string) => Number(key.split("-W")[1]);

const dm = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short" });
const dOnly = new Intl.DateTimeFormat("pl-PL", { day: "numeric" });

/** Zakres dat tygodnia: 9–15 lis albo 30 lis – 6 gru. */
export function weekRange(key: string): string {
  const a = weekStart(key);
  const b = new Date(a);
  b.setDate(a.getDate() + 6);
  return a.getMonth() === b.getMonth()
    ? `${dOnly.format(a)}–${dm.format(b)}`
    : `${dm.format(a)} – ${dm.format(b)}`;
}

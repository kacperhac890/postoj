import { useEffect, useRef, useState } from "react";
import { cn } from "./kit";

/* Drobne elementy ruchu. Wszystko respektuje prefers-reduced-motion. */

const reduced = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Liczba, która dochodzi do nowej wartości zamiast przeskakiwać.
 * Przy zmianie tygodnia widać, w którą stronę i o ile zmienił się wynik.
 * Startuje od poprzedniej wartości, nie od zera: pierwszy widok pokazuje
 * od razu prawdziwą liczbę.
 */
export function useTweened(value: number, ms = 420) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const frame = useRef(0);

  useEffect(() => {
    const start = from.current;
    if (start === value || reduced()) {
      from.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 4);
      const v = start + (value - start) * eased;
      from.current = v;
      setShown(v);
      if (p < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value, ms]);

  return shown;
}

export function Tween({ value, format, ms }: { value: number; format: (v: number) => string; ms?: number }) {
  const v = useTweened(value, ms);
  return <>{format(v)}</>;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={cn("spin h-4 w-4", className)}>
      <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2.25" />
      <path d="M17.5 10a7.5 7.5 0 0 0-7.5-7.5" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}

/** Szkielet ekranu w czasie pobierania danych konta. */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Wczytywanie danych" className="enter">
      <div className="mb-7 flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2.5">
          <div className="skeleton h-7 w-40" />
          <div className="skeleton h-4 w-72 max-w-[70vw]" />
        </div>
        <div className="skeleton hidden h-10 w-44 sm:block" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="rounded-panel border border-line bg-surface p-5">
          <div className="skeleton h-4 w-36" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="mt-5 flex flex-col gap-2">
              <div className="flex justify-between">
                <div className="skeleton h-4 w-28" />
                <div className="skeleton h-4 w-20" />
              </div>
              <div className="skeleton h-1.5 w-full" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-panel border border-line bg-surface p-5">
              <div className="skeleton h-4 w-32" />
              <div className="skeleton mt-5 h-8 w-28" />
              <div className="skeleton mt-4 h-2 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

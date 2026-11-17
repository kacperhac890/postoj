import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { num1, short, zl } from "../domain/format";
import { weekNumber, weekRange } from "../domain/week";
import { cn } from "../ui/kit";

/* Wykresy rysowane ręcznie w SVG: dwa proste kształty nie uzasadniają
   biblioteki, a dzięki temu wyglądają jak reszta aplikacji. */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/* ------------------------------------------------------------------
   Wynik tydzień po tygodniu
   ------------------------------------------------------------------ */

/** Słupek z zaokrąglonym końcem danych, zakotwiczony na linii zera. */
function barPath(x: number, w: number, zero: number, y: number) {
  const h = Math.abs(zero - y);
  const r = Math.min(4, w / 2, h);
  if (h < 0.5) return "";
  return y < zero
    ? `M${x},${zero}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${zero}Z`
    : `M${x},${zero}V${y - r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y - r}V${zero}Z`;
}

export function WeekBars({
  items,
  selected,
  onSelect,
}: {
  items: Array<{ week: string; value: number; empty: boolean }>;
  selected: string;
  onSelect: (week: string) => void;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const H = 132;
  const LABEL = 20;
  const plot = H - LABEL;

  const max = Math.max(1, ...items.map((i) => i.value));
  const min = Math.min(0, ...items.map((i) => i.value));
  const span = max - min;
  const zero = 6 + ((plot - 12) * max) / span;
  const y = (v: number) => zero - ((plot - 12) * v) / span;

  const band = items.length > 0 ? width / items.length : 0;
  const barW = Math.max(6, Math.min(34, band - 10));
  const focus = items.find((i) => i.week === (hover ?? selected)) ?? items[items.length - 1];

  return (
    <div>
      <p className="mb-2 flex flex-wrap items-baseline gap-x-2 text-[0.8125rem] text-ink-2" aria-live="polite">
        {focus ? (
          <>
            <span>
              Tydzień {weekNumber(focus.week)}, {weekRange(focus.week)}
            </span>
            <span className={cn("num font-semibold", focus.empty ? "text-ink-3" : focus.value < 0 ? "text-red" : "text-green-ink")}>
              {focus.empty ? "brak rozliczeń" : zl(focus.value)}
            </span>
          </>
        ) : null}
      </p>
      <div ref={ref}>
        {width > 0 ? (
          <svg
            width={width}
            height={H}
            role="img"
            aria-label="Wynik spółki w kolejnych tygodniach"
            onMouseLeave={() => setHover(null)}
          >
            <line x1={0} x2={width} y1={zero} y2={zero} className="stroke-line-strong" strokeWidth={1} />
            {items.map((item, i) => {
              const x = i * band + (band - barW) / 2;
              const active = item.week === selected;
              return (
                <g key={item.week}>
                  {item.empty ? (
                    <line
                      x1={x}
                      x2={x + barW}
                      y1={zero}
                      y2={zero}
                      className="stroke-ink-3"
                      strokeWidth={2}
                      strokeDasharray="2 3"
                    />
                  ) : (
                    <path
                      d={barPath(x, barW, zero, y(item.value))}
                      style={{ "--i": i } as CSSProperties}
                      className={cn(
                        "bar-rise transition-opacity duration-150",
                        item.value < 0 && "below",
                        item.value < 0 ? "fill-red" : "fill-green",
                        active || hover === item.week ? "opacity-100" : "opacity-45",
                      )}
                    />
                  )}
                  <text
                    x={i * band + band / 2}
                    y={H - 4}
                    textAnchor="middle"
                    className={cn("num text-[11px]", active ? "fill-ink font-semibold" : "fill-ink-3")}
                  >
                    {weekNumber(item.week)}
                  </text>
                  {/* Pole trafienia większe od słupka. */}
                  <rect
                    x={i * band}
                    y={0}
                    width={band}
                    height={H}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHover(item.week)}
                    onClick={() => onSelect(item.week)}
                  />
                </g>
              );
            })}
          </svg>
        ) : (
          <div style={{ height: H }} />
        )}
      </div>
      <table className="sr-only">
        <caption>Wynik spółki w kolejnych tygodniach</caption>
        <tbody>
          {items.map((i) => (
            <tr key={i.week}>
              <th scope="row">Tydzień {weekNumber(i.week)}</th>
              <td>{i.empty ? "brak rozliczeń" : zl(i.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------
   Zysk w zależności od stawki z aplikacji
   ------------------------------------------------------------------ */

export function ProfitCurve({
  profitAt,
  rate,
  breakEven,
  onPick,
}: {
  profitAt: (rate: number) => number;
  rate: number;
  breakEven: number | null;
  onPick?: (rate: number) => void;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const LO = 30;
  const HI = 80;
  const H = 220;
  const pad = { top: 14, right: 12, bottom: 26, left: 52 };

  const points = useMemo(() => {
    const list: Array<{ r: number; v: number }> = [];
    for (let r = LO; r <= HI; r += 1) list.push({ r, v: profitAt(r) });
    return list;
  }, [profitAt]);

  const vMax = Math.max(1000, ...points.map((p) => p.v));
  const vMin = Math.min(0, ...points.map((p) => p.v));
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = H - pad.top - pad.bottom;
  const x = (r: number) => pad.left + ((r - LO) / (HI - LO)) * innerW;
  const y = (v: number) => pad.top + ((vMax - v) / (vMax - vMin)) * innerH;
  const zero = y(0);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.r).toFixed(1)},${y(p.v).toFixed(1)}`).join("");

  /* Okrągłe podziałki osi wartości. */
  const step = [5000, 10000, 20000, 25000, 50000, 100000, 200000].find((s) => (vMax - vMin) / s <= 5) ?? 500000;
  const ticks: number[] = [];
  for (let t = Math.ceil(vMin / step) * step; t <= vMax; t += step) ticks.push(t);

  const shownRate = hover ?? rate;
  const shownValue = profitAt(shownRate);

  function rateFromEvent(clientX: number, target: SVGSVGElement) {
    const box = target.getBoundingClientRect();
    const raw = LO + ((clientX - box.left - pad.left) / innerW) * (HI - LO);
    return Math.round(Math.min(HI, Math.max(LO, raw)));
  }

  return (
    <div>
      <p className="mb-1 flex flex-wrap items-baseline gap-x-2 text-[0.8125rem] text-ink-2" aria-live="polite">
        <span className="num">Przy {num1(shownRate)} zł na godzinę</span>
        <span className={cn("num font-semibold", shownValue < 0 ? "text-red" : "text-green-ink")}>
          {zl(shownValue)} miesięcznie
        </span>
      </p>
      <div ref={ref}>
        {width > 0 ? (
          <svg
            width={width}
            height={H}
            role="img"
            aria-label="Zysk netto spółki w zależności od stawki netto na godzinę"
            className="touch-pan-y select-none"
            onPointerMove={(e) => setHover(rateFromEvent(e.clientX, e.currentTarget))}
            onPointerLeave={() => setHover(null)}
            onClick={(e) => onPick?.(rateFromEvent(e.clientX, e.currentTarget))}
          >
            {/* Strefa straty */}
            {vMin < 0 ? (
              <rect x={pad.left} y={zero} width={innerW} height={pad.top + innerH - zero} className="fill-red-soft" />
            ) : null}

            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={pad.left}
                  x2={pad.left + innerW}
                  y1={y(t)}
                  y2={y(t)}
                  className={t === 0 ? "stroke-line-strong" : "stroke-line"}
                  strokeWidth={1}
                />
                <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" className="num fill-ink-3 text-[11px]">
                  {short(t)}
                </text>
              </g>
            ))}

            {[30, 40, 50, 60, 70, 80].map((r) => (
              <text key={r} x={x(r)} y={H - 6} textAnchor="middle" className="num fill-ink-3 text-[11px]">
                {r} zł
              </text>
            ))}

            {breakEven !== null && breakEven >= LO && breakEven <= HI ? (
              <g>
                <line
                  x1={x(breakEven)}
                  x2={x(breakEven)}
                  y1={pad.top}
                  y2={pad.top + innerH}
                  className="stroke-ink-3"
                  strokeWidth={1}
                  strokeDasharray="3 4"
                />
                <text
                  x={x(breakEven) + (breakEven > 68 ? -6 : 6)}
                  y={pad.top + 10}
                  textAnchor={breakEven > 68 ? "end" : "start"}
                  className="num fill-ink-2 text-[11px] font-medium"
                >
                  próg {num1(breakEven)} zł
                </text>
              </g>
            ) : null}

            <path d={path} fill="none" className="stroke-green" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

            {hover !== null ? (
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={pad.top}
                y2={pad.top + innerH}
                className="stroke-ink-2"
                strokeWidth={1}
              />
            ) : null}
            <circle
              cx={x(Math.min(HI, Math.max(LO, shownRate)))}
              cy={y(shownValue)}
              r={5}
              className={cn("stroke-surface", shownValue < 0 ? "fill-red" : "fill-green")}
              strokeWidth={2}
            />
          </svg>
        ) : (
          <div style={{ height: H }} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Stawka na tle progu rentowności i planu
   ------------------------------------------------------------------ */

export function RateTrack({
  actual,
  breakEven,
  plan,
}: {
  actual: number;
  breakEven: number | null;
  plan: number;
}) {
  const values = [actual, plan, ...(breakEven !== null ? [breakEven] : [])].filter((v) => v > 0);
  const lo = Math.floor((Math.min(...values) - 6) / 5) * 5;
  const hi = Math.ceil((Math.max(...values) + 6) / 5) * 5;
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))}%`;
  const ok = breakEven === null || actual >= breakEven;

  return (
    <div className="pt-6 pb-5">
      <div className="relative h-2 rounded-full bg-sunken">
        {breakEven !== null ? (
          <div className="absolute inset-y-0 left-0 rounded-l-full bg-red-soft transition-[width] duration-500 ease-[var(--ease-out)]" style={{ width: pos(breakEven) }} />
        ) : null}

        {breakEven !== null ? (
          <div className="absolute -top-1.5 h-5 w-px bg-ink-2 transition-[left] duration-500 ease-[var(--ease-out)]" style={{ left: pos(breakEven) }}>
            <span className="num absolute -top-5 left-1/2 -translate-x-1/2 text-[0.6875rem] whitespace-nowrap text-ink-2">
              próg {num1(breakEven)}
            </span>
          </div>
        ) : null}

        <div className="absolute -top-1.5 h-5 w-px bg-green" style={{ left: pos(plan) }}>
          <span className="num absolute top-5 left-1/2 -translate-x-1/2 pt-0.5 text-[0.6875rem] whitespace-nowrap text-green-ink">
            plan {num1(plan)}
          </span>
        </div>

        {actual > 0 ? (
          <div
            className={cn(
              "absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface shadow-[0_1px_3px_oklch(0.2_0.03_162/0.25)] transition-[left,background-color] duration-500 ease-[var(--ease-out)]",
              ok ? "bg-green" : "bg-red",
            )}
            style={{ left: pos(actual) }}
          />
        ) : null}
      </div>
    </div>
  );
}

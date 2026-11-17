import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { cn } from "./kit";

/* Pasek nad listą: wyszukiwanie i filtry z licznikami.
   Na telefonie filtry przewijają się w poziomie zamiast łamać się w wiersze. */

export interface Chip<T extends string> {
  value: T;
  label: string;
  count: number;
  tone?: "amber";
}

export function ListToolbar<T extends string>({
  query,
  onQuery,
  placeholder,
  chips,
  value,
  onChange,
}: {
  query: string;
  onQuery: (q: string) => void;
  placeholder: string;
  chips: Array<Chip<T>>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-line px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5">
      <div
        role="radiogroup"
        aria-label="Filtr listy"
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {chips.map((c) => {
          const active = c.value === value;
          return (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(c.value)}
              className={cn(
                "press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[0.8125rem] font-medium whitespace-nowrap",
                active
                  ? "border-green bg-green text-white"
                  : "border-line-strong bg-surface text-ink-2 hover:border-ink-3 hover:text-ink",
              )}
            >
              {c.label}
              <span
                className={cn(
                  "num rounded-full px-1.5 text-[0.6875rem] leading-[1.125rem]",
                  active
                    ? "bg-white/20 text-white"
                    : c.tone === "amber" && c.count > 0
                      ? "bg-amber-soft text-amber"
                      : "bg-sunken text-ink-3",
                )}
              >
                {c.count}
              </span>
            </button>
          );
        })}
      </div>

      <label className="relative block md:w-64 md:shrink-0">
        <span className="sr-only">Szukaj</span>
        <MagnifyingGlass
          size={16}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "h-9 w-full rounded-control border border-line-strong bg-surface pr-9 pl-9 text-base text-ink outline-none md:text-[0.875rem]",
            "transition-[border-color,box-shadow] duration-150 placeholder:text-ink-3",
            "focus:border-green focus:shadow-[0_0_0_3px_var(--color-green-soft)]",
            "[&::-webkit-search-cancel-button]:appearance-none",
          )}
        />
        {query ? (
          <button
            type="button"
            onClick={() => onQuery("")}
            aria-label="Wyczyść wyszukiwanie"
            className="press absolute top-1/2 right-1 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[6px] text-ink-3 hover:bg-sunken hover:text-ink"
          >
            <X size={14} />
          </button>
        ) : null}
      </label>
    </div>
  );
}

/** Pusty wynik filtra: krótko i z wyjściem. */
export function NoMatches({ onReset }: { onReset: () => void }) {
  return (
    <div className="enter flex flex-col items-start gap-2 px-4 py-8 md:px-5">
      <p className="text-[0.875rem] text-ink-2">Nic nie pasuje do wyszukiwania i filtra.</p>
      <button
        type="button"
        onClick={onReset}
        className="text-[0.8125rem] font-medium text-green-ink underline-offset-4 hover:underline"
      >
        Pokaż wszystko
      </button>
    </div>
  );
}

/** Porównanie bez wielkości liter i polskich znaków: "lodz" znajdzie "Łódź". */
export const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/\s+/g, " ")
    .trim();

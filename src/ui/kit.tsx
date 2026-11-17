import { useEffect, useRef, useState } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { CaretDown } from "@phosphor-icons/react";

export const cn = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/* ------------------------------------------------------------------
   Przycisk. Jeden kształt w całej aplikacji.
   ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-green text-white hover:bg-green-hover",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-sunken",
  quiet: "text-ink-2 hover:bg-sunken hover:text-ink",
  danger: "text-red hover:bg-red-soft",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "md" | "sm";
}

export function Button({ variant = "secondary", size = "md", className, type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn(
        "press inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap",
        "disabled:pointer-events-none disabled:opacity-45",
        size === "md" ? "h-10 px-4 text-[0.9375rem]" : "h-8 px-3 text-[0.8125rem]",
        buttonStyles[variant],
        className,
      )}
      {...rest}
    />
  );
}

/* ------------------------------------------------------------------
   Powierzchnie i znaczniki
   ------------------------------------------------------------------ */

export function Panel({
  title,
  aside,
  children,
  className,
  flush,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Bez wewnętrznych odstępów, np. dla list od krawędzi do krawędzi. */
  flush?: boolean;
}) {
  return (
    <section className={cn("rounded-panel border border-line bg-surface", className)}>
      {title ? (
        <header className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-4 py-2.5 md:px-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink">{title}</h2>
          {aside ? <div className="text-[0.8125rem] text-ink-3">{aside}</div> : null}
        </header>
      ) : null}
      <div className={flush ? undefined : "p-4 md:p-5"}>{children}</div>
    </section>
  );
}

type Tone = "neutral" | "green" | "amber" | "red";

const toneStyles: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2",
  green: "bg-green-soft text-green-ink",
  amber: "bg-amber-soft text-amber",
  red: "bg-red-soft text-red",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-[1.375rem] items-center rounded-full px-2 text-[0.75rem] font-medium whitespace-nowrap",
        toneStyles[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Tablica rejestracyjna: jedyne miejsce z krojem o stałej szerokości. */
export function Plate({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center rounded-[5px] border border-line-strong bg-surface px-1.5 font-mono text-[0.75rem] font-medium tracking-wide whitespace-nowrap text-ink">
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 md:mb-7">
      <div className="min-w-0">
        <h1 className="text-[1.375rem] leading-tight font-semibold tracking-[-0.015em] text-ink md:text-[1.625rem]">
          {title}
        </h1>
        {lead ? <p className="mt-1 max-w-[62ch] text-[0.875rem] text-ink-2">{lead}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  );
}

export function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 px-4 py-10 md:px-8 md:py-14">
      <span className="flex h-10 w-10 items-center justify-center rounded-control bg-green-soft text-green-ink">
        {icon}
      </span>
      <div>
        <h3 className="text-[1rem] font-semibold text-ink">{title}</h3>
        <p className="mt-1 max-w-[52ch] text-[0.875rem] text-ink-2">{children}</p>
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------
   Formularze
   ------------------------------------------------------------------ */

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[0.8125rem] font-medium text-ink-2">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-[0.75rem] leading-snug text-ink-3">{hint}</span> : null}
    </label>
  );
}

const controlBase =
  "h-10 w-full rounded-control border border-line-strong bg-surface px-3 text-base text-ink outline-none " +
  "transition-[border-color,box-shadow] duration-150 placeholder:text-ink-3 " +
  "focus:border-green focus:shadow-[0_0_0_3px_var(--color-green-soft)] md:text-[0.9375rem]";

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" className={cn(controlBase, className)} {...rest} />;
}

const toText = (v: number) =>
  Number.isFinite(v) ? String(Math.round(v * 100) / 100).replace(".", ",") : "";

/** Pole liczbowe z polskim przecinkiem. Dla procentów trzyma ułamek, pokazuje procent. */
export function NumberInput({
  value,
  onChange,
  suffix,
  percent,
  ...rest
}: {
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  percent?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const shown = percent ? value * 100 : value;
  const [text, setText] = useState(() => toText(shown));
  const focused = useRef(false);

  /* Wartość zmieniona z zewnątrz (np. gotowy wariant) nadpisuje pole,
     ale nie w trakcie pisania: inaczej "12," zamieniałoby się w "12". */
  useEffect(() => {
    if (!focused.current) setText(toText(shown));
  }, [shown]);

  return (
    <span className="relative block">
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={cn(controlBase, "num", suffix ? "pr-12" : undefined)}
        value={text}
        onFocus={(e) => {
          focused.current = true;
          e.currentTarget.select();
        }}
        onBlur={() => {
          focused.current = false;
          setText(toText(shown));
        }}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const parsed = Number.parseFloat(raw.replace(/\s/g, "").replace(",", "."));
          if (Number.isFinite(parsed)) onChange(percent ? parsed / 100 : parsed);
          else if (raw.trim() === "") onChange(0);
        }}
        {...rest}
      />
      {suffix ? (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[0.8125rem] text-ink-3">
          {suffix}
        </span>
      ) : null}
    </span>
  );
}

/** Pole liczbowe, które może zostać puste (null), np. "realny koszt, jeśli znasz". */
export function OptionalNumberInput({
  value,
  onChange,
  suffix,
  ...rest
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  suffix?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [text, setText] = useState(() => (value === null ? "" : toText(value)));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value === null ? "" : toText(value));
  }, [value]);

  return (
    <span className="relative block">
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={cn(controlBase, "num", suffix ? "pr-12" : undefined)}
        value={text}
        onFocus={(e) => {
          focused.current = true;
          e.currentTarget.select();
        }}
        onBlur={() => {
          focused.current = false;
          setText(value === null ? "" : toText(value));
        }}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          if (raw.trim() === "") return onChange(null);
          const parsed = Number.parseFloat(raw.replace(/\s/g, "").replace(",", "."));
          if (Number.isFinite(parsed)) onChange(Math.max(0, parsed));
        }}
        {...rest}
      />
      {suffix ? (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[0.8125rem] text-ink-3">
          {suffix}
        </span>
      ) : null}
    </span>
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select className={cn(controlBase, "appearance-none pr-9", className)} {...rest}>
        {children}
      </select>
      <CaretDown
        size={14}
        weight="bold"
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-3"
        aria-hidden="true"
      />
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[0.875rem] font-medium text-ink">{label}</div>
        {hint ? <div className="mt-0.5 text-[0.75rem] leading-snug text-ink-3">{hint}</div> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors duration-150",
          checked ? "bg-green" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_oklch(0.2_0.03_162/0.3)]",
            "transition-transform duration-200 ease-[var(--ease-out)]",
            checked ? "translate-x-4" : undefined,
          )}
        />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-control bg-sunken p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-9 flex-1 rounded-[6px] px-3 text-[0.875rem] font-medium transition-colors duration-150",
              active
                ? "bg-surface text-ink shadow-[0_1px_2px_oklch(0.2_0.03_162/0.12)]"
                : "text-ink-2 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Wiersz typu etykieta i wartość, do podsumowań. */
export function Row({
  label,
  value,
  strong,
  tone,
  hint,
}: {
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
  tone?: "green" | "red";
  hint?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className={cn("min-w-0 text-[0.875rem]", strong ? "font-semibold text-ink" : "text-ink-2")}>
        {label}
        {hint ? (
          <span className="ml-1.5 inline-block text-[0.75rem] font-normal whitespace-nowrap text-ink-3">{hint}</span>
        ) : null}
      </span>
      <span
        className={cn(
          "num shrink-0 text-[0.9375rem]",
          strong ? "font-semibold" : "font-medium",
          tone === "green" ? "text-green-ink" : tone === "red" ? "text-red" : "text-ink",
        )}
      >
        {value}
      </span>
    </div>
  );
}

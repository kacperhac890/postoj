import { useEffect } from "react";
import { create } from "zustand";
import { CheckCircle, WarningCircle, X } from "@phosphor-icons/react";
import { cn } from "./kit";

/* Krótkie potwierdzenia i błędy zapisu. Pojawiają się przy dolnej
   krawędzi (nad dolną nawigacją na telefonie) i znikają same. */

type Tone = "ok" | "error";

interface ToastItem {
  id: number;
  text: string;
  tone: Tone;
  leaving: boolean;
}

interface ToastState {
  items: ToastItem[];
  push: (text: string, tone: Tone) => void;
  dismiss: (id: number) => void;
  drop: (id: number) => void;
}

let seq = 0;

const useToasts = create<ToastState>((set) => ({
  items: [],
  push: (text, tone) =>
    set((s) => {
      /* Ten sam komunikat dwa razy pod rząd nie dubluje się na ekranie. */
      if (s.items.some((t) => t.text === text && !t.leaving)) return s;
      return { items: [...s.items.slice(-2), { id: ++seq, text, tone, leaving: false }] };
    }),
  dismiss: (id) => set((s) => ({ items: s.items.map((t) => (t.id === id ? { ...t, leaving: true } : t)) })),
  drop: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

export const toast = {
  ok: (text: string) => useToasts.getState().push(text, "ok"),
  error: (text: string) => useToasts.getState().push(text, "error"),
};

function Item({ t }: { t: ToastItem }) {
  const dismiss = useToasts((s) => s.dismiss);
  const drop = useToasts((s) => s.drop);

  useEffect(() => {
    const ms = t.tone === "error" ? 6500 : 3200;
    const timer = window.setTimeout(() => dismiss(t.id), ms);
    return () => window.clearTimeout(timer);
  }, [t.id, t.tone, dismiss]);

  useEffect(() => {
    if (!t.leaving) return;
    const timer = window.setTimeout(() => drop(t.id), 180);
    return () => window.clearTimeout(timer);
  }, [t.leaving, t.id, drop]);

  const Icon = t.tone === "error" ? WarningCircle : CheckCircle;
  return (
    <div
      role={t.tone === "error" ? "alert" : "status"}
      className={cn(
        "toast pointer-events-auto flex w-full items-start gap-2.5 rounded-panel bg-green-deep py-2.5 pr-1.5 pl-3.5 text-[0.875rem] text-on-deep shadow-[0_12px_32px_-12px_oklch(0.2_0.04_162/0.5)]",
        t.leaving && "toast-leave",
      )}
    >
      <Icon
        size={18}
        weight="fill"
        className={cn("mt-px shrink-0", t.tone === "error" ? "text-[oklch(0.78_0.13_35)]" : "text-[oklch(0.8_0.12_156)]")}
      />
      <span className="min-w-0 flex-1 py-px leading-snug">{t.text}</span>
      <button
        type="button"
        onClick={() => dismiss(t.id)}
        aria-label="Zamknij komunikat"
        className="press -my-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-on-deep-2 hover:bg-green-deep-2 hover:text-on-deep"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function Toaster() {
  const items = useToasts((s) => s.items);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 mx-auto flex w-full max-w-[420px] flex-col gap-2 px-4 md:right-6 md:bottom-6 md:left-auto md:mx-0 md:px-0"
    >
      {items.map((t) => (
        <Item key={t.id} t={t} />
      ))}
    </div>
  );
}

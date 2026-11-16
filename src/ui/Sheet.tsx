import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { X } from "@phosphor-icons/react";

/* Panel edycji na natywnym <dialog>: przeglądarka sama pilnuje fokusu,
   klawisza Esc i warstwy nad stroną. */

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onSubmit?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit?.();
  }

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        /* Kliknięcie w tło trafia w sam element dialog, nie w jego treść. */
        if (e.target === ref.current) onClose();
      }}
    >
      <form onSubmit={submit} className="flex max-h-[92dvh] flex-col md:h-dvh md:max-h-none">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line py-3 pr-2 pl-5">
          <h2 className="text-[1.0625rem] font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij"
            className="press flex h-10 w-10 items-center justify-center rounded-control text-ink-2 hover:bg-sunken hover:text-ink"
          >
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>
        {footer ? (
          <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        ) : null}
      </form>
    </dialog>
  );
}

/** Trzyma ostatnią niepustą wartość, żeby treść panelu nie znikała w trakcie zamykania. */
export function useRetained<T>(value: T | null): T | null {
  const [kept, setKept] = useState<T | null>(value);
  useEffect(() => {
    if (value !== null) setKept(value);
  }, [value]);
  return value ?? kept;
}

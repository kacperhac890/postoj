import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { currentWeek, shiftWeek, weekNumber, weekRange } from "../domain/week";

const arrow =
  "press flex h-10 w-10 items-center justify-center text-ink-2 hover:bg-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-35";

export function WeekSwitcher({ week, onChange }: { week: string; onChange: (w: string) => void }) {
  const atEnd = week >= currentWeek();
  return (
    <div className="flex h-10 items-stretch overflow-hidden rounded-control border border-line-strong bg-surface">
      <button
        type="button"
        className={arrow}
        aria-label="Poprzedni tydzień"
        onClick={() => onChange(shiftWeek(week, -1))}
      >
        <CaretLeft size={16} weight="bold" />
      </button>
      <div
        className="flex min-w-[9.5rem] flex-col items-center justify-center border-x border-line px-3 leading-tight"
        aria-live="polite"
      >
        <span className="text-[0.8125rem] font-semibold text-ink">Tydzień {weekNumber(week)}</span>
        <span className="num text-[0.6875rem] text-ink-3">{weekRange(week)}</span>
      </div>
      <button
        type="button"
        className={arrow}
        aria-label="Następny tydzień"
        disabled={atEnd}
        onClick={() => onChange(shiftWeek(week, 1))}
      >
        <CaretRight size={16} weight="bold" />
      </button>
    </div>
  );
}

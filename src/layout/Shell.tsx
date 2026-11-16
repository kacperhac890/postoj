import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Calculator, Car, Gauge, GearSix, IdentificationCard, Receipt } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useFleet } from "../store/useFleet";
import { cn } from "../ui/kit";

const NAV: Array<{ to: string; label: string; icon: Icon }> = [
  { to: "/", label: "Pulpit", icon: Gauge },
  { to: "/flota", label: "Flota", icon: Car },
  { to: "/kierowcy", label: "Kierowcy", icon: IdentificationCard },
  { to: "/rozliczenia", label: "Rozliczenia", icon: Receipt },
  { to: "/kalkulator", label: "Kalkulator", icon: Calculator },
];

function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-green-deep-2" />
      <rect x="8" y="8" width="7" height="7" rx="1.5" className="fill-on-deep" />
      <rect x="17" y="17" width="7" height="7" rx="1.5" className="fill-on-deep" />
      <rect x="17" y="8" width="7" height="7" rx="1.5" fill="oklch(0.7 0.11 156)" />
      <rect x="8" y="17" width="7" height="7" rx="1.5" fill="oklch(0.7 0.11 156)" />
    </svg>
  );
}

export function Shell() {
  const demo = useFleet((s) => s.demo);
  const { pathname } = useLocation();

  /* Nowy ekran zaczyna się od góry, bez animowanego przewijania. */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  return (
    <div className="min-h-dvh lg:pl-[232px]">
      {/* Panel boczny: komputer */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col bg-green-deep px-3 py-4 lg:flex">
        <Link to="/" className="flex items-center gap-2.5 rounded-control px-2 py-1.5">
          <Mark />
          <span className="text-[1.0625rem] font-semibold tracking-[-0.01em] text-on-deep">Postój</span>
        </Link>

        <nav aria-label="Główna nawigacja" className="mt-6 flex flex-col gap-0.5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "press flex h-10 items-center gap-3 rounded-control px-3 text-[0.9375rem] font-medium",
                  isActive
                    ? "bg-green-deep-2 text-white"
                    : "text-on-deep-2 hover:bg-green-deep-2/60 hover:text-on-deep",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={19} weight={isActive ? "fill" : "regular"} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-2">
          {demo ? (
            <p className="rounded-control border border-green-deep-2 px-3 py-2.5 text-[0.75rem] leading-snug text-on-deep-2">
              Oglądasz dane przykładowe. Usuniesz je w ustawieniach.
            </p>
          ) : null}
          <NavLink
            to="/ustawienia"
            className={({ isActive }) =>
              cn(
                "press flex h-10 items-center gap-3 rounded-control px-3 text-[0.9375rem] font-medium",
                isActive
                  ? "bg-green-deep-2 text-white"
                  : "text-on-deep-2 hover:bg-green-deep-2/60 hover:text-on-deep",
              )
            }
          >
            <GearSix size={19} />
            Ustawienia
          </NavLink>
        </div>
      </aside>

      {/* Górny pasek: telefon i tablet */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-bg px-4 lg:hidden">
        <Link to="/" className="flex items-center gap-2.5">
          <Mark size={26} />
          <span className="text-[1.0625rem] font-semibold tracking-[-0.01em] text-ink">Postój</span>
        </Link>
        <div className="flex items-center gap-1">
          {demo ? (
            <Link
              to="/ustawienia"
              className="rounded-full bg-amber-soft px-2.5 py-1 text-[0.75rem] font-medium text-amber"
            >
              Dane przykładowe
            </Link>
          ) : null}
          <NavLink
            to="/ustawienia"
            aria-label="Ustawienia"
            className={({ isActive }) =>
              cn(
                "press flex h-10 w-10 items-center justify-center rounded-control",
                isActive ? "bg-green-soft text-green-ink" : "text-ink-2 hover:bg-sunken",
              )
            }
          >
            <GearSix size={21} />
          </NavLink>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1180px] px-4 pt-5 pb-28 md:px-8 md:pt-8 lg:pb-16">
        <Outlet />
      </main>

      {/* Dolna nawigacja: telefon i tablet */}
      <nav
        aria-label="Główna nawigacja"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex h-[3.75rem] flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium",
                isActive ? "text-green-ink" : "text-ink-3",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    "flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-150",
                    isActive ? "bg-green-soft" : undefined,
                  )}
                >
                  <Icon size={21} weight={isActive ? "fill" : "regular"} />
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

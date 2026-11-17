import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ArrowClockwise,
  CalendarBlank,
  Calculator,
  UserCircleDashed,
  Car,
  CloudCheck,
  CloudSlash,
  Gauge,
  GearSix,
  IdentificationCard,
  Receipt,
  SignIn,
  SignOut,
  Wrench,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { cloudConfigured } from "../data/cloud";
import { startIssuesLive, stopIssuesLive, useUnreadCount } from "../data/issues";
import { leaveGuest, refreshAccount, signOut, useSession } from "../data/session";
import { useFleet } from "../store/useFleet";
import { Button, Panel, cn } from "../ui/kit";
import { PageSkeleton, Spinner } from "../ui/motion";
import { Mark } from "./Mark";

type Item = { to: string; label: string; icon: Icon };

const ITEMS: Record<string, Item> = {
  home: { to: "/", label: "Pulpit", icon: Gauge },
  schedule: { to: "/grafik", label: "Grafik", icon: CalendarBlank },
  fleet: { to: "/flota", label: "Flota", icon: Car },
  issues: { to: "/usterki", label: "Usterki", icon: Wrench },
  drivers: { to: "/kierowcy", label: "Kierowcy", icon: IdentificationCard },
  pay: { to: "/rozliczenia", label: "Rozliczenia", icon: Receipt },
  calc: { to: "/kalkulator", label: "Kalkulator", icon: Calculator },
};

/* Admin widzi wszystko. Na telefonie kalkulator i usterki są w górnym pasku,
   żeby dolna nawigacja miała pięć pozycji. Kierowca: podgląd i zgłaszanie usterek. */
const ADMIN_SIDE = [ITEMS.home, ITEMS.schedule, ITEMS.fleet, ITEMS.issues, ITEMS.drivers, ITEMS.pay, ITEMS.calc];
const ADMIN_BOTTOM = [ITEMS.home, ITEMS.schedule, ITEMS.fleet, ITEMS.drivers, ITEMS.pay];
const DRIVER_SIDE = [ITEMS.home, ITEMS.schedule, ITEMS.fleet, ITEMS.issues, { ...ITEMS.pay, label: "Moje rozliczenia" }];
const DRIVER_BOTTOM = [ITEMS.home, ITEMS.schedule, ITEMS.fleet, ITEMS.issues, ITEMS.pay];

/** Liczba nieprzeczytanych rozmów przy ikonie usterek. */
function Unread({ count, className }: { count: number; className?: string }): ReactNode {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "num absolute flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-red px-1 text-[0.625rem] leading-none font-semibold text-white",
        className,
      )}
      aria-label={`${count} nowych wiadomości`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

const indexIn = (list: Item[], pathname: string) =>
  list.findIndex((n) => (n.to === "/" ? pathname === "/" : pathname.startsWith(n.to)));

/** Pozycja wskaźnika: poza listą (np. ustawienia) gaśnie w miejscu, zamiast jechać do góry. */
function useIndicator(list: Item[], pathname: string) {
  const active = indexIn(list, pathname);
  const last = useRef(0);
  if (active >= 0) last.current = active;
  return { active, at: last.current };
}

export function Shell() {
  const demo = useFleet((s) => s.demo);
  const phase = useSession((s) => s.phase);
  const mode = useSession((s) => s.mode);
  const role = useSession((s) => s.role);
  const { pathname } = useLocation();
  const admin = role === "admin";
  const NAV = admin ? ADMIN_SIDE : DRIVER_SIDE;
  const BOTTOM = admin ? ADMIN_BOTTOM : DRIVER_BOTTOM;
  const unread = useUnreadCount();
  const user = useSession((s) => s.user?.id ?? null);

  /* Usterki na żywo: po wczytaniu konta (albo od razu bez konta). */
  useEffect(() => {
    if (phase !== "ready" || role === "unlinked") return;
    startIssuesLive();
    return () => stopIssuesLive();
  }, [phase, role, mode, user]);
  const { active, at } = useIndicator(NAV, pathname);
  const bottom = useIndicator(BOTTOM, pathname);

  /* Nowy ekran zaczyna się od góry, bez animowanego przewijania. */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  return (
    <div className="min-h-dvh md:pl-[84px] lg:pl-[240px]">
      {/* Panel boczny: szyna z ikonami na tablecie, pełny panel na komputerze */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[84px] flex-col bg-green-deep px-2.5 py-4 md:flex lg:w-[240px] lg:px-3">
        <Link to="/" className="flex items-center gap-2.5 rounded-control px-2 py-1.5 max-lg:justify-center">
          <Mark />
          <span className="text-[1.0625rem] font-semibold tracking-[-0.01em] text-on-deep max-lg:hidden">Postój</span>
        </Link>

        <nav aria-label="Główna nawigacja" className="relative mt-6 flex flex-col gap-1">
          {/* Tło aktywnej pozycji jeździ między pozycjami zamiast przeskakiwać. */}
          <span
            aria-hidden="true"
            className="nav-indicator absolute inset-x-0 top-0 h-14 rounded-control bg-green-deep-2 lg:h-10"
            style={{
              transform: `translateY(calc(${at} * (100% + 0.25rem)))`,
              opacity: active < 0 ? 0 : 1,
            }}
          />
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              title={label}
              className={({ isActive }) =>
                cn(
                  "press relative flex items-center gap-3 rounded-control text-[0.9375rem] font-medium",
                  "h-14 flex-col justify-center gap-1 px-1 text-[0.6875rem] lg:h-10 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-[0.9375rem]",
                  isActive ? "text-white" : "text-on-deep-2 hover:text-on-deep",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative shrink-0">
                    <Icon size={19} weight={isActive ? "fill" : "regular"} />
                    {to === "/usterki" ? <Unread count={unread} className="-top-1.5 -right-2.5" /> : null}
                  </span>
                  <span className="max-lg:leading-none">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-2">
          {demo ? (
            <p className="rounded-control border border-green-deep-2 px-3 py-2.5 text-[0.75rem] leading-snug text-on-deep-2 max-lg:hidden">
              Oglądasz dane przykładowe. Usuniesz je w ustawieniach.
            </p>
          ) : null}
          <NavLink
            to="/ustawienia"
            title="Ustawienia"
            className={({ isActive }) =>
              cn(
                "press flex items-center rounded-control font-medium",
                "h-14 flex-col justify-center gap-1 text-[0.6875rem] lg:h-10 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-[0.9375rem]",
                isActive ? "bg-green-deep-2 text-white" : "text-on-deep-2 hover:bg-green-deep-2/60 hover:text-on-deep",
              )
            }
          >
            <GearSix size={19} className="shrink-0" />
            <span className="max-lg:leading-none">Ustawienia</span>
          </NavLink>
          <Account />
        </div>
      </aside>

      {/* Górny pasek: telefon */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-bg/90 px-4 backdrop-blur-md md:hidden">
        <Link to="/" className="flex items-center gap-2.5">
          <Mark size={26} />
          <span className="text-[1.0625rem] font-semibold tracking-[-0.01em] text-ink">Postój</span>
        </Link>
        <div className="flex items-center gap-1">
          <SyncDot />
          {demo && mode !== "guest" ? (
            <Link
              to="/ustawienia"
              className="rounded-full bg-amber-soft px-2.5 py-1 text-[0.75rem] font-medium text-amber"
            >
              Dane przykładowe
            </Link>
          ) : null}
          {admin ? (
            <NavLink
              to="/usterki"
              aria-label="Usterki"
              className={({ isActive }) =>
                cn(
                  "press relative flex h-10 w-10 items-center justify-center rounded-control",
                  isActive ? "bg-green-soft text-green-ink" : "text-ink-2 hover:bg-sunken",
                )
              }
            >
              <Wrench size={21} />
              <Unread count={unread} className="top-1 right-0.5" />
            </NavLink>
          ) : null}
          {admin ? (
            <NavLink
              to="/kalkulator"
              aria-label="Kalkulator"
              className={({ isActive }) =>
                cn(
                  "press flex h-10 w-10 items-center justify-center rounded-control",
                  isActive ? "bg-green-soft text-green-ink" : "text-ink-2 hover:bg-sunken",
                )
              }
            >
              <Calculator size={21} />
            </NavLink>
          ) : null}
          <NavLink
            to="/ustawienia"
            aria-label="Ustawienia i konto"
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

      <main className="mx-auto w-full max-w-[1180px] px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-16">
        {phase === "loading" ? (
          <PageSkeleton />
        ) : phase === "error" ? (
          <LoadError />
        ) : role === "unlinked" ? (
          <Unlinked />
        ) : (
          <div key={pathname} className="page">
            <Outlet />
          </div>
        )}
      </main>

      {/* Dolna nawigacja: telefon */}
      <nav
        aria-label="Główna nawigacja"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <div className="relative grid" style={{ gridTemplateColumns: `repeat(${BOTTOM.length}, minmax(0, 1fr))` }}>
          <span
            aria-hidden="true"
            className="nav-indicator pointer-events-none absolute top-[0.6rem] left-0 flex justify-center"
            style={{
              width: `${100 / BOTTOM.length}%`,
              transform: `translateX(${bottom.at * 100}%)`,
              opacity: bottom.active < 0 ? 0 : 1,
            }}
          >
            <span className="h-7 w-12 rounded-full bg-green-soft" />
          </span>
          {BOTTOM.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "press relative flex h-[3.75rem] flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium transition-colors duration-150",
                  isActive ? "text-green-ink" : "text-ink-3",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative flex h-7 w-12 items-center justify-center">
                    <Icon size={21} weight={isActive ? "fill" : "regular"} />
                    {to === "/usterki" ? <Unread count={unread} className="-top-0.5 right-1" /> : null}
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

/* ------------------------------------------------------------------
   Konto i stan zapisu
   ------------------------------------------------------------------ */

function Account() {
  const mode = useSession((s) => s.mode);
  const user = useSession((s) => s.user);
  const pending = useSession((s) => s.pending);
  const syncError = useSession((s) => s.syncError);

  if (!cloudConfigured) return null;

  if (mode === "guest")
    return (
      <button
        type="button"
        onClick={leaveGuest}
        title="Zaloguj się"
        className="press flex h-14 flex-col items-center justify-center gap-1 rounded-control bg-green text-[0.6875rem] font-medium text-white hover:bg-green-hover lg:h-10 lg:flex-row lg:gap-2 lg:text-[0.875rem]"
      >
        <SignIn size={18} />
        <span className="max-lg:leading-none">Zaloguj się</span>
      </button>
    );

  if (!user) return null;
  const initial = user.email.slice(0, 1).toUpperCase() || "?";

  return (
    <div className="flex items-center gap-2.5 border-t border-green-deep-2 pt-3 max-lg:flex-col lg:px-1">
      <span
        className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-deep-2 text-[0.8125rem] font-semibold text-on-deep"
        title={user.email}
      >
        {initial}
        <span
          aria-hidden="true"
          className={cn(
            "absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-green-deep transition-colors duration-200",
            syncError ? "bg-[oklch(0.7_0.15_35)]" : pending > 0 ? "bg-[oklch(0.82_0.12_86)]" : "bg-[oklch(0.75_0.13_156)]",
          )}
        />
      </span>
      <div className="min-w-0 flex-1 max-lg:hidden">
        <div className="truncate text-[0.8125rem] font-medium text-on-deep">{user.email}</div>
        <div className="flex items-center gap-1 text-[0.6875rem] text-on-deep-2" aria-live="polite">
          {syncError ? "Błąd zapisu" : pending > 0 ? "Zapisywanie…" : "Zapisane w bazie"}
        </div>
      </div>
      <button
        type="button"
        onClick={() => void signOut()}
        aria-label="Wyloguj"
        title="Wyloguj"
        className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-on-deep-2 hover:bg-green-deep-2 hover:text-on-deep"
      >
        <SignOut size={17} />
      </button>
    </div>
  );
}

/** Stan zapisu na telefonie: widoczny tylko, gdy coś się dzieje. */
function SyncDot() {
  const mode = useSession((s) => s.mode);
  const pending = useSession((s) => s.pending);
  const syncError = useSession((s) => s.syncError);

  if (mode === "guest")
    return (
      <button
        type="button"
        onClick={leaveGuest}
        className="press mr-1 flex h-8 items-center gap-1.5 rounded-full bg-green px-3 text-[0.75rem] font-medium text-white"
      >
        <SignIn size={14} />
        Zaloguj
      </button>
    );
  if (!cloudConfigured || mode !== "cloud") return null;
  if (syncError)
    return (
      <span className="flex h-10 w-10 items-center justify-center text-red" title={syncError}>
        <CloudSlash size={19} />
        <span className="sr-only">Błąd zapisu</span>
      </span>
    );
  if (pending > 0)
    return (
      <span className="flex h-10 w-10 items-center justify-center text-ink-3" title="Zapisywanie">
        <Spinner />
        <span className="sr-only">Zapisywanie</span>
      </span>
    );
  return (
    <span className="enter flex h-10 w-8 items-center justify-center text-green" title="Zapisane w bazie">
      <CloudCheck size={19} />
      <span className="sr-only">Zapisane w bazie</span>
    </span>
  );
}

function LoadError() {
  const message = useSession((s) => s.loadError);
  return (
    <Panel className="enter mx-auto max-w-[520px]">
      <div className="flex flex-col items-start gap-3 py-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-control bg-red-soft text-red">
          <CloudSlash size={20} />
        </span>
        <div>
          <h1 className="text-[1.0625rem] font-semibold text-ink">Nie udało się wczytać danych</h1>
          <p className="mt-1 text-[0.875rem] text-ink-2">{message}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void refreshAccount(false)}>
            <ArrowClockwise size={16} />
            Spróbuj ponownie
          </Button>
          <Button variant="quiet" onClick={() => void signOut()}>
            Wyloguj
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function Unlinked() {
  const email = useSession((s) => s.user?.email ?? "");
  return (
    <Panel className="enter mx-auto max-w-[540px]">
      <div className="flex flex-col items-start gap-3 py-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-control bg-sunken text-ink-2">
          <UserCircleDashed size={21} />
        </span>
        <div>
          <h1 className="text-[1.0625rem] font-semibold text-ink">Konto czeka na przypisanie</h1>
          <p className="mt-1 text-[0.875rem] leading-relaxed text-ink-2">
            Jesteś zalogowany jako <span className="font-medium text-ink">{email}</span>, ale żaden kierowca we flocie nie
            ma jeszcze tego adresu. Poproś szefa floty, żeby wpisał go w Twojej karcie kierowcy. Potem odśwież stronę.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void refreshAccount(false)}>
            <ArrowClockwise size={16} />
            Sprawdź ponownie
          </Button>
          <Button variant="quiet" onClick={() => void signOut()}>
            Wyloguj
          </Button>
        </div>
      </div>
    </Panel>
  );
}

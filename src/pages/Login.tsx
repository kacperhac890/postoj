import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { ArrowLeft, Eye, EyeSlash, EnvelopeSimple } from "@phosphor-icons/react";
import { describeError, linkError } from "../data/cloud";
import { continueAsGuest, sendReset, setNewPassword, signIn, signUp } from "../data/session";
import { Mark } from "../layout/Mark";
import { Button, Field, TextInput, cn } from "../ui/kit";
import { Spinner } from "../ui/motion";
import { toast } from "../ui/Toast";

type View = "sign-in" | "sign-up" | "reset" | "sent" | "confirm" | "new-password" | "welcome";

const TITLES: Record<View, { title: string; lead: string }> = {
  "sign-in": { title: "Zaloguj się", lead: "Auta, kierowcy i rozliczenia czekają na Twoim koncie." },
  "sign-up": {
    title: "Załóż konto",
    lead: "Kierowco, użyj adresu e-mail, który podałeś szefowi floty. Po zalogowaniu zobaczysz grafik i swoje rozliczenia.",
  },
  reset: { title: "Nie pamiętasz hasła?", lead: "Wyślemy link, którym ustawisz nowe hasło." },
  sent: { title: "Sprawdź skrzynkę", lead: "" },
  confirm: { title: "Potwierdź adres", lead: "" },
  "new-password": { title: "Ustaw nowe hasło", lead: "Wpisz hasło, którym będziesz się logować od teraz." },
  welcome: {
    title: "Witaj w Postoju",
    lead: "Szef floty założył Ci konto. Ustaw hasło, a zobaczysz swój grafik i rozliczenia.",
  },
};

/** Błąd przekazany w adresie po kliknięciu nieważnego lub wygasłego linku z e-maila. */
function readUrlError() {
  const q = new URLSearchParams(window.location.search);
  const msg = q.get("error_description") ?? linkError;
  if (!msg) return null;
  if (q.get("error_description")) window.history.replaceState(null, "", window.location.pathname + window.location.hash);
  return msg.toLowerCase().includes("expired")
    ? "Link wygasł albo został już użyty. Poproś o nowy."
    : "Link z wiadomości jest nieprawidłowy. Spróbuj jeszcze raz.";
}

export function Login({ initial = "sign-in" }: { initial?: View }) {
  const [view, setView] = useState<View>(initial);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const e = readUrlError();
    if (e) setError(e);
  }, []);

  useEffect(() => setView(initial), [initial]);

  /* Ustawianie hasła: po zaproszeniu albo z linku do zmiany hasła. */
  const settingPassword = view === "new-password" || view === "welcome";

  const go = (v: View) => {
    setView(v);
    setError(null);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const mail = email.trim();
    if (!settingPassword && !/^\S+@\S+\.\S+$/.test(mail)) {
      setError("Wpisz poprawny adres e-mail.");
      return;
    }
    if ((view === "sign-up" || settingPassword) && password.length < 8) {
      setError("Hasło musi mieć co najmniej 8 znaków.");
      return;
    }
    setBusy(true);
    try {
      if (view === "sign-in") await signIn(mail, password);
      if (view === "sign-up") {
        const needsConfirm = await signUp(mail, password);
        if (needsConfirm) go("confirm");
      }
      if (view === "reset") {
        await sendReset(mail);
        go("sent");
      }
      if (settingPassword) {
        await setNewPassword(password);
        toast.ok("Hasło zmienione.");
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const { title, lead } = TITLES[view];
  const formView = view === "sign-in" || view === "sign-up" || view === "reset" || settingPassword;

  return (
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Showcase />

      <main className="flex min-h-dvh flex-col px-5 py-6 sm:px-8 lg:min-h-0 lg:py-10">
        <div className="flex items-center gap-2.5 lg:hidden">
          <Mark size={28} />
          <span className="text-[1.0625rem] font-semibold tracking-[-0.01em] text-ink">Postój</span>
        </div>

        <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center py-10">
          <div key={view} className="enter">
            {view === "reset" ? (
              <button
                type="button"
                onClick={() => go("sign-in")}
                className="press mb-5 -ml-2 inline-flex h-9 items-center gap-1.5 rounded-control px-2 text-[0.875rem] font-medium text-ink-2 hover:bg-sunken hover:text-ink"
              >
                <ArrowLeft size={15} />
                Logowanie
              </button>
            ) : null}

            <h1 className="text-[1.625rem] leading-tight font-semibold tracking-[-0.02em] text-ink">{title}</h1>
            {lead ? <p className="mt-1.5 text-[0.9375rem] text-ink-2">{lead}</p> : null}

            {view === "sent" || view === "confirm" ? (
              <Notice
                email={email.trim()}
                onBack={() => go("sign-in")}
                text={
                  view === "sent"
                    ? "Jeśli konto z tym adresem istnieje, wysłaliśmy na nie link do zmiany hasła."
                    : "Wysłaliśmy link aktywacyjny. Kliknij go w tej przeglądarce, a zalogujemy Cię od razu."
                }
              />
            ) : null}

            {formView ? (
              <form onSubmit={submit} noValidate className="mt-7 flex flex-col gap-4">
                {!settingPassword ? (
                  <Field label="E-mail">
                    <TextInput
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="ty@firma.pl"
                      autoFocus
                      required
                    />
                  </Field>
                ) : null}

                {view !== "reset" ? (
                  <Field
                    label={settingPassword ? (view === "welcome" ? "Twoje hasło" : "Nowe hasło") : "Hasło"}
                    hint={view === "sign-up" || settingPassword ? "Co najmniej 8 znaków." : undefined}
                  >
                    <span className="relative block">
                      <TextInput
                        type={show ? "text" : "password"}
                        autoComplete={view === "sign-in" ? "current-password" : "new-password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pr-11"
                        autoFocus={settingPassword}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShow((v) => !v)}
                        aria-label={show ? "Ukryj hasło" : "Pokaż hasło"}
                        aria-pressed={show}
                        className="press absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-control text-ink-3 hover:text-ink"
                      >
                        {show ? <EyeSlash size={18} /> : <Eye size={18} />}
                      </button>
                    </span>
                  </Field>
                ) : null}

                {view === "sign-in" ? (
                  <button
                    type="button"
                    onClick={() => go("reset")}
                    className="-mt-1 self-start text-[0.8125rem] font-medium text-green-ink underline-offset-4 hover:underline"
                  >
                    Nie pamiętasz hasła?
                  </button>
                ) : null}

                {error ? (
                  <p role="alert" className="shake rounded-control bg-red-soft px-3 py-2.5 text-[0.8125rem] leading-snug text-red">
                    {error}
                  </p>
                ) : null}

                <Button type="submit" variant="primary" disabled={busy} className="mt-1 w-full">
                  {busy ? <Spinner /> : null}
                  {view === "sign-in"
                    ? "Zaloguj się"
                    : view === "sign-up"
                      ? "Załóż konto"
                      : view === "reset"
                        ? "Wyślij link"
                        : view === "welcome"
                          ? "Ustaw hasło i wejdź"
                          : "Zapisz hasło"}
                </Button>
              </form>
            ) : null}

            {view === "sign-in" || view === "sign-up" ? (
              <>
                <p className="mt-6 text-[0.8125rem] leading-snug text-ink-2">
                  Konta kierowców zakłada szef floty. Jeśli masz dostać dostęp, poszukaj w skrzynce e-maila z
                  zaproszeniem i kliknij link, żeby ustawić hasło.
                </p>

                <div className="mt-8 border-t border-line pt-5">
                  <button
                    type="button"
                    onClick={continueAsGuest}
                    className="press -mx-2 flex w-[calc(100%+1rem)] flex-col items-start rounded-control px-2 py-2 text-left hover:bg-sunken"
                  >
                    <span className="text-[0.875rem] font-medium text-ink">Obejrzyj bez konta</span>
                    <span className="text-[0.8125rem] leading-snug text-ink-3">
                      Na danych przykładowych. Zmiany zostają tylko w tej przeglądarce.
                    </span>
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}

function Notice({ email, text, onBack }: { email: string; text: string; onBack: () => void }) {
  return (
    <div className="mt-6">
      <div className="flex items-start gap-3 rounded-panel border border-line bg-surface p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-green-soft text-green-ink">
          <EnvelopeSimple size={18} />
        </span>
        <div className="min-w-0 text-[0.875rem] leading-snug">
          {email ? <div className="truncate font-medium text-ink">{email}</div> : null}
          <p className="mt-0.5 text-ink-2">{text}</p>
        </div>
      </div>
      <Button className="mt-5" onClick={onBack}>
        <ArrowLeft size={15} />
        Wróć do logowania
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------
   Lewa kolumna na komputerze: co robi aplikacja, pokazane na
   przykładowym rachunku tygodnia, a nie na ilustracji.
   ------------------------------------------------------------------ */

const SAMPLE = [
  { label: "Przychód spółki", value: "25 994 zł", w: 100, in: true },
  { label: "Kierowcy", value: "−14 540 zł", w: 56 },
  { label: "Paliwo", value: "−2 355 zł", w: 9 },
  { label: "Auta", value: "−4 504 zł", w: 17 },
  { label: "Spółka", value: "−4 112 zł", w: 16 },
];

function Showcase() {
  return (
    <aside className="relative hidden overflow-hidden bg-green-deep text-on-deep lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-14">
      <div className="flex items-center gap-2.5">
        <Mark size={30} />
        <span className="text-[1.125rem] font-semibold tracking-[-0.01em]">Postój</span>
      </div>

      <div className="max-w-[440px]">
        <p className="text-[1.75rem] leading-[1.2] font-semibold tracking-[-0.02em] text-balance">
          Wiesz, ile zarobiło każde auto, zanim zapytasz księgową.
        </p>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-on-deep-2">
          Tygodniowe rozliczenia kierowców na procent i na wynajem, koszty floty i próg rentowności w jednym
          miejscu.
        </p>

        <div className="mt-9 rounded-panel border border-green-deep-2 bg-[oklch(0.29_0.052_162)] p-5">
          <div className="flex items-baseline justify-between text-[0.8125rem] text-on-deep-2">
            <span className="font-medium text-on-deep">Rachunek tygodnia</span>
            <span>przykład</span>
          </div>
          <ul className="mt-3 flex flex-col">
            {SAMPLE.map((r, i) => (
              <Ledger key={r.label} {...r} i={i} />
            ))}
          </ul>
          <div className="mt-3 flex items-baseline justify-between border-t border-green-deep-2 pt-3">
            <span className="text-[0.875rem] font-medium">Wynik tygodnia</span>
            <span className="num text-[1.375rem] font-semibold tracking-[-0.02em] text-[oklch(0.84_0.12_156)]">
              483 zł
            </span>
          </div>
        </div>
      </div>

      <p className="text-[0.75rem] text-on-deep-2">Kwoty netto. Dane w przykładzie są zmyślone.</p>
    </aside>
  );
}

function Ledger({ label, value, w, in: income, i }: { label: string; value: string; w: number; in?: boolean; i: number }) {
  return (
    <li className="stagger-item py-1.5" style={{ "--i": i + 2 } as CSSProperties}>
      <div className="flex items-baseline justify-between text-[0.8125rem]">
        <span className="text-on-deep-2">{label}</span>
        <span className="num font-medium">{value}</span>
      </div>
      <div className="mt-1 h-1 rounded-full bg-green-deep-2">
        <div
          className={cn("bar-grow h-full w-full rounded-full", income ? "bg-[oklch(0.72_0.12_156)]" : "bg-on-deep-2/60")}
          style={{ transform: `scaleX(${w / 100})`, "--i": i + 2 } as CSSProperties}
        />
      </div>
    </li>
  );
}

export function Splash({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg">
      <span className="splash-mark">
        <Mark size={40} />
      </span>
      {children}
    </div>
  );
}

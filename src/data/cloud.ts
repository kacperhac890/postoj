import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Scenario } from "../domain/engine";
import type { FleetData } from "../domain/seed";
import type { Entry, Params, Vehicle } from "../domain/types";
import type { Assignment, Driver, Duty } from "../domain/types";
import {
  assignmentToRow,
  driverToRow,
  entryToRow,
  rowToAssignment,
  rowToDriver,
  rowToEntry,
  rowToVehicle,
  vehicleToRow,
} from "./rows";
import type { Row } from "./rows";
import { parseAuthHash } from "./link";
export type { LinkSession } from "./link";

/* Połączenie z bazą (Supabase). Adres i klucz publiczny przychodzą
   z build-time env. Bez nich aplikacja działa jak dotąd: lokalnie,
   bez kont, z danymi w przeglądarce. Klucz "anon" jest jawny z założenia,
   dostęp do wierszy pilnują zasady RLS z supabase/schema.sql. */

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export const cloudConfigured = Boolean(url && key);

/* Link z zaproszenia (i z innych e-maili wysłanych przez serwer) wraca z sesją
   w części adresu po "#": #access_token=...&type=invite. Klient w trybie PKCE
   takiego adresu nie przyjmuje, a HashRouter wziąłby go za ścieżkę. Dlatego
   odczytujemy go tutaj, zanim powstanie klient, i od razu czyścimy adres. */
const fromLink = typeof window !== "undefined" ? parseAuthHash(window.location.hash) : { session: null, error: null };
if (fromLink.session || fromLink.error)
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#/`);

/** Sesja przyniesiona w linku z e-maila (zaproszenie), do przejęcia po starcie. */
export const linkSession = fromLink.session;
/** Błąd przyniesiony w linku, np. wygasłe zaproszenie. */
export const linkError = fromLink.error;

export const supabase: SupabaseClient | null = cloudConfigured
  ? createClient(url!, key!, {
      auth: {
        /* PKCE oddaje kod w ?code=, a nie w #, więc nie gryzie się
           z adresami HashRouter. */
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "postoj-auth",
      },
    })
  : null;

const T = {
  vehicles: "postoj_vehicles",
  drivers: "postoj_drivers",
  entries: "postoj_entries",
  settings: "postoj_settings",
  schedule: "postoj_schedule",
  /* Widoki dla kierowców: auta bez kosztów i same imiona kolegów. */
  fleetCars: "postoj_fleet_cars",
  crew: "postoj_crew",
} as const;

/** Rola konta według bazy (lista właścicieli flot i karty kierowców). */
export type DbRole = "operator" | "admin" | "driver" | "unlinked";

export async function fetchRole(): Promise<DbRole> {
  const { data, error } = await db().rpc("postoj_my_role");
  if (error) {
    if (/postoj_my_role|could not find the function/i.test(error.message))
      throw new Error("Baza wymaga aktualizacji. Uruchom ponownie plik supabase/schema.sql w Supabase (SQL Editor).");
    throw error;
  }
  return (["operator", "admin", "driver"].includes(data as string) ? data : "unlinked") as DbRole;
}

export type InviteTarget = "driver" | "owner";
export type InviteResult = { status: "invited" | "exists" | "link"; link?: string };

/** Zaproszenie przez funkcję Edge invite-driver: e-mail albo link do wysłania samemu. */
async function invite(email: string, delivery: "email" | "link", target: InviteTarget): Promise<InviteResult> {
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { data, error } = await db().functions.invoke("invite-driver", {
    body: { email, redirectTo, delivery, target },
  });
  if (error) {
    /* Treść błędu z funkcji jest w odpowiedzi; bez niej funkcja nie jest wdrożona. */
    const ctx = (error as { context?: Response }).context;
    let message = "";
    try {
      message = ctx ? ((await ctx.json()) as { error?: string }).error ?? "" : "";
    } catch {
      /* odpowiedź bez JSON */
    }
    if (!message && /failed to send|fetch|not found|404/i.test(error.message))
      message = "Funkcja zaproszeń nie jest wdrożona w Supabase (invite-driver).";
    throw new Error(message || error.message);
  }
  return data as InviteResult;
}

export interface CloudSnapshot extends FleetData {
  params: Partial<Params> | null;
  scenario: Partial<Scenario> | null;
  demo: boolean;
}

function db() {
  if (!supabase) throw new Error("Baza danych nie jest skonfigurowana.");
  return supabase;
}

/** Komunikat błędu po polsku, bez technicznego żargonu tam, gdzie się da. */
export function describeError(err: unknown): string {
  const raw =
    err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err);
  const m = raw.toLowerCase();
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("load failed"))
    return "Brak połączenia z bazą. Sprawdź internet i spróbuj jeszcze raz.";
  if (m.includes("invalid login credentials")) return "Nieprawidłowy e-mail albo hasło.";
  if (m.includes("email not confirmed")) return "Najpierw potwierdź adres e-mail linkiem z wiadomości.";
  if (m.includes("user already registered")) return "Konto z tym adresem już istnieje. Zaloguj się.";
  if (m.includes("password should be at least") || m.includes("weak"))
    return "Hasło jest za słabe. Użyj co najmniej 8 znaków.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Za dużo prób w krótkim czasie. Odczekaj chwilę.";
  if ((m.includes("column") && (m.includes("does not exist") || m.includes("could not find"))) || m.includes("schema cache"))
    return "Baza wymaga aktualizacji. Uruchom ponownie plik supabase/schema.sql w Supabase (SQL Editor).";
  if (m.includes("relation") && m.includes("does not exist"))
    return "W bazie brakuje tabel. Uruchom plik supabase/schema.sql w Supabase.";
  if (m.includes("jwt") || m.includes("not authenticated"))
    return "Sesja wygasła. Zaloguj się ponownie.";
  if (m.includes("postoj_drivers_email_global"))
    return "Ten adres e-mail ma już kierowca w innej flocie. Kierowca potrzebuje osobnego adresu.";
  if (m.includes("postoj_drivers_email")) return "Ten adres e-mail ma już inny kierowca.";
  if (m.includes("row-level security") || m.includes("permission denied"))
    return "Brak uprawnień do tej zmiany. Zaloguj się ponownie albo poproś szefa floty.";
  return raw || "Coś poszło nie tak.";
}

async function selectAll(table: string, order: string[] = ["created_at", "id"]): Promise<Row[]> {
  /* PostgREST oddaje domyślnie najwyżej 1000 wierszy, więc czytamy stronami.
     Rozliczeń przybywa co tydzień, po roku jest ich ponad tysiąc. */
  const size = 1000;
  const out: Row[] = [];
  for (let from = 0; ; from += size) {
    let q = db().from(table).select("*");
    for (const col of order) q = q.order(col, { ascending: true });
    const { data, error } = await q.range(from, from + size - 1);
    if (error) throw error;
    out.push(...(data as Row[]));
    if (!data || data.length < size) break;
  }
  return out;
}

export async function fetchSnapshot(): Promise<CloudSnapshot> {
  const [v, d, e, g, s] = await Promise.all([
    selectAll(T.vehicles),
    selectAll(T.drivers),
    selectAll(T.entries),
    selectAll(T.schedule, ["date", "vehicle_id", "duty"]),
    db().from(T.settings).select("params, scenario, demo").maybeSingle(),
  ]);
  if (s.error) throw s.error;
  const settings = s.data as { params: Partial<Params>; scenario: Partial<Scenario>; demo: boolean } | null;
  return {
    vehicles: v.map(rowToVehicle),
    drivers: d.map(rowToDriver),
    entries: e.map(rowToEntry),
    schedule: g.map(rowToAssignment),
    params: settings?.params ?? null,
    scenario: settings?.scenario ?? null,
    demo: settings?.demo ?? false,
  };
}

export interface DriverSnapshot extends FleetData {
  /** Karta zalogowanego kierowcy albo null, gdy konto nie jest przypisane. */
  me: Driver | null;
  /** Konto właściciela floty, do której należy kierowca. */
  fleetOwner: string | null;
  params: Partial<Params> | null;
}

/**
 * Dane widoczne dla kierowcy: jego karta i rozliczenia, auta bez kosztów,
 * imiona kolegów i grafik floty. Resztę odcina baza (RLS), nie aplikacja.
 */
export async function fetchDriverSnapshot(): Promise<DriverSnapshot> {
  const mine = await selectAll(T.drivers);
  if (mine.length === 0)
    return { me: null, fleetOwner: null, vehicles: [], drivers: [], entries: [], schedule: [], params: null };
  const me = rowToDriver(mine[0]);
  const fleetOwner = String(mine[0].owner ?? "") || null;

  const [cars, crew, entries, schedule, params] = await Promise.all([
    selectAll(T.fleetCars),
    selectAll(T.crew),
    selectAll(T.entries),
    selectAll(T.schedule, ["date", "vehicle_id", "duty"]),
    db().rpc("postoj_fleet_params"),
  ]);
  if (params.error) throw params.error;

  const vehicles = cars.map((r) => rowToVehicle({ ...r, lease_net: 0, insurance: 0, service_gross: 0 }));
  const drivers = crew.map((r) =>
    r.id === me.id
      ? me
      : rowToDriver({ ...r, phone: "", email: "", student: false, shift: "flex", is_owner: false }),
  );
  return {
    me,
    fleetOwner,
    vehicles,
    drivers,
    entries: entries.map(rowToEntry).filter((x) => x.driverId === me.id),
    schedule: schedule.map(rowToAssignment),
    params: (params.data as Partial<Params> | null) ?? null,
  };
}

/* ------------------------------------------------------------------
   Zapisy. Wszystkie idą jedną kolejką, w kolejności kliknięć: kierowca
   z nowym autem nie może trafić do bazy przed tym autem.
   ------------------------------------------------------------------ */

type Listener = (state: { pending: number; error: string | null }) => void;

let chain: Promise<unknown> = Promise.resolve();
let pending = 0;
let lastError: string | null = null;
const listeners = new Set<Listener>();

const emit = () => listeners.forEach((l) => l({ pending, error: lastError }));

export function onQueueChange(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export const queueIdle = () => pending === 0;

/** Czeka, aż wszystkie zaplanowane zapisy dotrą do bazy. */
export const flushQueue = () => chain.then(() => undefined);

export function enqueue(op: () => PromiseLike<{ error: unknown }> | Promise<void>, onError?: (msg: string) => void) {
  pending += 1;
  emit();
  chain = chain
    .then(async () => {
      const res = await op();
      if (res && typeof res === "object" && "error" in res && res.error) throw res.error;
      lastError = null;
    })
    .catch((err) => {
      lastError = describeError(err);
      onError?.(lastError);
    })
    .finally(() => {
      pending -= 1;
      emit();
    });
  return chain;
}

const uid = async () => {
  const { data } = await db().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("not authenticated");
  return id;
};

const withOwner = async (rows: Row[]) => {
  const owner = await uid();
  return rows.map((r) => ({ ...r, owner }));
};

export const api = {
  async upsertVehicle(v: Vehicle) {
    return db().from(T.vehicles).upsert(await withOwner([vehicleToRow(v)]), { onConflict: "owner,id" });
  },
  async deleteVehicle(id: string) {
    /* Kierowców odpina klucz obcy (on delete set null). */
    return db().from(T.vehicles).delete().eq("id", id);
  },
  async upsertDriver(d: Driver) {
    return db().from(T.drivers).upsert(await withOwner([driverToRow(d)]), { onConflict: "owner,id" });
  },
  async deleteDriver(id: string) {
    /* Rozliczenia kierowcy usuwa klucz obcy (on delete cascade). */
    return db().from(T.drivers).delete().eq("id", id);
  },
  async upsertEntry(e: Entry) {
    return db().from(T.entries).upsert(await withOwner([entryToRow(e)]), { onConflict: "owner,id" });
  },
  async deleteEntry(id: string) {
    return db().from(T.entries).delete().eq("id", id);
  },
  async setPaid(ids: string[], paid: boolean) {
    return db().from(T.entries).update({ paid }).in("id", ids);
  },
  /** Jedno pole grafiku: kierowca albo puste (usunięcie wiersza). */
  async setSlot(date: string, vehicleId: string, duty: Duty, driverId: string | null) {
    if (driverId === null)
      return db().from(T.schedule).delete().eq("date", date).eq("vehicle_id", vehicleId).eq("duty", duty);
    const row = { ...assignmentToRow({ date, vehicleId, duty, driverId }), owner: await uid() };
    return db().from(T.schedule).upsert(row, { onConflict: "owner,date,vehicle_id,duty" });
  },
  /** Cały tydzień grafiku naraz: czyści daty tygodnia i wstawia nowe wpisy. */
  async replaceWeek(dates: string[], list: Assignment[]) {
    const owner = await uid();
    const del = await db().from(T.schedule).delete().eq("owner", owner).in("date", dates);
    if (del.error) return del;
    if (list.length === 0) return del;
    return db()
      .from(T.schedule)
      .insert(list.map((a) => ({ ...assignmentToRow(a), owner })));
  },
  /** Zaproszenie kierowcy: e-mail albo link do wysłania samemu (Edge Function). */
  inviteDriver(email: string, delivery: "email" | "link" = "email") {
    return invite(email, delivery, "driver");
  },
  /** Zaproszenie właściciela floty. Tylko operator aplikacji. */
  inviteOwner(email: string, delivery: "email" | "link" = "email") {
    return invite(email, delivery, "owner");
  },
  /** Właściciele flot ze stanem kont. Tylko operator. */
  async ownerAccounts() {
    const { data, error } = await db().rpc("postoj_owner_accounts");
    if (error) throw error;
    return (data ?? []) as Array<{
      email: string;
      operator: boolean;
      created_at: string;
      invited_at: string | null;
      confirmed_at: string | null;
      last_sign_in_at: string | null;
    }>;
  },
  async removeOwner(email: string) {
    const { error } = await db().rpc("postoj_remove_owner", { p_email: email });
    if (error) throw error;
  },
  /** Stan kont kierowców: zaproszony, potwierdzony, ostatnie logowanie. */
  async driverAccounts() {
    const { data, error } = await db().rpc("postoj_driver_accounts");
    if (error) throw error;
    return (data ?? []) as Array<{
      email: string;
      invited_at: string | null;
      confirmed_at: string | null;
      last_sign_in_at: string | null;
    }>;
  },
  async saveSettings(params: Params, scenario: Scenario, demo: boolean) {
    const owner = await uid();
    return db().from(T.settings).upsert({ owner, params, scenario, demo }, { onConflict: "owner" });
  },

  /** Zastępuje wszystkie dane konta: import kopii, dane przykładowe, czyszczenie. */
  async replaceAll(data: FleetData, params: Params, scenario: Scenario, demo: boolean) {
    const owner = await uid();
    const c = db();
    for (const table of [T.schedule, T.entries, T.drivers, T.vehicles]) {
      const { error } = await c.from(table).delete().eq("owner", owner);
      if (error) throw error;
    }
    const chunks = <X,>(list: X[], size = 500) =>
      Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
    const insert = async (table: string, rows: Row[]) => {
      for (const part of chunks(rows)) {
        const { error } = await c.from(table).insert(part.map((r) => ({ ...r, owner })));
        if (error) throw error;
      }
    };
    /* Kopia z pliku może być niespójna (np. kierowca przy usuniętym aucie).
       Baza pilnuje kluczy obcych, więc porządkujemy dane przed zapisem. */
    const carIds = new Set(data.vehicles.map((v) => v.id));
    const driverIds = new Set(data.drivers.map((d) => d.id));
    await insert(T.vehicles, data.vehicles.map(vehicleToRow));
    await insert(T.drivers, data.drivers.map(driverToRow));
    await insert(T.entries, data.entries.filter((e) => driverIds.has(e.driverId)).map(entryToRow));
    await insert(
      T.schedule,
      data.schedule.filter((a) => carIds.has(a.vehicleId) && driverIds.has(a.driverId)).map(assignmentToRow),
    );
    const { error } = await c.from(T.settings).upsert({ owner, params, scenario, demo }, { onConflict: "owner" });
    if (error) throw error;
  },
};

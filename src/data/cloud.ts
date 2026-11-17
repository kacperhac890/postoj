import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Scenario } from "../domain/engine";
import type { FleetData } from "../domain/seed";
import type { Driver, Entry, Params, Vehicle } from "../domain/types";
import {
  driverToRow,
  entryToRow,
  rowToDriver,
  rowToEntry,
  rowToVehicle,
  vehicleToRow,
} from "./rows";
import type { Row } from "./rows";

/* Połączenie z bazą (Supabase). Adres i klucz publiczny przychodzą
   z build-time env. Bez nich aplikacja działa jak dotąd: lokalnie,
   bez kont, z danymi w przeglądarce. Klucz "anon" jest jawny z założenia,
   dostęp do wierszy pilnują zasady RLS z supabase/schema.sql. */

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export const cloudConfigured = Boolean(url && key);

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
} as const;

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
  if (m.includes("relation") && m.includes("does not exist"))
    return "W bazie brakuje tabel. Uruchom plik supabase/schema.sql w Supabase.";
  if (m.includes("jwt") || m.includes("not authenticated"))
    return "Sesja wygasła. Zaloguj się ponownie.";
  return raw || "Coś poszło nie tak.";
}

async function selectAll(table: string): Promise<Row[]> {
  /* PostgREST oddaje domyślnie najwyżej 1000 wierszy, więc czytamy stronami.
     Rozliczeń przybywa co tydzień, po roku jest ich ponad tysiąc. */
  const size = 1000;
  const out: Row[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await db()
      .from(table)
      .select("*")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + size - 1);
    if (error) throw error;
    out.push(...(data as Row[]));
    if (!data || data.length < size) break;
  }
  return out;
}

export async function fetchSnapshot(): Promise<CloudSnapshot> {
  const [v, d, e, s] = await Promise.all([
    selectAll(T.vehicles),
    selectAll(T.drivers),
    selectAll(T.entries),
    db().from(T.settings).select("params, scenario, demo").maybeSingle(),
  ]);
  if (s.error) throw s.error;
  const settings = s.data as { params: Partial<Params>; scenario: Partial<Scenario>; demo: boolean } | null;
  return {
    vehicles: v.map(rowToVehicle),
    drivers: d.map(rowToDriver),
    entries: e.map(rowToEntry),
    params: settings?.params ?? null,
    scenario: settings?.scenario ?? null,
    demo: settings?.demo ?? false,
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
  async saveSettings(params: Params, scenario: Scenario, demo: boolean) {
    const owner = await uid();
    return db().from(T.settings).upsert({ owner, params, scenario, demo }, { onConflict: "owner" });
  },

  /** Zastępuje wszystkie dane konta: import kopii, dane przykładowe, czyszczenie. */
  async replaceAll(data: FleetData, params: Params, scenario: Scenario, demo: boolean) {
    const owner = await uid();
    const c = db();
    for (const table of [T.entries, T.drivers, T.vehicles]) {
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
    const drivers = data.drivers.map((d) => (d.vehicleId && !carIds.has(d.vehicleId) ? { ...d, vehicleId: null } : d));
    const driverIds = new Set(drivers.map((d) => d.id));
    await insert(T.vehicles, data.vehicles.map(vehicleToRow));
    await insert(T.drivers, drivers.map(driverToRow));
    await insert(T.entries, data.entries.filter((e) => driverIds.has(e.driverId)).map(entryToRow));
    const { error } = await c.from(T.settings).upsert({ owner, params, scenario, demo }, { onConflict: "owner" });
    if (error) throw error;
  },
};

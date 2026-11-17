// Postój: zaproszenie kierowcy do aplikacji.
//
// Wywołuje ją administrator floty z karty kierowcy. Funkcja sprawdza, że
// wołający jest administratorem (postoj_is_admin w bazie) i że adres jest
// wpisany w karcie kierowcy jego floty. Potem:
//   delivery "email": Supabase wysyła kierowcy e-mail z linkiem,
//   delivery "link":  funkcja zwraca link, który admin wysyła sam (SMS, WhatsApp).
// Kierowca klika link, ustawia hasło i jest zalogowany.
//
// Klucz service_role istnieje tylko tutaj, na serwerze Supabase. Nigdy
// nie trafia do przeglądarki.
//
// Wdrożenie: Supabase -> Edge Functions -> Deploy a new function -> Via Editor,
// nazwa "invite-driver", wklej ten plik, Deploy. W ustawieniach funkcji wyłącz
// "Verify JWT with legacy secret": funkcja sama sprawdza zalogowanego użytkownika.

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function serviceKey(): string | undefined {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  /* Projekty z nowymi kluczami API: SUPABASE_SECRET_KEYS to JSON {"default": "sb_secret_..."}. */
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return keys.default ?? Object.values(keys)[0];
  } catch {
    return undefined;
  }
}

function publicKey(): string | undefined {
  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    return keys.default ?? Object.values(keys)[0];
  } catch {
    return undefined;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Tylko POST." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = publicKey();
  const service = serviceKey();
  if (!url || !anon || !service) return json({ error: "Funkcja nie ma dostępu do kluczy projektu." }, 500);

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Zaloguj się ponownie." }, 401);

  let email = "";
  let redirectTo = "";
  let delivery: "email" | "link" = "email";
  try {
    const body = await req.json();
    email = String(body.email ?? "").trim().toLowerCase();
    redirectTo = String(body.redirectTo ?? "");
    delivery = body.delivery === "link" ? "link" : "email";
  } catch {
    return json({ error: "Nieprawidłowe zapytanie." }, 400);
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Nieprawidłowy adres e-mail." }, 400);

  /* Wszystko, co sprawdza uprawnienia, idzie z tokenem wołającego: decyduje baza (RLS). */
  const caller = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: isAdmin, error: adminError } = await caller.rpc("postoj_is_admin");
  if (adminError) return json({ error: "Nie udało się sprawdzić uprawnień. Zaloguj się ponownie." }, 401);
  if (isAdmin !== true) return json({ error: "Tylko administrator floty może zapraszać kierowców." }, 403);

  const { data: driver, error: driverError } = await caller
    .from("postoj_drivers")
    .select("id, name")
    .eq("email", email)
    .maybeSingle();
  if (driverError) return json({ error: driverError.message }, 400);
  if (!driver) return json({ error: "Najpierw zapisz ten adres w karcie kierowcy." }, 400);

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const meta = { postoj_driver: driver.id, name: driver.name };

  if (delivery === "link") {
    /* Nowe konto: link zaproszenia. Konto już istnieje (np. zaproszenie bez
       odpowiedzi): link do ustawienia hasła. */
    const invite = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: redirectTo || undefined, data: meta },
    });
    if (!invite.error) return json({ status: "link", link: invite.data.properties.action_link, kind: "invite" });
    const recovery = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: redirectTo || undefined },
    });
    if (recovery.error) return json({ error: recovery.error.message }, 400);
    return json({ status: "link", link: recovery.data.properties.action_link, kind: "recovery" });
  }

  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: redirectTo || undefined,
    data: meta,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already") || msg.includes("exists") || msg.includes("registered"))
      return json({ status: "exists" });
    if (msg.includes("rate limit")) return json({ error: "Limit wysyłki e-maili. Spróbuj za godzinę." }, 429);
    return json({ error: error.message }, 400);
  }
  return json({ status: "invited" });
});

// Postój: zaproszenia do aplikacji.
//
// target "driver" (domyślnie): właściciel floty zaprasza kierowcę z karty
//   kierowcy. Adres musi być wpisany w karcie kierowcy jego floty.
// target "owner": operator aplikacji zaprasza nowego właściciela floty.
//   Adres trafia na listę właścicieli (postoj_add_owner), a po ustawieniu
//   hasła właściciel zakłada swoją flotę i zaprasza swoich kierowców.
//
// delivery "email": Supabase wysyła e-mail z linkiem,
// delivery "link":  funkcja zwraca link, który wysyłasz sam (SMS, WhatsApp).
// Zaproszony klika link, ustawia hasło i jest zalogowany.
//
// Uprawnienia sprawdza baza, z tokenem wołającego (postoj_is_admin,
// postoj_add_owner). Klucz service_role istnieje tylko tutaj, na serwerze
// Supabase, i nigdy nie trafia do przeglądarki.
//
// Wdrożenie: Supabase -> Edge Functions -> invite-driver -> Code, wklej ten plik,
// Deploy. Nowa funkcja: Deploy a new function -> Via Editor, nazwa "invite-driver".
// W ustawieniach funkcji wyłącz "Verify JWT with legacy secret": funkcja sama
// sprawdza zalogowanego użytkownika.

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function fromEnvKeys(legacyName: string, jsonName: string): string | undefined {
  const legacy = Deno.env.get(legacyName);
  if (legacy) return legacy;
  /* Projekty z nowymi kluczami API: JSON {"default": "sb_..."}. */
  try {
    const keys = JSON.parse(Deno.env.get(jsonName) ?? "{}");
    return keys.default ?? Object.values(keys)[0];
  } catch {
    return undefined;
  }
}

/* Link w zaproszeniu prowadzi tylko pod adres aplikacji. Supabase i tak
   sprawdza listę Redirect URLs, to druga zapora. */
function safeRedirect(raw: string): string | undefined {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") return undefined;
    return `${u.origin}${u.pathname}`;
  } catch {
    return undefined;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Tylko POST." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = fromEnvKeys("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS");
  const service = fromEnvKeys("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS");
  if (!url || !anon || !service) return json({ error: "Funkcja nie ma dostępu do kluczy projektu." }, 500);

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Zaloguj się ponownie." }, 401);

  let email = "";
  let redirectTo: string | undefined;
  let delivery: "email" | "link" = "email";
  let target: "driver" | "owner" = "driver";
  try {
    const body = await req.json();
    email = String(body.email ?? "").trim().toLowerCase();
    redirectTo = safeRedirect(String(body.redirectTo ?? ""));
    delivery = body.delivery === "link" ? "link" : "email";
    target = body.target === "owner" ? "owner" : "driver";
  } catch {
    return json({ error: "Nieprawidłowe zapytanie." }, 400);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254)
    return json({ error: "Nieprawidłowy adres e-mail." }, 400);

  /* Wszystko, co sprawdza uprawnienia, idzie z tokenem wołającego: decyduje baza (RLS). */
  const caller = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: who, error: whoError } = await caller.auth.getUser(authorization.slice(7));
  if (whoError || !who.user) return json({ error: "Sesja wygasła. Zaloguj się ponownie." }, 401);

  let meta: Record<string, string> = {};
  if (target === "owner") {
    const { error } = await caller.rpc("postoj_add_owner", { p_email: email });
    if (error) return json({ error: error.message }, error.code === "42501" ? 403 : 400);
    meta = { postoj_role: "owner" };
  } else {
    const { data: isAdmin, error: adminError } = await caller.rpc("postoj_is_admin");
    if (adminError) return json({ error: "Nie udało się sprawdzić uprawnień. Zaloguj się ponownie." }, 401);
    if (isAdmin !== true) return json({ error: "Tylko właściciel floty może zapraszać kierowców." }, 403);
    const { data: driver, error: driverError } = await caller
      .from("postoj_drivers")
      .select("id, name")
      .eq("owner", who.user.id)
      .eq("email", email)
      .maybeSingle();
    if (driverError) return json({ error: driverError.message }, 400);
    if (!driver) return json({ error: "Najpierw zapisz ten adres w karcie kierowcy." }, 400);
    meta = { postoj_driver: driver.id, name: driver.name };
  }

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  if (delivery === "link") {
    /* Nowe konto: link zaproszenia. Konto już istnieje (np. zaproszenie bez
       odpowiedzi): link do ustawienia hasła. */
    const invite = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo, data: meta },
    });
    if (!invite.error) return json({ status: "link", link: invite.data.properties.action_link, kind: "invite" });
    const recovery = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
    if (recovery.error) return json({ error: recovery.error.message }, 400);
    return json({ status: "link", link: recovery.data.properties.action_link, kind: "recovery" });
  }

  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: meta });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already") || msg.includes("exists") || msg.includes("registered"))
      return json({ status: "exists" });
    if (msg.includes("rate limit")) return json({ error: "Limit wysyłki e-maili. Spróbuj za godzinę." }, 429);
    return json({ error: error.message }, 400);
  }
  return json({ status: "invited" });
});

-- Postój: schemat bazy danych dla Supabase (Postgres).
--
-- Jak użyć: Supabase -> SQL Editor -> New query -> wklej cały plik -> Run.
-- Skrypt można uruchomić ponownie, nie usuwa danych.
--
-- Każdy wiersz należy do konta właściciela floty (kolumna owner).
-- Właściciele flot są w tabeli postoj_owners: każdy zarządza tylko swoją
-- flotą i zaprasza swoich kierowców. Operator aplikacji (operator = true)
-- dodatkowo zaprasza nowych właścicieli flot.
-- Kierowca loguje się na adres wpisany w jego karcie i tylko czyta:
-- flotę bez kosztów, grafik, imiona kolegów i własne rozliczenia,
-- a do tego zgłasza usterki aut i pisze w nich z szefem floty.
-- Klucz publiczny w przeglądarce nie daje dostępu do niczego więcej.
--
-- Tabele mają przedrostek postoj_, żeby nie zderzyły się z tabelami
-- innej aplikacji, jeśli używasz tego samego projektu Supabase.

-- ------------------------------------------------------------------
-- Auta
-- ------------------------------------------------------------------
create table if not exists public.postoj_vehicles (
  owner          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id             text not null,
  plate          text not null,
  model          text not null default '',
  year           integer not null,
  mode           text not null check (mode in ('commission', 'rental')),
  lease_net      numeric(12, 2) not null default 0,
  insurance      numeric(12, 2) not null default 0,
  service_gross  numeric(12, 2) not null default 0,
  status         text not null check (status in ('active', 'service', 'idle')),
  inspection_due text not null default '',
  insurance_due  text not null default '',
  prep           jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (owner, id)
);

-- ------------------------------------------------------------------
-- Kierowcy
-- ------------------------------------------------------------------
create table if not exists public.postoj_drivers (
  owner      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         text not null,
  name       text not null,
  phone      text not null default '',
  student    boolean not null default false,
  vehicle_id text,
  shift      text not null check (shift in ('day', 'night', 'flex')),
  active     boolean not null default true,
  -- Właściciel spółki za kierownicą: bez wypłaty, utarg w całości dla spółki.
  is_owner   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner, id),
  -- Usunięcie auta zostawia kierowcę, tylko bez przypisania.
  foreign key (owner, vehicle_id) references public.postoj_vehicles (owner, id)
    on delete set null (vehicle_id)
);

-- ------------------------------------------------------------------
-- Tygodniowe rozliczenia
-- ------------------------------------------------------------------
create table if not exists public.postoj_entries (
  owner      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         text not null,
  driver_id  text not null,
  week       text not null check (week ~ '^\d{4}-W\d{2}$'),
  -- Migawka warunków z chwili rozliczenia, bez klucza obcego do auta:
  -- usunięcie auta nie może zmieniać historii.
  mode       text not null check (mode in ('commission', 'rental')),
  student    boolean not null default false,
  is_owner   boolean not null default false,
  vehicle_id text,
  -- Realny koszt paliwa brutto za tydzień. NULL = szacunek z ustawień.
  fuel_gross numeric(12, 2) check (fuel_gross is null or fuel_gross >= 0),
  revenue    numeric(12, 2) not null default 0,
  hours      numeric(8, 2) not null default 0,
  trips      integer not null default 0,
  bonus      numeric(12, 2) not null default 0,
  deduction  numeric(12, 2) not null default 0,
  paid       boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner, id),
  foreign key (owner, driver_id) references public.postoj_drivers (owner, id) on delete cascade
);

-- Kolumny dodane po pierwszej wersji. Dla bazy założonej wcześniej
-- uruchomienie całego pliku jeszcze raz dopisze je bez utraty danych.
alter table public.postoj_drivers add column if not exists is_owner boolean not null default false;
alter table public.postoj_entries add column if not exists is_owner boolean not null default false;
alter table public.postoj_entries add column if not exists fuel_gross numeric(12, 2);

create index if not exists postoj_entries_week on public.postoj_entries (owner, week);
create index if not exists postoj_entries_driver on public.postoj_entries (owner, driver_id);
create index if not exists postoj_drivers_vehicle on public.postoj_drivers (owner, vehicle_id);

-- ------------------------------------------------------------------
-- Stawki, koszty i wariant kalkulatora: jeden wiersz na konto
-- ------------------------------------------------------------------
create table if not exists public.postoj_settings (
  owner      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  params     jsonb not null default '{}'::jsonb,
  scenario   jsonb not null default '{}'::jsonb,
  -- Czy na koncie są wczytane dane przykładowe.
  demo       boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Starsza wersja tabeli mogła nie mieć tej kolumny.
alter table public.postoj_settings add column if not exists demo boolean not null default false;

-- ------------------------------------------------------------------
-- Konto kierowcy i grafik
-- ------------------------------------------------------------------
-- Adres konta kierowcy. Po zalogowaniu na ten adres kierowca widzi swoje dane.
alter table public.postoj_drivers add column if not exists email text not null default '';
create unique index if not exists postoj_drivers_email
  on public.postoj_drivers (owner, lower(email)) where email <> '';
-- Jeden adres to jeden kierowca w całej aplikacji: obca flota nie może
-- dopisać sobie cudzego kierowcy i przejąć jego logowania.
create unique index if not exists postoj_drivers_email_global
  on public.postoj_drivers (lower(email)) where email <> '';

-- Grafik: dzień, auto, zmiana (dniówka albo nocka) i kierowca.
-- Nocka należy do dnia, w którym się zaczyna. Puste pole = brak wiersza.
create table if not exists public.postoj_schedule (
  owner      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date       date not null,
  vehicle_id text not null,
  duty       text not null check (duty in ('day', 'night')),
  driver_id  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner, date, vehicle_id, duty),
  foreign key (owner, vehicle_id) references public.postoj_vehicles (owner, id) on delete cascade,
  foreign key (owner, driver_id) references public.postoj_drivers (owner, id) on delete cascade
);
create index if not exists postoj_schedule_driver on public.postoj_schedule (owner, driver_id, date);

-- ------------------------------------------------------------------
-- Znacznik czasu zmiany
-- ------------------------------------------------------------------
create or replace function public.postoj_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['postoj_vehicles', 'postoj_drivers', 'postoj_entries', 'postoj_settings', 'postoj_schedule'] loop
    execute format('drop trigger if exists touch on public.%I', t);
    execute format(
      'create trigger touch before update on public.%I for each row execute function public.postoj_touch()',
      t
    );
  end loop;
end;
$$;

-- ------------------------------------------------------------------
-- Role
-- ------------------------------------------------------------------
-- Potwierdzony adres e-mail zalogowanego konta (małe litery) albo NULL.
-- Liczy się tylko potwierdzony adres: nikt nie podszyje się pod admina
-- ani kierowcę, zakładając konto na cudzy e-mail.
create or replace function public.postoj_confirmed_email()
returns text
language sql stable security definer
set search_path = ''
as $$
  select lower(u.email) from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null
$$;

-- Właściciele flot. Wiersze czytają i zmieniają tylko funkcje niżej,
-- tabela jest zamknięta dla zapytań z przeglądarki.
create table if not exists public.postoj_owners (
  email      text primary key check (email <> '' and email = lower(email)),
  operator   boolean not null default false,
  added_by   uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.postoj_owners enable row level security;
revoke all on public.postoj_owners from anon, authenticated;

-- Przejście ze starszej wersji, w której administrator był wpisany na stałe:
-- operatorem zostaje konto, które ma już dane floty. Na pustej bazie dopisz
-- siebie ręcznie (README, sekcja "Właściciele flot").
insert into public.postoj_owners (email, operator)
select lower(u.email), true
from auth.users u
where u.email is not null
  and u.email_confirmed_at is not null
  and u.id in (select owner from public.postoj_settings
               union select owner from public.postoj_vehicles
               union select owner from public.postoj_drivers)
  and not exists (select 1 from public.postoj_owners o where o.operator)
order by u.created_at
limit 1
on conflict (email) do nothing;

-- Właściciel floty: potwierdzony adres jest na liście właścicieli.
create or replace function public.postoj_is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.postoj_owners o
    where o.email = public.postoj_confirmed_email()
  )
$$;

-- Operator aplikacji: zaprasza właścicieli flot.
create or replace function public.postoj_is_operator()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.postoj_owners o
    where o.email = public.postoj_confirmed_email() and o.operator
  )
$$;

-- Karty kierowców przypisane do zalogowanego konta (po adresie e-mail).
create or replace function public.postoj_my_driver()
returns table (owner uuid, id text)
language sql stable security definer
set search_path = ''
as $$
  select d.owner, d.id from public.postoj_drivers d
  where d.email <> '' and lower(d.email) = public.postoj_confirmed_email()
$$;

-- Stawki potrzebne kierowcy do odczytania własnego rozliczenia,
-- bez kosztów spółki (zarząd, administracja, CIT, paliwo, plan).
create or replace function public.postoj_fleet_params()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select s.params - array['boardGross', 'admin', 'cit', 'lpgPerShiftGross', 'lpgShiftHours',
                          'weeksPerMonth', 'targetHoursPerCar']
  from public.postoj_settings s
  where s.owner in (select m.owner from public.postoj_my_driver() m)
  limit 1
$$;

-- Stan kont kierowców dla administratora: zaproszony, aktywny, ostatnie logowanie.
-- Zwraca tylko adresy wpisane w kartach kierowców jego floty.
create or replace function public.postoj_driver_accounts()
returns table (email text, invited_at timestamptz, confirmed_at timestamptz, last_sign_in_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select lower(u.email), u.invited_at, u.email_confirmed_at, u.last_sign_in_at
  from auth.users u
  where public.postoj_is_admin()
    and lower(u.email) in (
      select lower(d.email) from public.postoj_drivers d
      where d.owner = auth.uid() and d.email <> ''
    )
$$;

revoke execute on function public.postoj_driver_accounts() from public, anon;
grant execute on function public.postoj_driver_accounts() to authenticated;

-- Rola zalogowanego konta: operator, admin (właściciel floty), driver albo unlinked.
create or replace function public.postoj_my_role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select case
    when public.postoj_is_operator() then 'operator'
    when public.postoj_is_admin() then 'admin'
    when exists (select 1 from public.postoj_my_driver()) then 'driver'
    else 'unlinked'
  end
$$;

-- Lista właścicieli flot ze stanem kont. Tylko dla operatora.
create or replace function public.postoj_owner_accounts()
returns table (email text, operator boolean, created_at timestamptz, invited_at timestamptz,
               confirmed_at timestamptz, last_sign_in_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select o.email, o.operator, o.created_at, u.invited_at, u.email_confirmed_at, u.last_sign_in_at
  from public.postoj_owners o
  left join auth.users u on lower(u.email) = o.email
  where public.postoj_is_operator()
  order by o.operator desc, o.created_at
$$;

-- Dodanie właściciela floty (przed wysłaniem zaproszenia). Tylko operator.
create or replace function public.postoj_add_owner(p_email text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare e text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.postoj_is_operator() then
    raise exception 'Tylko operator aplikacji dodaje właścicieli flot.' using errcode = '42501';
  end if;
  if e !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'Nieprawidłowy adres e-mail.' using errcode = '22023';
  end if;
  if exists (select 1 from public.postoj_drivers d where d.email <> '' and lower(d.email) = e) then
    raise exception 'Ten adres należy do kierowcy. Właściciel floty potrzebuje osobnego adresu.' using errcode = '23505';
  end if;
  insert into public.postoj_owners (email, added_by) values (e, auth.uid())
  on conflict (email) do nothing;
end;
$$;

-- Odebranie roli właściciela. Dane floty zostają w bazie, ale z tego konta
-- nikt ich nie zobaczy ani nie zmieni, dopóki operator nie doda go ponownie.
create or replace function public.postoj_remove_owner(p_email text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.postoj_is_operator() then
    raise exception 'Tylko operator aplikacji usuwa właścicieli flot.' using errcode = '42501';
  end if;
  delete from public.postoj_owners o where o.email = lower(btrim(p_email)) and not o.operator;
end;
$$;

revoke execute on function public.postoj_is_operator() from public, anon;
revoke execute on function public.postoj_my_role() from public, anon;
revoke execute on function public.postoj_owner_accounts() from public, anon;
revoke execute on function public.postoj_add_owner(text) from public, anon;
revoke execute on function public.postoj_remove_owner(text) from public, anon;
grant execute on function public.postoj_is_operator() to authenticated;
grant execute on function public.postoj_my_role() to authenticated;
grant execute on function public.postoj_owner_accounts() to authenticated;
grant execute on function public.postoj_add_owner(text) to authenticated;
grant execute on function public.postoj_remove_owner(text) to authenticated;

revoke execute on function public.postoj_confirmed_email() from public, anon;
revoke execute on function public.postoj_is_admin() from public, anon;
revoke execute on function public.postoj_my_driver() from public, anon;
revoke execute on function public.postoj_fleet_params() from public, anon;
grant execute on function public.postoj_confirmed_email() to authenticated;
grant execute on function public.postoj_is_admin() to authenticated;
grant execute on function public.postoj_my_driver() to authenticated;
grant execute on function public.postoj_fleet_params() to authenticated;

-- ------------------------------------------------------------------
-- Widoki dla kierowców: flota bez kosztów i same imiona kolegów.
-- Działają z prawami właściciela widoku (omijają RLS), dlatego każdy
-- filtruje wiersze do floty, do której należy zalogowany kierowca.
-- ------------------------------------------------------------------
create or replace view public.postoj_fleet_cars as
  select v.owner, v.id, v.plate, v.model, v.year, v.mode, v.status,
         v.inspection_due, v.insurance_due, v.prep, v.created_at
  from public.postoj_vehicles v
  where v.owner in (select m.owner from public.postoj_my_driver() m);

create or replace view public.postoj_crew as
  select d.owner, d.id, d.name, d.active, d.created_at
  from public.postoj_drivers d
  where d.owner in (select m.owner from public.postoj_my_driver() m);

revoke all on public.postoj_fleet_cars from anon;
revoke all on public.postoj_crew from anon;
grant select on public.postoj_fleet_cars to authenticated;
grant select on public.postoj_crew to authenticated;

-- ------------------------------------------------------------------
-- Dostęp do tabel
-- ------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['postoj_vehicles', 'postoj_drivers', 'postoj_entries', 'postoj_settings', 'postoj_schedule'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('drop policy if exists "read" on public.%I', t);
    execute format('drop policy if exists "admin writes" on public.%I', t);
    execute format('drop policy if exists "admin updates" on public.%I', t);
    execute format('drop policy if exists "admin deletes" on public.%I', t);
    -- Zapis: tylko administrator i tylko we własnej flocie.
    execute format(
      'create policy "admin writes" on public.%I for insert to authenticated '
      'with check ((select auth.uid()) = owner and (select public.postoj_is_admin()))', t);
    execute format(
      'create policy "admin updates" on public.%I for update to authenticated '
      'using ((select auth.uid()) = owner and (select public.postoj_is_admin())) '
      'with check ((select auth.uid()) = owner and (select public.postoj_is_admin()))', t);
    execute format(
      'create policy "admin deletes" on public.%I for delete to authenticated '
      'using ((select auth.uid()) = owner and (select public.postoj_is_admin()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

-- Odczyt: administrator czyta swoją flotę. Kierowca czyta wyłącznie
-- własną kartę, własne rozliczenia i grafik swojej floty. Auta i imiona
-- kolegów dostaje przez widoki wyżej, stawki przez postoj_fleet_params.
create policy "read" on public.postoj_vehicles for select to authenticated
  using ((select auth.uid()) = owner and (select public.postoj_is_admin()));
create policy "read" on public.postoj_settings for select to authenticated
  using ((select auth.uid()) = owner and (select public.postoj_is_admin()));
create policy "read" on public.postoj_drivers for select to authenticated
  using (((select auth.uid()) = owner and (select public.postoj_is_admin())) or (owner, id) in (select m.owner, m.id from public.postoj_my_driver() m));
create policy "read" on public.postoj_entries for select to authenticated
  using (((select auth.uid()) = owner and (select public.postoj_is_admin())) or (owner, driver_id) in (select m.owner, m.id from public.postoj_my_driver() m));
create policy "read" on public.postoj_schedule for select to authenticated
  using (((select auth.uid()) = owner and (select public.postoj_is_admin())) or owner in (select m.owner from public.postoj_my_driver() m));

-- ------------------------------------------------------------------
-- Usterki aut: zgłoszenie i rozmowa kierowcy z szefem floty
-- ------------------------------------------------------------------
-- Kierowca zgłasza usterkę auta ze swojej floty i widzi tylko własne
-- zgłoszenia. Szef floty widzi wszystkie zgłoszenia swojej floty,
-- odpisuje i zmienia stan (otwarte, w naprawie, naprawione).
-- Autora, rolę i podpis wiadomości ustawia baza, nie przeglądarka.

create table if not exists public.postoj_issues (
  id              uuid primary key default gen_random_uuid(),
  owner           uuid not null references auth.users (id) on delete cascade,
  vehicle_id      text not null,
  driver_id       text,
  title           text not null check (char_length(btrim(title)) between 3 and 120),
  -- Auto nie nadaje się do jazdy.
  urgent          boolean not null default false,
  status          text not null default 'open' check (status in ('open', 'progress', 'resolved')),
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  last_message_at timestamptz not null default now(),
  last_author     text not null default 'driver' check (last_author in ('admin', 'driver')),
  foreign key (owner, vehicle_id) references public.postoj_vehicles (owner, id) on delete cascade,
  foreign key (owner, driver_id) references public.postoj_drivers (owner, id) on delete set null (driver_id)
);
create index if not exists postoj_issues_owner on public.postoj_issues (owner, last_message_at desc);
create index if not exists postoj_issues_driver on public.postoj_issues (owner, driver_id);

create table if not exists public.postoj_issue_messages (
  id          uuid primary key default gen_random_uuid(),
  issue_id    uuid not null references public.postoj_issues (id) on delete cascade,
  owner       uuid not null references auth.users (id) on delete cascade,
  author      uuid references auth.users (id) on delete set null,
  author_role text not null check (author_role in ('admin', 'driver')),
  author_name text not null default '',
  body        text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index if not exists postoj_issue_messages_issue on public.postoj_issue_messages (issue_id, created_at);
create index if not exists postoj_issue_messages_author on public.postoj_issue_messages (author, created_at);

-- Do kiedy użytkownik przeczytał rozmowę: z tego biorą się kropki "nowe".
create table if not exists public.postoj_issue_reads (
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  issue_id uuid not null references public.postoj_issues (id) on delete cascade,
  read_at  timestamptz not null default now(),
  primary key (user_id, issue_id)
);

-- Nowe zgłoszenie: autor, kierowca i stan ustawia baza.
create or replace function public.postoj_issue_before_insert()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare me text;
begin
  new.created_by := auth.uid();
  new.title := btrim(new.title);
  new.status := 'open';
  new.resolved_at := null;
  new.created_at := now();
  new.last_message_at := now();
  if new.owner = auth.uid() and public.postoj_is_admin() then
    new.last_author := 'admin';
    return new;
  end if;
  select m.id into me from public.postoj_my_driver() m where m.owner = new.owner limit 1;
  if me is null then
    raise exception 'Usterkę zgłasza kierowca tej floty.' using errcode = '42501';
  end if;
  if (select count(*) from public.postoj_issues i
      where i.created_by = auth.uid() and i.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Za dużo zgłoszeń w ciągu godziny. Spróbuj później.' using errcode = '54000';
  end if;
  new.driver_id := me;
  new.last_author := 'driver';
  return new;
end;
$$;

-- Zmiana stanu: data naprawy.
create or replace function public.postoj_issue_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'resolved' and old.status <> 'resolved' then new.resolved_at := now(); end if;
  if new.status <> 'resolved' then new.resolved_at := null; end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$$;

-- Wiadomość: autor, rola i podpis z bazy, limit tempa pisania.
create or replace function public.postoj_message_before_insert()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  iss record;
  driver_name text;
begin
  select i.owner, i.driver_id into iss from public.postoj_issues i where i.id = new.issue_id;
  if not found then
    raise exception 'Nie ma takiego zgłoszenia.' using errcode = '42501';
  end if;
  new.owner := iss.owner;
  new.author := auth.uid();
  new.body := btrim(new.body);
  new.created_at := now();
  if iss.owner = auth.uid() and public.postoj_is_admin() then
    new.author_role := 'admin';
    new.author_name := 'Szef floty';
  else
    select d.name into driver_name from public.postoj_drivers d
    where d.owner = iss.owner and d.id = iss.driver_id
      and (d.owner, d.id) in (select m.owner, m.id from public.postoj_my_driver() m);
    if driver_name is null then
      raise exception 'Do tego zgłoszenia pisze tylko kierowca, który je wysłał, i szef floty.' using errcode = '42501';
    end if;
    new.author_role := 'driver';
    new.author_name := driver_name;
  end if;
  if (select count(*) from public.postoj_issue_messages m
      where m.author = auth.uid() and m.created_at > now() - interval '1 minute') >= 15 then
    raise exception 'Za dużo wiadomości naraz. Odczekaj chwilę.' using errcode = '54000';
  end if;
  return new;
end;
$$;

-- Po wiadomości: czas ostatniej rozmowy, a odpowiedź kierowcy w naprawionym
-- zgłoszeniu otwiera je ponownie.
create or replace function public.postoj_message_after_insert()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.postoj_issues i
  set last_message_at = new.created_at,
      last_author = new.author_role,
      status = case when new.author_role = 'driver' and i.status = 'resolved' then 'open' else i.status end
  where i.id = new.issue_id;
  insert into public.postoj_issue_reads (user_id, issue_id, read_at)
  values (new.author, new.issue_id, new.created_at)
  on conflict (user_id, issue_id) do update set read_at = excluded.read_at;
  return new;
end;
$$;

revoke execute on function public.postoj_issue_before_insert() from public, anon, authenticated;
revoke execute on function public.postoj_message_before_insert() from public, anon, authenticated;
revoke execute on function public.postoj_message_after_insert() from public, anon, authenticated;

drop trigger if exists before_insert on public.postoj_issues;
create trigger before_insert before insert on public.postoj_issues
  for each row execute function public.postoj_issue_before_insert();
drop trigger if exists before_update on public.postoj_issues;
create trigger before_update before update on public.postoj_issues
  for each row execute function public.postoj_issue_before_update();
drop trigger if exists touch on public.postoj_issues;
create trigger touch before update on public.postoj_issues
  for each row execute function public.postoj_touch();
drop trigger if exists before_insert on public.postoj_issue_messages;
create trigger before_insert before insert on public.postoj_issue_messages
  for each row execute function public.postoj_message_before_insert();
drop trigger if exists after_insert on public.postoj_issue_messages;
create trigger after_insert after insert on public.postoj_issue_messages
  for each row execute function public.postoj_message_after_insert();

alter table public.postoj_issues enable row level security;
alter table public.postoj_issue_messages enable row level security;
alter table public.postoj_issue_reads enable row level security;

drop policy if exists "read" on public.postoj_issues;
drop policy if exists "report" on public.postoj_issues;
drop policy if exists "admin updates" on public.postoj_issues;
drop policy if exists "admin deletes" on public.postoj_issues;
create policy "read" on public.postoj_issues for select to authenticated
  using (((select auth.uid()) = owner and (select public.postoj_is_admin()))
         or (owner, driver_id) in (select m.owner, m.id from public.postoj_my_driver() m));
create policy "report" on public.postoj_issues for insert to authenticated
  with check (((select auth.uid()) = owner and (select public.postoj_is_admin()))
              or (owner, driver_id) in (select m.owner, m.id from public.postoj_my_driver() m));
create policy "admin updates" on public.postoj_issues for update to authenticated
  using ((select auth.uid()) = owner and (select public.postoj_is_admin()))
  with check ((select auth.uid()) = owner and (select public.postoj_is_admin()));
create policy "admin deletes" on public.postoj_issues for delete to authenticated
  using ((select auth.uid()) = owner and (select public.postoj_is_admin()));

drop policy if exists "read" on public.postoj_issue_messages;
drop policy if exists "write" on public.postoj_issue_messages;
create policy "read" on public.postoj_issue_messages for select to authenticated
  using (issue_id in (select i.id from public.postoj_issues i));
create policy "write" on public.postoj_issue_messages for insert to authenticated
  with check (author = (select auth.uid()) and issue_id in (select i.id from public.postoj_issues i));

drop policy if exists "own" on public.postoj_issue_reads;
create policy "own" on public.postoj_issue_reads for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and issue_id in (select i.id from public.postoj_issues i));

revoke all on public.postoj_issues from anon;
revoke all on public.postoj_issue_messages from anon;
revoke all on public.postoj_issue_reads from anon;
revoke all on public.postoj_issues from authenticated;
revoke all on public.postoj_issue_messages from authenticated;
grant select, insert, delete on public.postoj_issues to authenticated;
-- Szef zmienia tylko stan, pilność i tytuł zgłoszenia.
grant update (status, urgent, title) on public.postoj_issues to authenticated;
grant select, insert on public.postoj_issue_messages to authenticated;
grant select, insert, update on public.postoj_issue_reads to authenticated;

-- Nowe wiadomości trafiają na żywo do otwartej aplikacji (Supabase Realtime).
-- Realtime też pilnuje zasad odczytu wyżej.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'postoj_issues') then
      alter publication supabase_realtime add table public.postoj_issues;
    end if;
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'postoj_issue_messages') then
      alter publication supabase_realtime add table public.postoj_issue_messages;
    end if;
  end if;
end;
$$;

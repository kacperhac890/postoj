-- Postój: schemat bazy danych dla Supabase (Postgres).
--
-- Jak użyć: Supabase -> SQL Editor -> New query -> wklej cały plik -> Run.
-- Skrypt można uruchomić ponownie, nie usuwa danych.
--
-- Każdy wiersz należy do konta administratora floty (kolumna owner).
-- Zmieniać dane może tylko administrator (adres w postoj_is_admin niżej).
-- Kierowca loguje się na adres wpisany w jego karcie i tylko czyta:
-- flotę bez kosztów, grafik, imiona kolegów i własne rozliczenia.
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

-- Administrator floty. Żeby zmienić admina, zmień adres i uruchom plik ponownie.
create or replace function public.postoj_is_admin()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(public.postoj_confirmed_email() = 'kacperhac890@gmail.com', false)
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
  using ((select auth.uid()) = owner);
create policy "read" on public.postoj_settings for select to authenticated
  using ((select auth.uid()) = owner);
create policy "read" on public.postoj_drivers for select to authenticated
  using ((select auth.uid()) = owner or (owner, id) in (select m.owner, m.id from public.postoj_my_driver() m));
create policy "read" on public.postoj_entries for select to authenticated
  using ((select auth.uid()) = owner or (owner, driver_id) in (select m.owner, m.id from public.postoj_my_driver() m));
create policy "read" on public.postoj_schedule for select to authenticated
  using ((select auth.uid()) = owner or owner in (select m.owner from public.postoj_my_driver() m));

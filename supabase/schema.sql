-- Postój: schemat bazy danych dla Supabase (Postgres).
--
-- Jak użyć: Supabase -> SQL Editor -> New query -> wklej cały plik -> Run.
-- Skrypt można uruchomić ponownie, nie usuwa danych.
--
-- Każdy wiersz należy do jednego konta (kolumna owner). Zasady RLS
-- pozwalają czytać i zmieniać wyłącznie własne wiersze, więc klucz
-- "anon" w przeglądarce nie daje dostępu do cudzych danych.
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
  vehicle_id text,
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
  foreach t in array array['postoj_vehicles', 'postoj_drivers', 'postoj_entries', 'postoj_settings'] loop
    execute format('drop trigger if exists touch on public.%I', t);
    execute format(
      'create trigger touch before update on public.%I for each row execute function public.postoj_touch()',
      t
    );
  end loop;
end;
$$;

-- ------------------------------------------------------------------
-- Dostęp: tylko właściciel, tylko zalogowani
-- ------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['postoj_vehicles', 'postoj_drivers', 'postoj_entries', 'postoj_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated '
      'using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner)',
      t
    );
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

-- Idempotent helpers
create extension if not exists "pgcrypto";

-- ========== Core tables ==========
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid references public.teams(id) on delete cascade,
  user_id uuid not null,
  is_admin boolean not null default false,
  primary key (team_id, user_id)
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null,                         -- will be auto-set by trigger (below)
  team_id uuid not null references public.teams(id) on delete restrict,

  -- Domain fields (match app/form/new.tsx)
  date date not null,
  store_site text,                                  -- NEW
  store_location text not null,
  location text,                                    -- NEW
  brand text,                                       -- NEW
  conditions text,
  price_per_unit numeric(10,2),
  shelf_space text,
  on_shelf integer,
  tags text[] not null default '{}',
  notes text,

  photo1_url text,                                  -- align with app (was *_path before)
  photo2_url text
);

-- ====== Safe alignment for older databases (run harmlessly if already aligned) ======
-- Rename legacy columns if they exist
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='submissions' and column_name='photo1_path') then
    alter table public.submissions rename column photo1_path to photo1_url;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='submissions' and column_name='photo2_path') then
    alter table public.submissions rename column photo2_path to photo2_url;
  end if;
end$$;

-- Add missing NEW columns if the table pre-existed
alter table public.submissions add column if not exists store_site text;
alter table public.submissions add column if not exists location text;
alter table public.submissions add column if not exists brand text;
alter table public.submissions add column if not exists photo1_url text;
alter table public.submissions add column if not exists photo2_url text;

-- Helpful indexes
create index if not exists submissions_team_created_idx
  on public.submissions (team_id, created_at desc);

create index if not exists submissions_created_by_created_idx
  on public.submissions (created_by, created_at desc);

-- ========== Trigger: ensure created_by = auth.uid() when inserted via anon (RLS) ==========
create or replace function public.set_created_by_from_auth()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end
$$;

drop trigger if exists trg_set_created_by on public.submissions;
create trigger trg_set_created_by
before insert on public.submissions
for each row
execute function public.set_created_by_from_auth();

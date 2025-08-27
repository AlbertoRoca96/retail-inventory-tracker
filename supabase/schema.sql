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
  created_by uuid not null,                         -- auto-set by trigger below
  team_id uuid not null references public.teams(id) on delete restrict,

  -- Domain fields
  date date not null,
  store_site text,
  store_location text not null,
  location text,
  brand text,
  conditions text,
  price_per_unit numeric(10,2),
  shelf_space text,
  on_shelf integer,
  tags text[] not null default '{}',
  notes text,

  photo1_url text,
  photo2_url text,

  -- NEW: priority (1 urgent/red, 2 yellow, 3 ok/green)
  priority_level integer not null default 3 check (priority_level between 1 and 3)
);

-- ====== Safe alignment for older databases (run harmlessly if already aligned) ======
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

-- Add NEW columns if the table pre-existed (idempotent)
alter table public.submissions add column if not exists store_site text;
alter table public.submissions add column if not exists location text;
alter table public.submissions add column if not exists brand text;
alter table public.submissions add column if not exists photo1_url text;
alter table public.submissions add column if not exists photo2_url text;
alter table public.submissions add column if not exists priority_level integer not null default 3;

-- Keep default and allow nulls temporarily for legacy rows; range is enforced separately
alter table public.submissions
  alter column priority_level set default 3,
  alter column priority_level drop not null;

-- Enforce allowed range if the CHECK is missing
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'submissions_priority_level_chk') then
    alter table public.submissions
      add constraint submissions_priority_level_chk check (priority_level between 1 and 3);
  end if;
end$$;

-- Helpful indexes
create index if not exists submissions_team_created_idx
  on public.submissions (team_id, created_at desc);

create index if not exists submissions_created_by_created_idx
  on public.submissions (created_by, created_at desc);

create index if not exists submissions_team_priority_idx
  on public.submissions (team_id, priority_level, created_at desc);

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

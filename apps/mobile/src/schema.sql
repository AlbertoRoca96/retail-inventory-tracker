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
  created_by uuid not null,
  team_id uuid not null references public.teams(id) on delete restrict,

  date date not null,
  store_location text not null,
  conditions text,
  price_per_unit numeric(10,2),
  shelf_space text,
  on_shelf integer,
  tags text[] default '{}',
  notes text,

  photo1_path text,
  photo2_path text
);

create index if not exists submissions_team_created_idx on public.submissions (team_id, created_at desc);

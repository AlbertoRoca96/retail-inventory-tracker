-- Reports integration v1: additive-only schema changes.
-- Existing submission column names remain untouched for compatibility.

alter table public.submissions
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists store_number text,
  add column if not exists store_chain text;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists submissions_set_updated_at on public.submissions;
create trigger submissions_set_updated_at
before update on public.submissions
for each row execute function public.set_updated_at();

create index if not exists submissions_created_by_updated_idx
  on public.submissions (created_by, updated_at desc);

create table if not exists public.report_brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

insert into public.report_brands (name, slug, sort_order)
values
  ('Richlands', 'richlands', 10),
  ('Billy Pie', 'billy-pie', 20),
  ('Ninja Kombucha', 'ninja-kombucha', 30)
on conflict (slug) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    is_active = true;

create table if not exists public.submission_products (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  product text not null check (length(btrim(product)) > 0),
  quantity numeric(12, 2) check (quantity is null or quantity >= 0),
  expiry_date date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists submission_products_submission_idx
  on public.submission_products (submission_id, sort_order, created_at);

drop trigger if exists submission_products_set_updated_at on public.submission_products;
create trigger submission_products_set_updated_at
before update on public.submission_products
for each row execute function public.set_updated_at();

create table if not exists public.integration_api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  scope_user_id uuid not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz
);

comment on table public.integration_api_keys is
  'Server-only hashed credentials for versioned integration APIs.';
comment on column public.integration_api_keys.scope_user_id is
  'Restricts every response to reports created by this auth user.';

alter table public.report_brands enable row level security;
alter table public.submission_products enable row level security;
alter table public.integration_api_keys enable row level security;

drop policy if exists "authenticated users can read active report brands"
  on public.report_brands;
create policy "authenticated users can read active report brands"
on public.report_brands
for select
to authenticated
using (is_active);

drop policy if exists "team members can read submission products"
  on public.submission_products;
create policy "team members can read submission products"
on public.submission_products
for select
to authenticated
using (
  exists (
    select 1
    from public.submissions s
    join public.team_members tm on tm.team_id = s.team_id
    where s.id = submission_products.submission_id
      and tm.user_id = auth.uid()
  )
);

drop policy if exists "authors can insert submission products"
  on public.submission_products;
create policy "authors can insert submission products"
on public.submission_products
for insert
to authenticated
with check (
  exists (
    select 1
    from public.submissions s
    where s.id = submission_products.submission_id
      and s.created_by = auth.uid()
  )
);

drop policy if exists "authors or admins can update submission products"
  on public.submission_products;
create policy "authors or admins can update submission products"
on public.submission_products
for update
to authenticated
using (
  exists (
    select 1
    from public.submissions s
    left join public.team_members tm
      on tm.team_id = s.team_id
     and tm.user_id = auth.uid()
    where s.id = submission_products.submission_id
      and (s.created_by = auth.uid() or tm.is_admin)
  )
)
with check (
  exists (
    select 1
    from public.submissions s
    join public.team_members tm on tm.team_id = s.team_id
    where s.id = submission_products.submission_id
      and tm.user_id = auth.uid()
  )
);

drop policy if exists "authors or admins can delete submission products"
  on public.submission_products;
create policy "authors or admins can delete submission products"
on public.submission_products
for delete
to authenticated
using (
  exists (
    select 1
    from public.submissions s
    left join public.team_members tm
      on tm.team_id = s.team_id
     and tm.user_id = auth.uid()
    where s.id = submission_products.submission_id
      and (s.created_by = auth.uid() or tm.is_admin)
  )
);

-- No client policies are intentionally created for integration_api_keys.
-- Only the service role used by the Edge Function can access those rows.

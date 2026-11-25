-- LOCAL PROPOSAL ONLY: database owner approval required before applying.
-- Existing author credentials remain unchanged. No keys or team IDs are provisioned.
begin;

alter table public.integration_api_keys
  alter column scope_user_id drop not null,
  add column scope_team_ids uuid[];

alter table public.integration_api_keys
  add constraint integration_api_keys_exactly_one_scope check (
    (scope_user_id is not null and scope_team_ids is null)
    or
    (scope_user_id is null and scope_team_ids is not null and cardinality(scope_team_ids) > 0
      and array_ndims(scope_team_ids) = 1
      and array_position(scope_team_ids, null) is null)
  );
comment on column public.integration_api_keys.scope_team_ids is
  'Explicit integration whitelist; NULL for legacy author scope. Approval required to provision.';
revoke all on public.integration_api_keys from anon, authenticated;

create index submissions_team_changed_cursor_idx
  on public.submissions (team_id, updated_at, id) where status = 'submitted';
create index submissions_team_created_cursor_idx
  on public.submissions (team_id, created_at, id) where status = 'submitted';
create index submissions_author_changed_cursor_idx
  on public.submissions (created_by, updated_at, id) where status = 'submitted';
create index submissions_author_created_cursor_idx
  on public.submissions (created_by, created_at, id) where status = 'submitted';

-- Monotonic even for multiple edits within one transaction or an older transaction
-- waiting for a newer writer's lock. Shared by existing report/product triggers.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;

-- Invoker means product writes must also have RLS permission to touch the parent.
-- Updating a product's submission_id touches both old and new parents.
create function public.touch_product_report_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op <> 'INSERT' then
    update public.submissions set updated_at = clock_timestamp() where id = old.submission_id;
  end if;
  if tg_op <> 'DELETE' and
     (tg_op = 'INSERT' or new.submission_id is distinct from old.submission_id) then
    update public.submissions set updated_at = clock_timestamp() where id = new.submission_id;
  end if;
  return null;
end;
$$;
create trigger submission_products_touch_report_v1
  after insert or update or delete on public.submission_products
  for each row execute function public.touch_product_report_v1();
revoke all on function public.touch_product_report_v1() from public, anon, authenticated;

-- Retry receipts are author-scoped and protected by RLS like the data they describe.
create table public.report_submission_receipts_v1 (
  author_id uuid not null default auth.uid(),
  report_id uuid not null,
  request_report jsonb not null,
  request_products jsonb not null,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (author_id, report_id)
);
alter table public.report_submission_receipts_v1 enable row level security;
create policy report_receipts_author_v1 on public.report_submission_receipts_v1
  for all to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
revoke all on public.report_submission_receipts_v1 from public, anon, authenticated;
grant select, insert, update on public.report_submission_receipts_v1 to authenticated;

create function public.submit_report_v1(p_report jsonb, p_products jsonb)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
<<submission_request>>
declare
  caller uuid := auth.uid();
  report_id uuid;
  owner_id uuid;
  photo_slot integer;
  photo_path text;
  receipt public.report_submission_receipts_v1%rowtype;
  r record;
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_report) is distinct from 'object'
     or jsonb_typeof(p_products) is distinct from 'array' then
    raise exception 'Expected report object and products array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_products) > 200 then
    raise exception 'At most 200 products allowed' using errcode = '22023';
  end if;
  -- Reject unknown keys rather than silently accepting server-owned columns.
  if exists (select 1 from jsonb_object_keys(p_report) as k(key)
    where key <> all(array[
      'id','team_id','created_by','user_id','group_id','status','date',
      'store_site','store_number','store_chain','store_location','location','brand',
      'conditions','price_per_unit','shelf_space','on_shelf','tags','notes','priority_level',
      'photo1_path','photo2_path','photo3_path','photo4_path','photo5_path','photo6_path',
      'photo7_path','photo8_path','photo9_path','photo10_path','photo11_path','photo12_path',
      'photo13_path','photo14_path','photo15_path','photo16_path','photo17_path','photo18_path',
      'photo19_path','photo20_path',
      'photo1_url','photo2_url','photo3_url','photo4_url','photo5_url','photo6_url',
      'photo7_url','photo8_url','photo9_url','photo10_url','photo11_url','photo12_url',
      'photo13_url','photo14_url','photo15_url','photo16_url','photo17_url','photo18_url',
      'photo19_url','photo20_url'
    ])) then
    raise exception 'Unsupported report field' using errcode = '22023';
  end if;
  report_id := (p_report->>'id')::uuid;
  if report_id is null or (p_report->>'team_id') is null then
    raise exception 'id and team_id required' using errcode = '22023';
  end if;
  if (p_report->>'created_by' is not null and (p_report->>'created_by')::uuid <> caller)
     or (p_report->>'user_id' is not null and (p_report->>'user_id')::uuid <> caller)
     or p_report->>'group_id' is not null then
    raise exception 'Invalid report ownership' using errcode = '42501';
  end if;
  if coalesce(p_report->>'status', 'submitted') <> 'submitted' then
    raise exception 'Only submitted reports accepted' using errcode = '22023';
  end if;
  if not exists (select 1 from public.team_members
    where team_id = (p_report->>'team_id')::uuid and user_id = caller) then
    raise exception 'Team membership required' using errcode = '42501';
  end if;
  if exists (select 1 from jsonb_array_elements(p_products) as p(value)
    where jsonb_typeof(value) <> 'object') then
    raise exception 'Each product must be an object' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_products) as p(value),
    lateral jsonb_object_keys(value) as k(key)
    where key <> all(array['product','quantity','expiry_date','sort_order'])) then
    raise exception 'Unsupported product field' using errcode = '22023';
  end if;

  -- Paths must be report-bound; never let the privileged read API sign foreign assets.
  for photo_slot in 1..20 loop
    photo_path := p_report->>('photo' || photo_slot || '_path');
    if photo_path is not null then
      if photo_path !~ ('^teams/' || ((p_report->>'team_id')::uuid)::text ||
          '/submissions/' || report_id::text || '/photo' || photo_slot::text ||
          '(-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?[.](jpg|jpeg|png|heic|heif|webp)$') then
        raise exception 'Photo path does not belong to this report' using errcode = '22023';
      end if;
      -- Expiring delivery URLs are not part of immutable request identity.
      p_report := jsonb_set(p_report, array['photo' || photo_slot || '_url'], 'null'::jsonb, true);
    end if;
  end loop;

  -- ON CONFLICT locks concurrent identical author/id retries until commit/rollback.
  insert into public.report_submission_receipts_v1
    (author_id, report_id, request_report, request_products)
  values (caller, report_id, p_report, p_products)
  on conflict do nothing;
  select * into strict receipt from public.report_submission_receipts_v1
    where author_id = caller and report_submission_receipts_v1.report_id = submission_request.report_id
    for update;
  if receipt.request_report <> p_report or receipt.request_products <> p_products then
    raise exception 'Report ID reused with a different payload' using errcode = '22023';
  end if;

  select created_by into owner_id from public.submissions
    where id = report_id for update;
  if found and owner_id <> caller then
    raise exception 'Report is not owned by caller' using errcode = '42501';
  end if;
  if receipt.completed then
    if owner_id is null then
      raise exception 'Previously submitted report no longer exists' using errcode = '22023';
    end if;
    return report_id;
  end if;

  select * into r from jsonb_to_record(p_report) as x(
    team_id uuid, date date, store_site text, store_number text, store_chain text,
    store_location text, location text, brand text, conditions text,
    price_per_unit numeric, shelf_space text, on_shelf text, tags text[], notes text,
    priority_level integer, photo1_path text, photo2_path text, photo3_path text,
    photo4_path text, photo5_path text, photo6_path text,
    photo7_path text, photo8_path text, photo9_path text, photo10_path text, photo11_path text,
    photo12_path text, photo13_path text, photo14_path text, photo15_path text, photo16_path text,
    photo17_path text, photo18_path text, photo19_path text, photo20_path text,
    photo1_url text, photo2_url text, photo3_url text, photo4_url text, photo5_url text, photo6_url text,
    photo7_url text, photo8_url text, photo9_url text, photo10_url text, photo11_url text, photo12_url text,
    photo13_url text, photo14_url text, photo15_url text, photo16_url text, photo17_url text, photo18_url text,
    photo19_url text, photo20_url text
  );
  -- created_at intentionally omitted: preserve database default on first creation.
  insert into public.submissions (
    id, user_id, created_by, team_id, status, date, store_site, store_number, store_chain,
    store_location, location, brand, conditions, price_per_unit, shelf_space,
    on_shelf, tags, notes, priority_level,
    photo1_path, photo2_path, photo3_path, photo4_path, photo5_path, photo6_path,
    photo7_path, photo8_path, photo9_path, photo10_path, photo11_path, photo12_path, photo13_path, photo14_path,
    photo15_path, photo16_path, photo17_path, photo18_path, photo19_path, photo20_path,
    photo1_url, photo2_url, photo3_url, photo4_url, photo5_url, photo6_url,
    photo7_url, photo8_url, photo9_url, photo10_url, photo11_url, photo12_url,
    photo13_url, photo14_url, photo15_url, photo16_url, photo17_url, photo18_url, photo19_url, photo20_url
  ) values (
    report_id, caller, caller, r.team_id, 'submitted', r.date, r.store_site, r.store_number, r.store_chain,
    r.store_location, r.location, r.brand, r.conditions, r.price_per_unit, r.shelf_space,
    r.on_shelf, coalesce(r.tags, '{}'::text[]), r.notes, coalesce(r.priority_level, 3),
    r.photo1_path, r.photo2_path, r.photo3_path, r.photo4_path, r.photo5_path, r.photo6_path,
    r.photo7_path, r.photo8_path, r.photo9_path, r.photo10_path, r.photo11_path, r.photo12_path, r.photo13_path,
    r.photo14_path, r.photo15_path, r.photo16_path, r.photo17_path, r.photo18_path, r.photo19_path,
    r.photo20_path,
    r.photo1_url, r.photo2_url, r.photo3_url, r.photo4_url, r.photo5_url, r.photo6_url,
    r.photo7_url, r.photo8_url, r.photo9_url, r.photo10_url, r.photo11_url, r.photo12_url,
    r.photo13_url, r.photo14_url, r.photo15_url, r.photo16_url, r.photo17_url, r.photo18_url, r.photo19_url,
    r.photo20_url
  ) on conflict (id) do update set
    team_id = excluded.team_id, status = excluded.status, date = excluded.date,
    store_site = excluded.store_site, store_number = excluded.store_number,
    store_chain = excluded.store_chain, store_location = excluded.store_location,
    location = excluded.location, brand = excluded.brand, conditions = excluded.conditions,
    price_per_unit = excluded.price_per_unit, shelf_space = excluded.shelf_space,
    on_shelf = excluded.on_shelf, tags = excluded.tags, notes = excluded.notes,
    priority_level = excluded.priority_level,
    photo1_path = excluded.photo1_path, photo2_path = excluded.photo2_path,
    photo3_path = excluded.photo3_path, photo4_path = excluded.photo4_path,
    photo5_path = excluded.photo5_path, photo6_path = excluded.photo6_path,
    photo7_path = excluded.photo7_path,
    photo8_path = excluded.photo8_path,
    photo9_path = excluded.photo9_path,
    photo10_path = excluded.photo10_path,
    photo11_path = excluded.photo11_path,
    photo12_path = excluded.photo12_path,
    photo13_path = excluded.photo13_path,
    photo14_path = excluded.photo14_path,
    photo15_path = excluded.photo15_path,
    photo16_path = excluded.photo16_path,
    photo17_path = excluded.photo17_path,
    photo18_path = excluded.photo18_path,
    photo19_path = excluded.photo19_path,
    photo20_path = excluded.photo20_path,
    photo1_url = excluded.photo1_url, photo2_url = excluded.photo2_url,
    photo3_url = excluded.photo3_url, photo4_url = excluded.photo4_url,
    photo5_url = excluded.photo5_url, photo6_url = excluded.photo6_url,
    photo7_url = excluded.photo7_url,
    photo8_url = excluded.photo8_url,
    photo9_url = excluded.photo9_url,
    photo10_url = excluded.photo10_url,
    photo11_url = excluded.photo11_url,
    photo12_url = excluded.photo12_url,
    photo13_url = excluded.photo13_url,
    photo14_url = excluded.photo14_url,
    photo15_url = excluded.photo15_url,
    photo16_url = excluded.photo16_url,
    photo17_url = excluded.photo17_url,
    photo18_url = excluded.photo18_url,
    photo19_url = excluded.photo19_url,
    photo20_url = excluded.photo20_url
  where submissions.created_by = caller;
  if not found then
    raise exception 'Report is not owned by caller' using errcode = '42501';
  end if;
  -- Defense in depth: an admin's broad RLS rights cannot replace another author's products.
  delete from public.submission_products p where p.submission_id = report_id
    and exists (select 1 from public.submissions s where s.id = report_id and s.created_by = caller);
  insert into public.submission_products (submission_id, product, quantity, expiry_date, sort_order)
    select report_id, p.value->>'product', (p.value->>'quantity')::numeric,
      (p.value->>'expiry_date')::date, coalesce((p.value->>'sort_order')::integer, (p.ordinality - 1)::integer)
    from jsonb_array_elements(p_products) with ordinality as p(value, ordinality);
  update public.report_submission_receipts_v1 set completed = true
    where author_id = caller and report_submission_receipts_v1.report_id = submission_request.report_id;
  return report_id;
end;
$$;
revoke all on function public.submit_report_v1(jsonb, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.submit_report_v1(jsonb, jsonb) to authenticated;

commit;

-- Run ONLY against a disposable database named helios_reports_test_v1,
-- with the application's current schema/policies and migrations 030300 through 030500 applied.
-- psql -X -v ON_ERROR_STOP=1 -d helios_reports_test_v1 -f rpc.local-test.sql
-- All fixtures and mutations roll back. Never use a linked/production connection.
\set ON_ERROR_STOP on
select current_database() = 'helios_reports_test_v1' as safe_database \gset
\if :safe_database
\else
  \echo 'Refusing: requires disposable helios_reports_test_v1 database'
  \quit 3
\endif
begin;

insert into auth.users (id) values
 ('10000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002');
insert into public.teams (id, name) values ('20000000-0000-4000-8000-000000000001', 'RPC local test');
insert into public.team_members (team_id, user_id, is_admin) values
 ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', false),
 ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', true);

create function pg_temp.assert_true(value boolean, label text) returns void
language plpgsql as $$ begin
  if value is distinct from true then raise exception 'Assertion failed: %', label; end if;
end $$;
create function pg_temp.expect_error(command text, expected_state text) returns void
language plpgsql as $$ begin
  begin
    execute command;
  exception when others then
    if sqlstate = expected_state then return; end if;
    raise;
  end;
  raise exception 'Expected SQLSTATE %', expected_state;
end $$;

-- Empty or ambiguous scope must fail at the database boundary too.
select pg_temp.expect_error($q$
 insert into public.integration_api_keys(name,key_hash,scope_user_id,scope_team_ids)
 values ('invalid-local', repeat('a',64), null, null)
$q$, '23514');
select pg_temp.expect_error($q$
 insert into public.integration_api_keys(name,key_hash,scope_user_id,scope_team_ids)
 values ('invalid-local', repeat('a',64), null, '{}'::uuid[])
$q$, '23514');
select pg_temp.expect_error($q$
 insert into public.integration_api_keys(name,key_hash,scope_user_id,scope_team_ids)
 values ('invalid-local', repeat('a',64), '10000000-0000-4000-8000-000000000001',
 array['20000000-0000-4000-8000-000000000001']::uuid[])
$q$, '23514');
select pg_temp.assert_true(not has_function_privilege('anon', 'public.submit_report_v1(jsonb,jsonb)', 'execute'), 'no anon RPC');

create temp table payload (report jsonb, products jsonb);
insert into payload values ('{
 "id":"30000000-0000-4000-8000-000000000001",
 "team_id":"20000000-0000-4000-8000-000000000001",
 "date":"2026-11-03", "store_location":"local fixture", "store_site":"local",
 "tags":[], "notes":"idempotent test"
}', '[{"product":"local product", "quantity":2}]');
grant select on payload to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select public.submit_report_v1(report, products) from payload;
select pg_temp.assert_true((select count(*) = 1 from public.submission_products where submission_id = '30000000-0000-4000-8000-000000000001'), 'first product');
create temp table initial_result as select s.created_at, s.updated_at, p.id as product_id
 from public.submissions s join public.submission_products p on p.submission_id = s.id
 where s.id = '30000000-0000-4000-8000-000000000001';
select public.submit_report_v1(report, products) from payload;
select pg_temp.assert_true((select count(*) = 1 from public.submission_products p join initial_result i on p.id = i.product_id), 'retry keeps product IDs');
select pg_temp.assert_true((select s.created_at = i.created_at and s.updated_at = i.updated_at
 from public.submissions s cross join initial_result i where s.id = '30000000-0000-4000-8000-000000000001'), 'retry does not bump timestamps');
select pg_temp.expect_error($q$select public.submit_report_v1(report || '{"notes":"different"}', products) from payload$q$, '22023');

-- Product edits, inserts and deletes bump the same parent monotonically.
update public.submission_products set quantity = 3 where submission_id = '30000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select s.updated_at > i.updated_at from public.submissions s cross join initial_result i where s.id = '30000000-0000-4000-8000-000000000001'), 'product update touches report');
update initial_result set updated_at = (select updated_at from public.submissions where id = '30000000-0000-4000-8000-000000000001');
insert into public.submission_products(submission_id, product) values ('30000000-0000-4000-8000-000000000001', 'extra');
select pg_temp.assert_true((select s.updated_at > i.updated_at from public.submissions s cross join initial_result i where s.id = '30000000-0000-4000-8000-000000000001'), 'product insert touches report');
update initial_result set updated_at = (select updated_at from public.submissions where id = '30000000-0000-4000-8000-000000000001');
delete from public.submission_products where product = 'extra' and submission_id = '30000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select s.updated_at > i.updated_at from public.submissions s cross join initial_result i where s.id = '30000000-0000-4000-8000-000000000001'), 'product delete touches report');

-- Invalid products roll back the new parent AND the retry receipt atomically.
select pg_temp.expect_error($q$
 select public.submit_report_v1(report || '{"id":"30000000-0000-4000-8000-000000000002"}', '[{"product":"bad", "quantity":-1}]') from payload
$q$, '23514');
select pg_temp.assert_true(not exists(select 1 from public.submissions where id = '30000000-0000-4000-8000-000000000002'), 'failed report absent');
select pg_temp.assert_true(not exists(select 1 from public.report_submission_receipts_v1 where report_id = '30000000-0000-4000-8000-000000000002'), 'failed receipt absent');

-- Even a team admin cannot overwrite another author's report through this RPC.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select pg_temp.expect_error($q$select public.submit_report_v1(report, '[]') from payload$q$, '42501');
select pg_temp.assert_true((select quantity = 3 from public.submission_products where submission_id = '30000000-0000-4000-8000-000000000001'), 'other author products intact');
select pg_temp.assert_true(not exists(select 1 from public.report_submission_receipts_v1 where report_id = '30000000-0000-4000-8000-000000000001'), 'other author receipt invisible');
select pg_temp.expect_error($q$
 select public.submit_report_v1(report || '{"created_by":"10000000-0000-4000-8000-000000000001"}', products) from payload
$q$, '42501');
-- Direct authenticated writes cannot bypass RPC author/path protections.
select pg_temp.expect_error($q$
 insert into public.submissions(id,user_id,created_by,team_id,status,date,store_location)
 values ('30000000-0000-4000-8000-000000000003',
 '10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000001','submitted','2026-11-03','fixture')
$q$, '42501');
select pg_temp.expect_error($q$
 update public.submissions set created_by='10000000-0000-4000-8000-000000000002'
 where id='30000000-0000-4000-8000-000000000001'
$q$, '42501');
select pg_temp.expect_error($q$
 insert into public.submissions(id,team_id,status,date,store_location,photo1_path)
 values ('30000000-0000-4000-8000-000000000003',
 '20000000-0000-4000-8000-000000000001','submitted','2026-11-03','fixture','foreign/private-photo.jpg')
$q$, '22023');
-- Every extended slot rejects foreign paths via RPC and direct table writes.
do $$
declare slot integer; foreign_path text;
begin
  foreach slot in array array[7,19,20] loop
    foreach foreign_path in array array[
      'teams/20000000-0000-4000-8000-000000000002/submissions/30000000-0000-4000-8000-000000000005/photo' || slot || '.jpg',
      'teams/20000000-0000-4000-8000-000000000001/submissions/30000000-0000-4000-8000-000000000099/photo' || slot || '.jpg'
    ] loop
      perform pg_temp.expect_error(format(
        'select public.submit_report_v1(report || %L::jsonb, products) from payload',
        jsonb_build_object('id','30000000-0000-4000-8000-000000000005', 'photo' || slot || '_path',foreign_path)::text), '22023');
      perform pg_temp.expect_error(format(
        'update public.submissions set %I=%L where id=%L', 'photo' || slot || '_path', foreign_path,
        '30000000-0000-4000-8000-000000000001'), '22023');
      perform pg_temp.expect_error(format(
        'insert into public.submissions(id,team_id,status,date,store_location,%I) values (%L,%L,%L,%L,%L,%L)',
        'photo' || slot || '_path', '30000000-0000-4000-8000-000000000005',
        '20000000-0000-4000-8000-000000000001','submitted','2026-11-03','fixture',foreign_path), '22023');
    end loop;
  end loop;
end $$;
select pg_temp.expect_error($q$
 select public.submit_report_v1(report || '{"photo21_path":"foreign/photo21.jpg"}', products) from payload
$q$, '22023');
select pg_temp.expect_error($q$
 select public.submit_report_v1(report || '{"photo21_url":"https://example.invalid/photo21"}', products) from payload
$q$, '22023');

-- All twenty typed fields persist; changed expiring URLs do not change retry identity.
do $$
declare request jsonb; slot integer; result_id uuid;
begin
  select report || '{"id":"30000000-0000-4000-8000-000000000006"}'::jsonb into request from payload;
  for slot in 1..20 loop
    request := request || jsonb_build_object(
      'photo' || slot || '_path', 'teams/20000000-0000-4000-8000-000000000001/submissions/30000000-0000-4000-8000-000000000006/photo' || slot || '.jpg',
      'photo' || slot || '_url', 'https://example.invalid/expired');
  end loop;
  result_id := public.submit_report_v1(request, '[]');
  perform pg_temp.assert_true(result_id='30000000-0000-4000-8000-000000000006', 'RPC returns twentieth-slot report');
  for slot in 1..20 loop
    perform pg_temp.assert_true((select to_jsonb(s)->>('photo' || slot || '_path') = request->>('photo' || slot || '_path')
      and to_jsonb(s)->>('photo' || slot || '_url') is null
      from public.submissions s where s.id=result_id), 'typed photo slot retained, URL canonicalized: ' || slot);
    request := jsonb_set(request, array['photo' || slot || '_url'], to_jsonb('https://example.invalid/renewed'::text));
  end loop;
  perform public.submit_report_v1(request, '[]');
  -- Omitting delivery URLs is the same request as renewing them.
  for slot in 1..20 loop
    request := request - ('photo' || slot || '_url');
  end loop;
  perform public.submit_report_v1(request, '[]');
end $$;

-- URL-only legacy fields retain existing behavior, including the new typed slots.
-- Existing owned row exercises the RPC's ON CONFLICT update branch too.
insert into public.submissions(id,team_id,status,date,store_location)
values ('30000000-0000-4000-8000-000000000007',
 '20000000-0000-4000-8000-000000000001','submitted','2026-11-03','fixture');
do $$
declare request jsonb; slot integer; result_id uuid;
begin
  select report || '{"id":"30000000-0000-4000-8000-000000000007"}'::jsonb into request from payload;
  for slot in 1..20 loop
    request := request || jsonb_build_object('photo' || slot || '_url', 'https://example.invalid/legacy/' || slot);
  end loop;
  result_id := public.submit_report_v1(request, '[]');
  for slot in 1..20 loop
    perform pg_temp.assert_true((select to_jsonb(s)->>('photo' || slot || '_url') = request->>('photo' || slot || '_url')
      from public.submissions s where s.id=result_id), 'URL-only typed slot retained: ' || slot);
  end loop;
end $$;

-- Signed URL renewal cannot alter logical retry identity; paths are durable.
select public.submit_report_v1(report || '{
 "id":"30000000-0000-4000-8000-000000000004",
 "on_shelf":"28",
 "photo1_path":"teams/20000000-0000-4000-8000-000000000001/submissions/30000000-0000-4000-8000-000000000004/photo1.jpg",
 "photo1_url":"https://example.invalid/expired"
}', '[]') from payload;
select public.submit_report_v1(report || '{
 "id":"30000000-0000-4000-8000-000000000004",
 "on_shelf":"28",
 "photo1_path":"teams/20000000-0000-4000-8000-000000000001/submissions/30000000-0000-4000-8000-000000000004/photo1.jpg",
 "photo1_url":"https://example.invalid/renewed"
}', '[]') from payload;
select pg_temp.assert_true((select user_id=auth.uid() and created_by=auth.uid() and photo1_url is null and on_shelf='28'
 from public.submissions where id='30000000-0000-4000-8000-000000000004'), 'explicit ownership, text count, canonical URL');
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.expect_error($q$select public.submit_report_v1(report, products) from payload$q$, '42501');
reset role;
rollback;
\echo 'RPC local tests passed; fixtures rolled back'

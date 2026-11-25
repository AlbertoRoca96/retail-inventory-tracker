// Embedded PostgreSQL smoke test. No network/production connection exists.
// This approximates the app schema/RLS; it does NOT validate live schema drift.
// Set PGLITE_MODULE to a locally installed @electric-sql/pglite module URL.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

if (!process.env.PGLITE_MODULE) {
  throw new Error('Set PGLITE_MODULE to an installed PGlite module file URL.');
}
const { PGlite } = await import(process.env.PGLITE_MODULE);
const db = new PGlite(); // In-memory only, deliberately no external URI.
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema public, auth to authenticated, anon;
    create table public.teams (id uuid primary key, name text not null);
    create table public.team_members (
      team_id uuid references public.teams(id), user_id uuid, is_admin boolean,
      primary key(team_id,user_id)
    );
    create table public.submissions (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz default now(), user_id uuid not null, group_id uuid, created_by uuid,
      team_id uuid not null references public.teams(id),
      status text not null, date date not null, store_site text,
      store_location text not null, location text, brand text, conditions text,
      price_per_unit numeric(10,2), shelf_space text, on_shelf text,
      tags text[] not null default '{}', notes text,
      priority_level integer check(priority_level between 1 and 3),
      ${Array.from({ length: 6 }, (_, i) => `photo${i + 1}_path text, photo${i + 1}_url text`).join(',')}
    );
    alter table public.submissions enable row level security;
    create policy submission_read_fixture on public.submissions for select to authenticated
      using(exists(select 1 from public.team_members m where m.team_id=submissions.team_id and m.user_id=auth.uid()));
    create policy submission_insert_fixture on public.submissions for insert to authenticated
      with check(created_by=auth.uid() and exists(select 1 from public.team_members m where m.team_id=submissions.team_id and m.user_id=auth.uid()));
    create policy submission_update_fixture on public.submissions for update to authenticated
      using(created_by=auth.uid() or exists(select 1 from public.team_members m where m.team_id=submissions.team_id and m.user_id=auth.uid() and m.is_admin))
      with check(exists(select 1 from public.team_members m where m.team_id=submissions.team_id and m.user_id=auth.uid()));
    grant select on public.teams,public.team_members to authenticated;
    grant select,insert,update,delete on public.submissions to authenticated;
  `);
  await db.exec(await readFile(new URL('../migrations/20261103030000_reports_integration_v1.sql', import.meta.url), 'utf8'));
  await db.exec('grant select,insert,update,delete on public.submission_products to authenticated;');
  await db.exec(await readFile(new URL('../migrations/20261103035000_report_twenty_photos.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../migrations/20261103040000_reports_backend_integration.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../migrations/20261103050000_report_write_integrity.sql', import.meta.url), 'utf8'));
  const source = await readFile(new URL('./rpc.local-test.sql', import.meta.url), 'utf8');
  // Remove psql-only disposable-database guard: this runner creates memory-only DB.
  const sql = source.slice(source.indexOf('begin;'), source.indexOf("\\echo 'RPC local tests passed"));
  assert(sql.trimEnd().endsWith('rollback;'));
  await db.exec(sql);
  const { rows } = await db.query('select count(*)::int as count from public.submissions');
  assert.equal(rows[0].count, 0, 'fixtures must roll back');
  console.log('PASS: embedded PostgreSQL migrations + RPC/RLS fixtures, rollback verified.');
  console.log('Still required: real target schema, PostgREST/Deno and concurrent-session tests.');
} catch (error) {
  console.error('Embedded database test failed:', error.message);
  if (error.code) console.error('SQLSTATE:', error.code);
  if (error.internalQuery) console.error('Query:', error.internalQuery);
  process.exitCode = 1;
} finally {
  await db.close();
}

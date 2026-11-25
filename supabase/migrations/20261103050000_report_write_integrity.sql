-- LOCAL PROPOSAL. Review against legacy triggers/RLS before production application.
-- Protect direct authenticated table writes, not just the submission RPC.
begin;
create function public.guard_report_write_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  caller uuid := auth.uid();
  slot integer;
  path text;
  old_path text;
begin
  -- Trusted administrative backfills remain explicit privileged operations.
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  if caller is null then
    raise exception 'Authenticated report author required' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if (new.user_id is not null and new.user_id <> caller)
       or (new.created_by is not null and new.created_by <> caller) then
      raise exception 'Report ownership cannot be spoofed' using errcode = '42501';
    end if;
    new.user_id := caller;
    new.created_by := caller;
  elsif new.user_id is distinct from old.user_id
        or new.created_by is distinct from old.created_by then
    raise exception 'Report ownership is immutable' using errcode = '42501';
  end if;
  if not exists (select 1 from public.team_members
    where team_id = new.team_id and user_id = caller) then
    raise exception 'Report team membership required' using errcode = '42501';
  end if;
  for slot in 1..20 loop
    path := to_jsonb(new)->>('photo' || slot || '_path');
    old_path := case when tg_op = 'UPDATE' then to_jsonb(old)->>('photo' || slot || '_path') else null end;
    if path is not null and (tg_op = 'INSERT' or path is distinct from old_path or new.team_id is distinct from old.team_id) then
      if path !~ ('^teams/' || new.team_id::text || '/submissions/' || new.id::text ||
        '/photo' || slot::text || '(-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?[.](jpg|jpeg|png|heic|heif|webp)$') then
        raise exception 'Invalid report-bound photo path' using errcode = '22023';
      end if;
    end if;
  end loop;
  return new;
end;
$$;
-- Prefix sorts after existing legacy BEFORE ownership-fill triggers.
create trigger zz_report_write_integrity_v1
before insert or update on public.submissions
for each row execute function public.guard_report_write_v1();
revoke all on function public.guard_report_write_v1() from public, anon, authenticated;
commit;

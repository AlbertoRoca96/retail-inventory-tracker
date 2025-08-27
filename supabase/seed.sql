-- TEAM A with four test users.
-- This script is idempotent and only links users that already exist in auth.users by email.
-- Adjust emails if needed.

-- 1) Ensure team exists
insert into public.teams (name)
values ('TEAM A')
on conflict (name) do nothing;

-- 2) Look up the team id
with t as (
  select id from public.teams where name = 'TEAM A' limit 1
)
-- 3) Upsert team members if the users exist in auth
-- You can create users separately (Auth UI or CLI). Then re-run this seed.
, u as (
  select
    (select id from t) as team_id,
    au.id as user_id,
    au.email,
    case
      when au.email ilike 'austin%@%' then true
      when au.email ilike 'bob%@%'    then true
      else false
    end as is_admin,
    case
      when au.email ilike 'austin%@%' then 'Austin Carlson'
      when au.email ilike 'travis%@%' then 'Travis Carlson'
      when au.email ilike 'shawn%@%'  then 'Shawn Carlson'
      when au.email ilike 'bob%@%'    then 'Bob Carlson'
      else coalesce(au.raw_user_meta_data->>'display_name', split_part(au.email,'@',1))
    end as display_name
  from auth.users au
  where au.email in (
    'austin@team-a.test',
    'travis@team-a.test',
    'shawn@team-a.test',
    'bob@team-a.test'
  )
)
insert into public.team_members (team_id, user_id, is_admin)
select team_id, user_id, is_admin from u
on conflict (team_id, user_id) do update set is_admin = excluded.is_admin;

-- 4) Update display names/avatars in user metadata (if records exist)
do $$
declare
  r record;
begin
  for r in
    select * from (
      select
        au.id,
        au.raw_user_meta_data,
        (case
           when au.email ilike 'austin%@%' then 'Austin Carlson'
           when au.email ilike 'travis%@%' then 'Travis Carlson'
           when au.email ilike 'shawn%@%'  then 'Shawn Carlson'
           when au.email ilike 'bob%@%'    then 'Bob Carlson'
           else split_part(au.email,'@',1)
         end) as display_name
      from auth.users au
      where au.email in ('austin@team-a.test','travis@team-a.test','shawn@team-a.test','bob@team-a.test')
    ) s
  loop
    update auth.users
       set raw_user_meta_data = coalesce(r.raw_user_meta_data,'{}'::jsonb)
                                 || jsonb_build_object('display_name', r.display_name)
                                 || jsonb_build_object('avatar_url', 'https://i.pravatar.cc/150?u='||r.id)
     where id = r.id;
  end loop;
end$$;

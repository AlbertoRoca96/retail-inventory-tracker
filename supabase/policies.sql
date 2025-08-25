-- Enable RLS
alter table public.teams        enable row level security;
alter table public.team_members enable row level security;
alter table public.submissions  enable row level security;

-- Lightweight view used by policies
create or replace view public.v_user_teams as
  select tm.team_id, tm.user_id, tm.is_admin
  from public.team_members tm;

-- Teams: members can read the teams they belong to
drop  policy if exists "team members can view their teams" on public.teams;
create policy     "team members can view their teams"
on public.teams
for select
to authenticated
using (
  exists (
    select 1 from public.v_user_teams v
    where v.team_id = teams.id and v.user_id = auth.uid()
  )
);

-- Membership: members can read
drop  policy if exists "members can read member list" on public.team_members;
create policy     "members can read member list"
on public.team_members
for select
to authenticated
using (
  team_id in (select team_id from public.v_user_teams where user_id = auth.uid())
);

-- Membership: admins manage
drop  policy if exists "admins can manage membership" on public.team_members;
create policy     "admins can manage membership"
on public.team_members
for all
to authenticated
using (
  exists (
    select 1
    from public.v_user_teams v
    where v.team_id = team_members.team_id
      and v.user_id = auth.uid()
      and v.is_admin
  )
);

-- Submissions: members can read submissions for their teams
drop  policy if exists "members can read team submissions" on public.submissions;
create policy     "members can read team submissions"
on public.submissions
for select
to authenticated
using (
  team_id in (select team_id from public.v_user_teams where user_id = auth.uid())
);

-- Submissions: members can insert for their team
-- Allow client to omit created_by (trigger fills it). Still enforce that the
-- final row belongs to the caller and their team.
drop  policy if exists "members can insert for their team" on public.submissions;
create policy     "members can insert for their team"
on public.submissions
for insert
to authenticated
with check (
  team_id in (select team_id from public.v_user_teams where user_id = auth.uid())
  and coalesce(created_by, auth.uid()) = auth.uid()
);

-- Submissions: authors or admins can update
drop  policy if exists "authors or admins can update" on public.submissions;
create policy     "authors or admins can update"
on public.submissions
for update
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1 from public.v_user_teams v
    where v.team_id = submissions.team_id
      and v.user_id = auth.uid()
      and v.is_admin
  )
)
with check (
  -- prevent privilege escalation / team hopping on update
  team_id in (select team_id from public.v_user_teams where user_id = auth.uid())
);

-- Submissions: authors or admins can delete
drop  policy if exists "authors or admins can delete" on public.submissions;
create policy     "authors or admins can delete"
on public.submissions
for delete
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1 from public.v_user_teams v
    where v.team_id = submissions.team_id
      and v.user_id = auth.uid()
      and v.is_admin
  )
);

-- Enable RLS
alter table public.teams        enable row level security;
alter table public.team_members enable row level security;
alter table public.submissions  enable row level security;
alter table public.submission_messages enable row level security;

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

-- ========== Submission Messages RLS ==========

-- Messages: team members can read messages for their team
-- Team members can see all messages about submissions they can access
drop  policy if exists "team members can read team messages" on public.submission_messages;
create policy     "team members can read team messages"
on public.submission_messages
for select
to authenticated
using (
  -- Must be a team member and either:
  -- 1) Message is about a submission they can see, or
  -- 2) Message is internal (team-level) for their team
  team_id in (select team_id from public.v_user_teams where user_id = auth.uid())
  and (
    -- Team members can see messages about submissions they can read
    exists (
      select 1 from public.submissions s
      where s.id = submission_messages.submission_id
        and s.team_id in (select team_id from public.v_user_teams where user_id = auth.uid())
    )
    -- All team members can see internal team messages
    or is_internal = true
  )
  -- Only non-deleted messages
  and deleted_at is null
);

-- Messages: team members can insert messages
-- Users can create messages about their team's submissions or internal team messages
drop  policy if exists "team members can insert messages" on public.submission_messages;
create policy     "team members can insert messages"
on public.submission_messages
for insert
to authenticated
with check (
  -- Must be for their team
  team_id in (select team_id from public.v_user_teams where user_id = auth.uid())
  -- Must be the sender
  and sender_id = auth.uid()
  -- Either message is internal or about a submission they can access
  and (
    is_internal = true
    or exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and team_id in (select team_id from public.v_user_teams where user_id = auth.uid())
    )
  )
);

-- Messages: senders can update their own messages
drop  policy if exists "senders can update own messages" on public.submission_messages;
create policy     "senders can update own messages"
on public.submission_messages
for update
to authenticated
using (
  sender_id = auth.uid()
  and deleted_at is null
)
with check (
  sender_id = auth.uid()
  and deleted_at is null
);

-- Messages: senders or admins can delete (soft delete)
drop  policy if exists "senders or admins can delete messages" on public.submission_messages;
create policy     "senders or admins can delete messages"
on public.submission_messages
for update
to authenticated
using (
  -- Original sender can delete their own messages
  sender_id = auth.uid()
  -- Team admins can delete any team message
  or exists (
    select 1 from public.v_user_teams v
    where v.team_id = submission_messages.team_id
      and v.user_id = auth.uid()
      and v.is_admin
  )
)
with check (
  -- Only update to set deleted_at (soft delete)
  deleted_at is not null
);

-- Create direct messages table used by the mobile app.
-- Fixes: "could not find the table 'public.direct_messages' in the schema cache".

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  team_id uuid not null references public.teams(id) on delete cascade,
  sender_id uuid not null,
  recipient_id uuid not null,

  body text not null default '',
  attachment_url text,
  attachment_type text
);

create index if not exists direct_messages_team_created_idx
  on public.direct_messages(team_id, created_at);

create index if not exists direct_messages_participants_idx
  on public.direct_messages(team_id, sender_id, recipient_id);

alter table public.direct_messages enable row level security;

-- SELECT: only participants who are members of the team.
drop policy if exists "dm_select_participants" on public.direct_messages;
create policy "dm_select_participants"
  on public.direct_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.team_members tm
      where tm.team_id = direct_messages.team_id
        and tm.user_id = auth.uid()
    )
    and (sender_id = auth.uid() or recipient_id = auth.uid())
  );

-- INSERT: only the authenticated sender, and only within their team.
drop policy if exists "dm_insert_sender" on public.direct_messages;
create policy "dm_insert_sender"
  on public.direct_messages
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.team_members tm
      where tm.team_id = direct_messages.team_id
        and tm.user_id = auth.uid()
    )
    and sender_id = auth.uid()
  );

-- UPDATE: only the sender can update their message.
drop policy if exists "dm_update_sender" on public.direct_messages;
create policy "dm_update_sender"
  on public.direct_messages
  for update
  to authenticated
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

-- DELETE: only the sender can delete their message.
drop policy if exists "dm_delete_sender" on public.direct_messages;
create policy "dm_delete_sender"
  on public.direct_messages
  for delete
  to authenticated
  using (sender_id = auth.uid());

-- Enable realtime subscriptions for this table.
-- Supabase Realtime uses the supabase_realtime publication.
do $$
begin
  alter publication supabase_realtime add table public.direct_messages;
exception
  when duplicate_object then
    null;
end $$;

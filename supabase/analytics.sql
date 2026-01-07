-- Ensure we’re in public unless overridden by caller tooling
set local search_path = public;

-- ========== Monthly counts with cumulative (end-exclusive) ==========
create or replace function public.submissions_monthly_counts(
  p_start  date,
  p_end    date,
  p_user_id uuid default null,
  p_team_id uuid default null
)
returns table (
  month_start date,
  submitted   integer,
  cumulative  integer
)
language sql
stable
as $$
  with months as (
    select generate_series(
      date_trunc('month', p_start)::date,
      date_trunc('month', (p_end - interval '1 day'))::date,
      interval '1 month'
    )::date as m
  ),
  counts as (
    select
      m.m::date as month_start,
      count(s.*)::int as submitted
    from months m
    left join public.submissions s
      on s.created_at >= m.m
     and s.created_at <  (m.m + interval '1 month')
     and (p_user_id is null or s.created_by = p_user_id)
     and (p_team_id is null or s.team_id   = p_team_id)
    group by m.m
    order by m.m
  )
  select
    c.month_start,
    c.submitted,
    sum(c.submitted) over (order by c.month_start rows between unbounded preceding and current row)::int as cumulative
  from counts c
  order by c.month_start;
$$;

comment on function public.submissions_monthly_counts(p_start date, p_end date, p_user_id uuid, p_team_id uuid)
is 'Monthly submission counts (and cumulative) between dates; end-exclusive. Optional filters by user/team. RLS enforced.';

-- ========== Daily counts (end-exclusive) ==========
create or replace function public.submissions_daily_counts(
  p_start  date,
  p_end    date,          -- end-exclusive
  p_user_id uuid default null,
  p_team_id uuid default null
)
returns table (
  day date,
  submitted integer
)
language sql
stable
as $$
  with days as (
    select generate_series(
      p_start,
      (p_end - interval '1 day'),
      interval '1 day'
    )::date as d
  )
  select
    d.d as day,
    (
      select count(*)::int
      from public.submissions s
      where s.created_at >= d.d
        and s.created_at <  (d.d + interval '1 day')
        and (p_user_id is null or s.created_by = p_user_id)
        and (p_team_id is null or s.team_id   = p_team_id)
    ) as submitted
  from days d
  order by d.d;
$$;

-- ========== YTD total ==========
create or replace function public.submissions_ytd_total(
  p_as_of  date default (current_date),
  p_user_id uuid default null,
  p_team_id uuid default null
)
returns integer
language sql
stable
as $$
  select count(*)::int
  from public.submissions s
  where s.created_at >= date_trunc('year', p_as_of)::date
    and s.created_at <  (p_as_of + interval '1 day')
    and (p_user_id is null or s.created_by = p_user_id)
    and (p_team_id is null or s.team_id   = p_team_id);
$$;

-- ========== Arbitrary range total (end-exclusive) ==========
create or replace function public.submissions_range_total(
  p_start  date,
  p_end    date,
  p_user_id uuid default null,
  p_team_id uuid default null
)
returns integer
language sql
stable
as $$
  select count(*)::int
  from public.submissions s
  where s.created_at >= p_start
    and s.created_at <  (p_end + interval '0 day')   -- p_end is end-exclusive
    and (p_user_id is null or s.created_by = p_user_id)
    and (p_team_id is null or s.team_id   = p_team_id);
$$;

-- ========== Team users with display names (for the User dropdown) ==========
-- Returns members of p_team_id only if the caller belongs to that team.
create or replace function public.team_users_with_names(p_team_id uuid)
returns table (
  user_id uuid,
  display_name text,
  email text
)
language sql
security definer
set search_path = public
as $$
  select
    tm.user_id,
    coalesce(
      nullif(btrim((u.user_metadata->>'display_name')), ''),
      nullif(btrim((u.user_metadata->>'full_name')), ''),
      nullif(btrim((u.raw_user_meta_data->>'display_name')), ''),
      nullif(btrim((u.raw_user_meta_data->>'full_name')), ''),
      split_part(u.email, '@', 1),     -- fallback to left part of email
      u.email                           -- final fallback
    ) as display_name,
    u.email
  from public.team_members tm
  join auth.users u on u.id = tm.user_id
  where tm.team_id = p_team_id
    and exists (
      select 1
      from public.team_members me
      where me.team_id = p_team_id
        and me.user_id = auth.uid()
    )
  order by display_name nulls last, email;
$$;

grant execute on function public.team_users_with_names(uuid) to authenticated;

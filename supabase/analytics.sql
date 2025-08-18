-- supabase/analytics.sql
-- Time-bucketed analytics that respect existing RLS (functions run with invoker rights).

-- Helpful: ensure search_path is sane
set local search_path = public;

-- ========== Monthly counts with cumulative ==========
-- Returns one row per calendar month between p_start and p_end (inclusive of start, exclusive of end+1month boundary).
-- Optional filters: p_user (created_by) and p_team (team_id).
create or replace function public.submissions_monthly_counts(
  p_start date,
  p_end   date,
  p_user  uuid default null,
  p_team  uuid default null
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
    select generate_series(date_trunc('month', p_start)::date,
                           date_trunc('month', p_end)::date,
                           interval '1 month')::date as m
  ),
  counts as (
    select
      m.m::date as month_start,
      count(s.*)::int as submitted
    from months m
    left join public.submissions s
      on s.created_at >= m.m
     and s.created_at < (m.m + interval '1 month')
     and (p_user is null or s.created_by = p_user)
     and (p_team is null or s.team_id   = p_team)
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

comment on function public.submissions_monthly_counts(p_start date, p_end date, p_user uuid, p_team uuid)
is 'Monthly submission counts (and cumulative) between two dates, filtered by optional user/team. RLS enforced by invoker rights.';

-- ========== Daily counts ==========
-- Returns one row per day between p_start and p_end (inclusive of start, inclusive of end).
create or replace function public.submissions_daily_counts(
  p_start date,
  p_end   date,
  p_user  uuid default null,
  p_team  uuid default null
)
returns table (
  day date,
  submitted integer
)
language sql
stable
as $$
  with days as (
    select generate_series(p_start, p_end, interval '1 day')::date as d
  )
  select
    d.d as day,
    (
      select count(*)::int
      from public.submissions s
      where s.created_at >= d.d
        and s.created_at < (d.d + interval '1 day')
        and (p_user is null or s.created_by = p_user)
        and (p_team is null or s.team_id   = p_team)
    ) as submitted
  from days d
  order by d.d;
$$;

-- ========== YTD total (as of any date) ==========
create or replace function public.submissions_ytd_total(
  p_as_of date default (current_date),
  p_user  uuid default null,
  p_team  uuid default null
)
returns integer
language sql
stable
as $$
  select count(*)::int
  from public.submissions s
  where s.created_at >= date_trunc('year', p_as_of)::date
    and s.created_at <  (p_as_of + interval '1 day')
    and (p_user is null or s.created_by = p_user)
    and (p_team is null or s.team_id   = p_team);
$$;

-- ========== Arbitrary date-range total ==========
create or replace function public.submissions_range_total(
  p_start date,
  p_end   date,
  p_user  uuid default null,
  p_team  uuid default null
)
returns integer
language sql
stable
as $$
  select count(*)::int
  from public.submissions s
  where s.created_at >= p_start
    and s.created_at <  (p_end + interval '1 day')
    and (p_user is null or s.created_by = p_user)
    and (p_team is null or s.team_id   = p_team);
$$;

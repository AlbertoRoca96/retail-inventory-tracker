import { supabase } from './supabase';

export type MonthlyRow = { month_start: string; submitted: number; cumulative: number };
export type DailyRow   = { day: string; submitted: number };

type Filters = { userId?: string | null; teamId?: string | null };

const toDate = (d: string | Date) =>
  (typeof d === 'string' ? d : new Date(d).toISOString().slice(0, 10));

/** Monthly bucket counts (cumulative included). */
export async function getMonthlyCounts(
  start: string | Date,
  end: string | Date,
  filters: Filters = {}
): Promise<MonthlyRow[]> {
  const { data, error } = await supabase.rpc('submissions_monthly_counts', {
    p_start:   toDate(start),
    p_end:     toDate(end),
    p_user_id: filters.userId ?? null,
    p_team_id: filters.teamId ?? null,
  });
  if (error) throw error;
  return (data || []) as MonthlyRow[];
}

/** Daily counts for a range (end-exclusive). */
export async function getDailyCounts(
  start: string | Date,
  end: string | Date,
  filters: Filters = {}
): Promise<DailyRow[]> {
  const { data, error } = await supabase.rpc('submissions_daily_counts', {
    p_start:   toDate(start),
    p_end:     toDate(end),
    p_user_id: filters.userId ?? null,
    p_team_id: filters.teamId ?? null,
  });
  if (error) throw error;
  return (data || []) as DailyRow[];
}

/** YTD total as of a given day. */
export async function getYTDTotal(
  asOf: string | Date,
  filters: Filters = {}
): Promise<number> {
  const { data, error } = await supabase.rpc('submissions_ytd_total', {
    p_as_of:   toDate(asOf),
    p_user_id: filters.userId ?? null,
    p_team_id: filters.teamId ?? null,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

/** Optional: total across an arbitrary range (end-exclusive). */
export async function getRangeTotal(
  start: string | Date,
  end: string | Date,
  filters: Filters = {}
): Promise<number> {
  const { data, error } = await supabase.rpc('submissions_range_total', {
    p_start:   toDate(start),
    p_end:     toDate(end),
    p_user_id: filters.userId ?? null,
    p_team_id: filters.teamId ?? null,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

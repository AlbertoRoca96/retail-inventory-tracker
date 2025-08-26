// apps/mobile/src/lib/analytics.ts
import { supabase } from './supabase';

export type MonthlyRow = { month_start: string; submitted: number; cumulative: number };
export type DailyRow   = { day: string; submitted: number };

type Filters = { userId?: string | null; teamId?: string | null };

/** Normalize Date or string to a YYYY-MM-DD (UTC) date string. */
const toDate = (d: string | Date) =>
  (typeof d === 'string' ? d : new Date(d).toISOString().slice(0, 10));

/**
 * Monthly bucket counts (cumulative included).
 * Mirrors public.submissions_monthly_counts(p_start, p_end, p_team_id, p_user_id?)
 * Range is [p_start, p_end) — end-exclusive.
 */
export async function getMonthlyCounts(
  start: string | Date,
  end: string | Date,
  filters: Filters = {}
): Promise<MonthlyRow[]> {
  const { data, error } = await supabase.rpc('submissions_monthly_counts', {
    p_start:   toDate(start),
    p_end:     toDate(end),
    p_team_id: filters.teamId ?? null,
    p_user_id: filters.userId ?? null,
  });
  if (error) throw error;
  return (data || []) as MonthlyRow[];
}

/**
 * Daily counts for a range.
 * Mirrors public.submissions_daily_counts(p_start, p_end, p_team_id, p_user_id?)
 * Range is [p_start, p_end) — end-exclusive.
 */
export async function getDailyCounts(
  start: string | Date,
  end: string | Date,
  filters: Filters = {}
): Promise<DailyRow[]> {
  const { data, error } = await supabase.rpc('submissions_daily_counts', {
    p_start:   toDate(start),
    p_end:     toDate(end),
    p_team_id: filters.teamId ?? null,
    p_user_id: filters.userId ?? null,
  });
  if (error) throw error;
  return (data || []) as DailyRow[];
}

/**
 * YTD total as of a given day.
 * Mirrors public.submissions_ytd_total(p_as_of, p_team_id, p_user_id?)
 * Range is Jan 1..(p_as_of end-exclusive of next day internally).
 */
export async function getYTDTotal(
  asOf: string | Date,
  filters: Filters = {}
): Promise<number> {
  const { data, error } = await supabase.rpc('submissions_ytd_total', {
    p_as_of:   toDate(asOf),
    p_team_id: filters.teamId ?? null,
    p_user_id: filters.userId ?? null,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

/**
 * Optional helper if you add/keep a “range total” RPC.
 * (Safe to keep even if unused; it won’t run unless called.)
 * Expected signature: submissions_range_total(p_start, p_end, p_team_id, p_user_id?)
 */
export async function getRangeTotal(
  start: string | Date,
  end: string | Date,
  filters: Filters = {}
): Promise<number> {
  const { data, error } = await supabase.rpc('submissions_range_total', {
    p_start:   toDate(start),
    p_end:     toDate(end),
    p_team_id: filters.teamId ?? null,
    p_user_id: filters.userId ?? null,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

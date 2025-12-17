import { supabase } from './supabase';

export type MonthlyRow = { month_start: string; submitted: number; cumulative: number };
export type DailyRow = { day: string; submitted: number };

type Filters = { userId?: string | null; teamId?: string | null };

const toISODate = (d: string | Date) => (typeof d === 'string' ? d : new Date(d).toISOString().slice(0, 10));

async function fetchSubmissionsInRange(start: string | Date, end: string | Date, filters: Filters) {
  const startIso = `${toISODate(start)}T00:00:00Z`;
  const endIso = `${toISODate(end)}T23:59:59Z`;
  let query = supabase
    .from('submissions')
    .select('id, created_at, created_by, team_id')
    .gte('created_at', startIso)
    .lte('created_at', endIso);
  if (filters.teamId) query = query.eq('team_id', filters.teamId);
  if (filters.userId) query = query.eq('created_by', filters.userId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getMonthlyCounts(start: string | Date, end: string | Date, filters: Filters = {}): Promise<MonthlyRow[]> {
  const rows = await fetchSubmissionsInRange(start, end, filters);
  const buckets = new Map<string, number>();
  rows.forEach((row) => {
    const month = new Date(row.created_at).toISOString().slice(0, 7) + '-01';
    buckets.set(month, (buckets.get(month) || 0) + 1);
  });
  const sortedMonths = Array.from(buckets.keys()).sort();
  let running = 0;
  return sortedMonths.map((month) => {
    const submitted = buckets.get(month) || 0;
    running += submitted;
    return { month_start: month, submitted, cumulative: running };
  });
}

export async function getDailyCounts(start: string | Date, end: string | Date, filters: Filters = {}): Promise<DailyRow[]> {
  const rows = await fetchSubmissionsInRange(start, end, filters);
  const buckets = new Map<string, number>();
  rows.forEach((row) => {
    const day = new Date(row.created_at).toISOString().slice(0, 10);
    buckets.set(day, (buckets.get(day) || 0) + 1);
  });
  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, submitted]) => ({ day, submitted }));
}

export async function getYTDTotal(asOf: string | Date, filters: Filters = {}): Promise<number> {
  const date = typeof asOf === 'string' ? new Date(asOf) : asOf;
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const rows = await fetchSubmissionsInRange(yearStart, date, filters);
  return rows.length;
}

export async function getRangeTotal(start: string | Date, end: string | Date, filters: Filters = {}): Promise<number> {
  const rows = await fetchSubmissionsInRange(start, end, filters);
  return rows.length;
}

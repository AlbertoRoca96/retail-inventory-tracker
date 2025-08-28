import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { getMonthlyCounts, getDailyCounts, getYTDTotal } from '../../src/lib/analytics';

type MonthRow = { month_start: string; submitted: number; cumulative: number };
type DayRow   = { day: string; submitted: number };

const isWeb = Platform.OS === 'web';

// ---- Date helpers ----
function toISO(d: Date) { return d.toISOString().slice(0, 10); }
function monthStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function nextMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 1); }
function tomorrow(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); }

// UTC month label formatter so YYYY-MM-01 stays that day in any timezone
const monthFmtUTC = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

// Simple CSV helper (web)
function downloadCSV(filename: string, rows: string[][]) {
  if (!isWeb) return;
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 400);
}

type TeamOpt = { id: string; name: string; contract_start_date: string | null };
type UserOpt = { id: string; label: string };

export default function AdminMetrics() {
  const { session, ready } = useAuth();
  const me = session?.user?.id ?? null;

  // Teams you admin
  const [adminTeams, setAdminTeams] = useState<TeamOpt[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null); // null = all my teams

  // For month index labels when a single team is selected
  const contractStart = useMemo(
    () => adminTeams.find((t) => t.id === teamId)?.contract_start_date ?? null,
    [teamId, adminTeams]
  );

  // User filter options for the selected team
  const [userFilter, setUserFilter] = useState<string | null>(null); // null => All users
  const [teamUsers, setTeamUsers] = useState<UserOpt[]>([]);

  // Date range (UI)
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd,   setRangeEnd]   = useState<string | null>(null);

  // Data
  const [loading, setLoading] = useState(true);
  const [monthly, setMonthly] = useState<MonthRow[]>([]);
  const [daily,   setDaily]   = useState<DayRow[]>([]);
  const [ytd,     setYtd]     = useState<number>(0);

  // Bootstrap: load teams I admin + default date range
  useEffect(() => {
    (async () => {
      if (!ready || !me) return;
      setLoading(true);

      // All teams where I'm admin (name + contract start)
      const { data: rows } = await supabase
        .from('team_members')
        .select('team_id, is_admin, teams(name, contract_start_date)')
        .eq('user_id', me)
        .eq('is_admin', true);

      const teams: TeamOpt[] = (rows || []).map((r: any) => ({
        id: r.team_id,
        name: r.teams?.name ?? '(unnamed team)',
        contract_start_date: r.teams?.contract_start_date ?? null,
      }));

      setAdminTeams(teams);

      // Default selection: if exactly one team, select it; otherwise let “All my teams”
      const picked = teams.length === 1 ? teams[0].id : null;
      setTeamId(picked);

      // Seed date range: contract start if a single team is selected, else current year
      const now = new Date();
      const cStart = picked
        ? (teams.find(t => t.id === picked)?.contract_start_date ?? `${now.getFullYear()}-01-01`)
        : `${now.getFullYear()}-01-01`;
      setRangeStart(cStart);
      setRangeEnd(toISO(nextMonth(now)));

      setLoading(false);
    })();
  }, [ready, me]);

  // Load users (display names) for the selected team
  useEffect(() => {
    (async () => {
      setUserFilter(null); // reset whenever team changes
      setTeamUsers([]);
      if (!teamId) return; // “All my teams” → no per-team user list

      // Uses the security-definer RPC below
      const { data, error } = await supabase.rpc('team_users_with_names', { p_team_id: teamId });
      if (!error && data) {
        const opts: UserOpt[] = [{ id: '', label: 'All users' }].concat(
          (data as any[]).map((u) => ({
            id: u.user_id,
            label: u.display_name || u.email || u.user_id,
          }))
        );
        setTeamUsers(opts);
      }
    })();
  }, [teamId]);

  // Load metrics whenever filters/range change
  useEffect(() => {
    (async () => {
      if (!rangeStart || !rangeEnd) return;
      setLoading(true);

      const filters = { teamId: teamId || null, userId: userFilter || null };

      // Monthly respects UI range; Daily shows current month through “tomorrow” (end-exclusive).
      const now = new Date();
      const [m, d, totalYtd] = await Promise.all([
        getMonthlyCounts(rangeStart, rangeEnd, filters),
        getDailyCounts(monthStart(now), tomorrow(now), filters),
        getYTDTotal(now, filters),
      ]);

      setMonthly(m);
      setDaily(d);
      setYtd(totalYtd);
      setLoading(false);
    })();
  }, [teamId, rangeStart, rangeEnd, userFilter]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!me) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Signed out.</Text>
      </View>
    );
  }

  const monthIndex = (s: string) => {
    if (!contractStart) return null;
    const a = new Date(contractStart);
    const b = new Date(s);
    return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8 }}>Metrics</Text>

        {/* Controls */}
        <View style={{ gap: 10 as any, marginBottom: 12 }}>
          {/* Team filter */}
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Text>Team:</Text>
            {isWeb ? (
              <select
                value={teamId ?? ''}
                onChange={(e) => setTeamId(e.currentTarget.value || null)}
              >
                <option value="">{adminTeams.length > 1 ? 'All my teams' : (adminTeams[0]?.name ?? 'My team')}</option>
                {adminTeams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            ) : (
              <Text>{adminTeams.find(t => t.id === teamId)?.name ?? 'All my teams'}</Text>
            )}
          </View>

          {/* Date range */}
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Text>Start:</Text>
            {isWeb ? (
              <input
                type="date"
                value={rangeStart ?? ''}
                onChange={(e) => setRangeStart(e.currentTarget.value)}
              />
            ) : (
              <Text>{rangeStart}</Text>
            )}
            <Text>End:</Text>
            {isWeb ? (
              <input
                type="date"
                value={rangeEnd ?? ''}
                onChange={(e) => setRangeEnd(e.currentTarget.value)}
              />
            ) : (
              <Text>{rangeEnd}</Text>
            )}
          </View>

          {/* User filter (only when a single team is chosen) */}
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Text>User:</Text>
            {isWeb ? (
              <select
                disabled={!teamId}
                value={userFilter ?? ''}
                onChange={(e) => setUserFilter(e.currentTarget.value || null)}
              >
                {(teamUsers.length ? teamUsers : [{ id: '', label: 'All users' }]).map((u) => (
                  <option key={u.id || 'all'} value={u.id}>{u.label}</option>
                ))}
              </select>
            ) : (
              <Text>{teamId ? (teamUsers.find(u => u.id === (userFilter ?? ''))?.label ?? 'All users') : 'All users'}</Text>
            )}
          </View>
        </View>

        {loading ? (
          <ActivityIndicator />
        ) : (
          <View style={{ gap: 12 as any }}>
            {/* 1) YTD */}
            <View style={{ padding: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8 }}>
              <Text style={{ fontWeight: '700' }}>YTD total (as of today)</Text>
              <Text style={{ fontSize: 18 }}>{ytd} submissions</Text>
            </View>

            {/* 2) Monthly buckets + cumulative */}
            <View style={{ padding: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8 }}>
              <Text style={{ fontWeight: '700', marginBottom: 6 }}>Monthly</Text>
              {monthly.length === 0 ? (
                <Text>No data in range.</Text>
              ) : (
                monthly.map((r) => {
                  const idx = monthIndex(r.month_start);
                  const label =
                    idx != null
                      ? `Month ${idx}`
                      : monthFmtUTC.format(new Date(`${r.month_start}T00:00:00Z`));
                  return (
                    <View
                      key={r.month_start}
                      style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}
                    >
                      <Text>
                        {label} ({r.month_start})
                      </Text>
                      <Text>
                        {r.submitted} (cumulative {r.cumulative})
                      </Text>
                    </View>
                  );
                })
              )}

              {/* CSV export (web) */}
              {isWeb && monthly.length ? (
                <Pressable
                  onPress={() =>
                    downloadCSV(
                      'monthly.csv',
                      [['month_start', 'submitted', 'cumulative']].concat(
                        monthly.map((r) => [r.month_start, String(r.submitted), String(r.cumulative)])
                      )
                    )
                  }
                  style={{ marginTop: 8, padding: 8, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6 }}
                >
                  <Text>Download Monthly CSV</Text>
                </Pressable>
              ) : null}
            </View>

            {/* 3) Current month daily (real-time) */}
            <View style={{ padding: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8 }}>
              <Text style={{ fontWeight: '700', marginBottom: 6 }}>This month (by day)</Text>
              {daily.length === 0 ? (
                <Text>No submissions yet this month.</Text>
              ) : (
                daily.map((r) => (
                  <View
                    key={r.day}
                    style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}
                  >
                    <Text>{r.day}</Text>
                    <Text>{r.submitted}</Text>
                  </View>
                ))
              )}

              {/* CSV export (web) */}
              {isWeb && daily.length ? (
                <Pressable
                  onPress={() =>
                    downloadCSV('daily.csv', [['day', 'submitted']].concat(daily.map((r) => [r.day, String(r.submitted)])))}
                  style={{ marginTop: 8, padding: 8, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6 }}
                >
                  <Text>Download Daily CSV</Text>
                </Pressable>
              ) : null}
            </View>

            <Pressable
              onPress={() => router.replace('/admin')}
              style={{ alignSelf: 'flex-start', marginTop: 4, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#6b7280', borderRadius: 10 }}
            >
              <Text style={{ color: 'white', fontWeight: '700' }}>Back</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { getMonthlyCounts, getDailyCounts, getYTDTotal } from '../../src/lib/analytics';

type MonthRow = { month_start: string; submitted: number; cumulative: number };
type DayRow   = { day: string; submitted: number };

const isWeb = Platform.OS === 'web';

function toISO(d: Date) { return d.toISOString().slice(0, 10); }
function monthStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function nextMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 1); }

// Simple CSV helper (web)
function downloadCSV(filename: string, rows: string[][]) {
  if (!isWeb) return;
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 400);
}

export default function AdminMetrics() {
  const { session, ready } = useAuth();

  // Team + contract baseline
  const [teamId, setTeamId] = useState<string | null>(null);
  const [contractStart, setContractStart] = useState<string | null>(null);

  // Filters
  const [userFilter, setUserFilter] = useState<string | null>(null); // null => All users
  const [teamUsers, setTeamUsers] = useState<{ id: string; label: string }[]>([]);

  // Date range (UI)
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd,   setRangeEnd]   = useState<string | null>(null);

  // Data
  const [loading, setLoading] = useState(true);
  const [monthly, setMonthly] = useState<MonthRow[]>([]);
  const [daily,   setDaily]   = useState<DayRow[]>([]);
  const [ytd,     setYtd]     = useState<number>(0);

  // Bootstrap: find an admin team and its contract_start_date, then seed the default range.
  useEffect(() => {
    (async () => {
      if (!ready || !session?.user) return;
      setLoading(true);

      const { data: tm } = await supabase
        .from('team_members')
        .select('team_id,is_admin')
        .eq('user_id', session.user.id)
        .eq('is_admin', true)
        .limit(1)
        .maybeSingle();

      const tid = tm?.team_id ?? null;
      setTeamId(tid);

      if (tid) {
        const { data: t } = await supabase
          .from('teams')
          .select('contract_start_date')
          .eq('id', tid)
          .maybeSingle();

        const cStart = (t?.contract_start_date as string) || null;
        setContractStart(cStart);

        const now = new Date();
        const start = cStart ? cStart : `${now.getFullYear()}-01-01`;
        const end = toISO(nextMonth(now));
        setRangeStart(start);
        setRangeEnd(end);
      }

      setLoading(false);
    })();
  }, [ready, session?.user?.id]);

  // Load team users (for the user filter)
  useEffect(() => {
    (async () => {
      if (!teamId) return;
      const { data, error } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', teamId);
      if (!error && data) {
        setTeamUsers([{ id: '', label: 'All users' }].concat(
          data.map((r) => ({ id: r.user_id, label: r.user_id }))
        ));
      }
    })();
  }, [teamId]);

  // Load metrics whenever filters/range change
  useEffect(() => {
    (async () => {
      if (!teamId || !rangeStart || !rangeEnd) return;
      setLoading(true);

      const filters = { teamId, userId: userFilter || null };

      const [m, d, totalYtd] = await Promise.all([
        getMonthlyCounts(rangeStart, rangeEnd, filters),
        getDailyCounts(
          toISO(monthStart(new Date())), // current month only
          toISO(new Date()),
          filters
        ),
        getYTDTotal(new Date(), filters),
      ]);

      setMonthly(m);
      setDaily(d);
      setYtd(totalYtd);
      setLoading(false);
    })();
  }, [teamId, rangeStart, rangeEnd, userFilter]);

  if (!ready)
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );

  if (!session?.user)
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Signed out.</Text>
      </View>
    );

  if (!teamId) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8 }}>Metrics</Text>
        <Text>You’re not an admin on any team.</Text>
        <Pressable
          onPress={() => router.replace('/menu')}
          style={{ marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: '#2563eb' }}
        >
          <Text style={{ color: 'white', fontWeight: '700' }}>Back to Menu</Text>
        </Pressable>
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
      {/* SCROLLABLE content so long lists don’t overflow */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8 }}>Metrics</Text>

        {/* Controls */}
        <View style={{ gap: 10 as any, marginBottom: 12 }}>
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

          {/* User filter */}
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Text>User:</Text>
            {isWeb ? (
              <select
                value={userFilter ?? ''}
                onChange={(e) => setUserFilter(e.currentTarget.value || null)}
              >
                {teamUsers.map((u) => (
                  <option key={u.id || 'all'} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            ) : (
              <Text>{userFilter ? userFilter : 'All users'}</Text>
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
                      : new Date(r.month_start).toLocaleDateString(undefined, {
                          month: 'short',
                          year: 'numeric',
                        });
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
                    downloadCSV(
                      'daily.csv',
                      [['day', 'submitted']].concat(daily.map((r) => [r.day, String(r.submitted)]))
                    )
                  }
                  style={{ marginTop: 8, padding: 8, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6 }}
                >
                  <Text>Download Daily CSV</Text>
                </Pressable>
              ) : null}
            </View>

            <Pressable
              onPress={() => router.replace('/admin')}
              style={{
                alignSelf: 'flex-start',
                marginTop: 4,
                paddingVertical: 10,
                paddingHorizontal: 14,
                backgroundColor: '#6b7280',
                borderRadius: 10,
              }}
            >
              <Text style={{ color: 'white', fontWeight: '700' }}>Back</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

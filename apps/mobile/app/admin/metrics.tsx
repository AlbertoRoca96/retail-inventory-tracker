import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, Platform, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { getMonthlyCounts, getDailyCounts, getYTDTotal } from '../../src/lib/analytics';
import { theme, colors, typography } from '../../src/theme';
import Button from '../../src/components/Button';

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

  // User options
  const [userFilter, setUserFilter] = useState<string | null>(null); // null => All users
  const [teamUsers, setTeamUsers] = useState<UserOpt[]>([]);         // members of selected team
  const [allUsers, setAllUsers] = useState<UserOpt[]>([]);           // union across all admin teams

  // Date range (UI)
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd,   setRangeEnd]   = useState<string | null>(null);

  // Data
  const [loading, setLoading] = useState(true);
  const [monthly, setMonthly] = useState<MonthRow[]>([]);
  const [daily,   setDaily]   = useState<DayRow[]>([]);
  const [ytd,     setYtd]     = useState<number>(0);

    const labelForUserId = (id: string) => (id ? `${id.slice(0, 8)}…` : 'User');

  // Load all teams I admin + default date range
  useEffect(() => {
    (async () => {
      if (!ready || !me) return;
      setLoading(true);

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

      // Default selection: if exactly one team, select it; else “All my teams”
      const picked = teams.length === 1 ? teams[0].id : null;
      setTeamId(picked);

      // Seed date range
      const now = new Date();
      const cStart = picked
        ? (teams.find(t => t.id === picked)?.contract_start_date ?? `${now.getFullYear()}-01-01`)
        : `${now.getFullYear()}-01-01`;
      setRangeStart(cStart);
      setRangeEnd(toISO(nextMonth(now)));

      setLoading(false);
    })();
  }, [ready, me]);

  // Build the "All users" list by unioning members across all admin teams
  useEffect(() => {
    (async () => {
      if (!adminTeams.length) { setAllUsers([{ id: '', label: 'All users' }]); return; }

      const seen = new Map<string, UserOpt>();
      for (const t of adminTeams) {
        const { data } = await supabase
          .from('team_members')
          .select('user_id')
          .eq('team_id', t.id);
        (data || []).forEach((row: any) => {
          const id = row.user_id as string;
          if (!id || seen.has(id)) return;
          seen.set(id, { id, label: labelForUserId(id) });
        });
      }
      const list = [{ id: '', label: 'All users' }]
        .concat(Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label)));
      setAllUsers(list);
    })();
  }, [adminTeams]);

  // Load users for the currently selected team (or reset when viewing "all teams")
  useEffect(() => {
    (async () => {
      setUserFilter(null); // reset whenever team changes
      if (!teamId) { setTeamUsers([]); return; }

      const { data, error } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', teamId);
      if (!error && data) {
        const opts: UserOpt[] = [{ id: '', label: 'All users' }].concat(
          data
            .map((u: any) => ({ id: u.user_id as string, label: labelForUserId(u.user_id) }))
            .sort((a, b) => a.label.localeCompare(b.label))
        );
        setTeamUsers(opts);
      } else {
        setTeamUsers([{ id: '', label: 'All users' }]);
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

  // Which list to show in the User dropdown?
  const userOptions = teamId ? (teamUsers.length ? teamUsers : [{ id: '', label: 'All users' }]) : (allUsers.length ? allUsers : [{ id: '', label: 'All users' }]);

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: theme.spacing(4), paddingBottom: theme.spacing(12) }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Analytics Dashboard</Text>
          <Text style={styles.subtitle}>
            Track team submissions and performance metrics
          </Text>
        </View>

        {/* Filters Card */}
        <View style={[styles.card, { backgroundColor: colors.white }]}>
          <Text style={styles.sectionHeader}>Filters</Text>
          
          {/* Team filter */}
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Team:</Text>
            {isWeb ? (
              <select
                value={teamId ?? ''}
                onChange={(e) => setTeamId(e.currentTarget.value || null)}
                style={styles.selectInput}
              >
                <option value="">
                  {adminTeams.length > 1 ? 'All my teams' : (adminTeams[0]?.name ?? 'My team')}
                </option>
                {adminTeams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            ) : (
              <Text style={styles.filterValue}>
                {adminTeams.find(t => t.id === teamId)?.name ?? 'All my teams'}
              </Text>
            )}
          </View>

          {/* Date range */}
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Date Range:</Text>
            <View style={styles.dateRange}>
              {isWeb ? (
                <>
                  <input
                    type="date"
                    value={rangeStart ?? ''}
                    onChange={(e) => setRangeStart(e.currentTarget.value)}
                    style={styles.dateInput}
                  />
                  <Text style={styles.dateSeparator}>to</Text>
                  <input
                    type="date"
                    value={rangeEnd ?? ''}
                    onChange={(e) => setRangeEnd(e.currentTarget.value)}
                    style={styles.dateInput}
                  />
                </>
              ) : (
                <View style={styles.dateDisplay}>
                  <Text style={styles.filterValue}>{rangeStart}</Text>
                  <Text style={styles.dateSeparator}>to</Text>
                  <Text style={styles.filterValue}>{rangeEnd}</Text>
                </View>
              )}
            </View>
          </View>

          {/* User filter */}
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>User:</Text>
            {isWeb ? (
              <select
                value={userFilter ?? ''}
                onChange={(e) => setUserFilter(e.currentTarget.value || null)}
                style={styles.selectInput}
              >
                {userOptions.map((u) => (
                  <option key={u.id || 'all'} value={u.id}>{u.label}</option>
                ))}
              </select>
            ) : (
              <Text style={styles.filterValue}>
                {userFilter
                  ? (userOptions.find(u => u.id === userFilter)?.label ?? 'User')
                  : 'All users'}
              </Text>
            )}
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.blue} />
            <Text style={[styles.loadingText, { marginTop: theme.spacing(2) }]}>
              Loading metrics...
            </Text>
          </View>
        ) : (
          <View style={styles.content}>
            {/* YTD Summary Card */}
            <View style={[styles.card, { backgroundColor: colors.white }]}>
              <Text style={styles.sectionHeader}>Year-to-Date Summary</Text>
              <View style={styles.metricHighlight}>
                <Text style={styles.metricValue}>{ytd.toLocaleString()}</Text>
                <Text style={styles.metricLabel}>total submissions this year</Text>
              </View>
            </View>

            {/* Monthly Breakdown Card */}
            <View style={[styles.card, { backgroundColor: colors.white }]}>
              <Text style={styles.sectionHeader}>Monthly Breakdown</Text>
              {monthly.length === 0 ? (
                <Text style={styles.emptyState}>No data available in selected range.</Text>
              ) : (
                <>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Month</Text>
                    <Text style={[styles.tableHeaderCell, { textAlign: 'center' }]}>Submissions</Text>
                    <Text style={[styles.tableHeaderCell, { textAlign: 'right' }]}>Cumulative</Text>
                  </View>
                  {monthly.map((r, index) => {
                    const idx = monthIndex(r.month_start);
                    const label =
                      idx != null
                        ? `Month ${idx}`
                        : monthFmtUTC.format(new Date(`${r.month_start}T00:00:00Z`));
                    return (
                      <View
                        key={r.month_start}
                        style={[styles.tableRow, index % 2 === 1 && styles.tableRowStriped ]}
                      >
                        <Text style={[styles.tableCell, { flex: 2 }]}>
                          {label}
                          <Text style={styles.tableCellSubtext}>({r.month_start})</Text>
                        </Text>
                        <Text style={[styles.tableCell, { textAlign: 'center', fontWeight: '600' }]}>
                          {r.submitted}
                        </Text>
                        <Text style={[styles.tableCell, { textAlign: 'right', color: '#6b7280' }]}>
                          {r.cumulative}
                        </Text>
                      </View>
                    );
                  })}
                </>
              )}

              {/* CSV export (web) */}
              {isWeb && monthly.length ? (
                <View style={styles.exportSection}>
                  <Button
                    title="Download Monthly CSV"
                    onPress={() =>
                      downloadCSV(
                        'monthly.csv',
                        [['month_start', 'submitted', 'cumulative']].concat(
                          monthly.map((r) => [r.month_start, String(r.submitted), String(r.cumulative)])
                        )
                      )
                    }
                    variant="secondary"
                    accessibilityLabel="Download monthly metrics as CSV"
                  />
                </View>
              ) : null}
            </View>

            {/* Daily Breakdown Card */}
            <View style={[styles.card, { backgroundColor: colors.white }]}>
              <Text style={styles.sectionHeader}>Current Month (Daily View)</Text>
              {daily.length === 0 ? (
                <Text style={styles.emptyState}>No submissions yet this month.</Text>
              ) : (
                <>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Date</Text>
                    <Text style={[styles.tableHeaderCell, { textAlign: 'center' }]}>Submissions</Text>
                  </View>
                  {daily.map((r, index) => (
                    <View
                      key={r.day}
                      style={[styles.tableRow, index % 2 === 1 && styles.tableRowStriped ]}
                    >
                      <Text style={[styles.tableCell, { flex: 2 }]}>{r.day}</Text>
                      <Text style={[styles.tableCell, { textAlign: 'center', fontWeight: '600' }]}>
                        {r.submitted}
                      </Text>
                    </View>
                  ))}
                </>
              )}

              {/* CSV export (web) */}
              {isWeb && daily.length ? (
                <View style={styles.exportSection}>
                  <Button
                    title="Download Daily CSV"
                    onPress={() => downloadCSV('daily.csv', [['day', 'submitted']].concat(daily.map((r) => [r.day, String(r.submitted)])))}
                    variant="secondary"
                    accessibilityLabel="Download daily metrics as CSV"
                  />
                </View>
              ) : null}
            </View>

            <View style={styles.navigation}>
              <Button
                title="Back to Admin"
                onPress={() => router.replace('/admin')}
                variant="secondary"
                accessibilityLabel="Navigate back to admin dashboard"
              />
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
  },
  header: {
    paddingTop: theme.spacing(4),
    paddingHorizontal: theme.spacing(4),
    paddingBottom: theme.spacing(3),
  },
  title: {
    ...typography.title,
    fontSize: 24,
    marginBottom: theme.spacing(1),
  },
  subtitle: {
    ...typography.body,
    color: '#6b7280',
    marginBottom: 0,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing(8),
  },
  loadingText: {
    ...typography.body,
    color: '#6b7280',
  },
  content: {
    gap: theme.spacing(4),
  },
  card: {
    borderRadius: theme.radius.xl,
    padding: theme.spacing(4),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    // Web shadow support
    ...Platform.select({
      web: {
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      },
    }),
  },
  sectionHeader: {
    ...typography.title,
    fontSize: 18,
    marginBottom: theme.spacing(3),
    color: theme.colors.text,
  },
  filterRow: {
    marginBottom: theme.spacing(3),
  },
  filterLabel: {
    ...typography.label,
    color: '#6b7280',
    marginBottom: 6,
    fontWeight: '600',
  },
  filterValue: {
    ...typography.body,
    color: theme.colors.text,
  },
  dateRange: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing(2),
  },
  dateInput: {
    padding: theme.spacing(2),
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: theme.radius.lg,
    backgroundColor: colors.white,
  },
  dateDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing(2),
  },
  dateSeparator: {
    ...typography.label,
    color: '#6b7280',
  },
  selectInput: {
    padding: theme.spacing(2),
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: theme.radius.lg,
    backgroundColor: colors.white,
  },
  metricHighlight: {
    alignItems: 'center',
    paddingVertical: theme.spacing(3),
  },
  metricValue: {
    fontSize: 32,
    fontWeight: '700',
    color: theme.colors.blue,
    marginBottom: theme.spacing(1),
  },
  metricLabel: {
    ...typography.body,
    color: '#6b7280',
    textAlign: 'center',
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#e5e7eb',
    paddingBottom: theme.spacing(2),
    marginBottom: theme.spacing(1),
  },
  tableHeaderCell: {
    ...typography.label,
    fontWeight: '700',
    color: theme.colors.text,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: theme.spacing(2),
  },
  tableRowStriped: {
    backgroundColor: colors.surface,
  },
  tableCell: {
    ...typography.body,
    color: theme.colors.text,
  },
  tableCellSubtext: {
    ...typography.label,
    color: '#6b7280',
    fontSize: 12,
  },
  emptyState: {
    ...typography.body,
    color: '#6b7280',
    textAlign: 'center',
    paddingVertical: theme.spacing(3),
  },
  exportSection: {
    marginTop: theme.spacing(4),
    paddingTop: theme.spacing(3),
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  navigation: {
    paddingTop: theme.spacing(2),
  },
});
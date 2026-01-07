import React, { useCallback, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, ScrollView, Platform, SafeAreaView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { theme, colors, typography } from '../../src/theme';
import Button from '../../src/components/Button';
import Banner from '../../src/components/Banner';
import LogoHeader from '../../src/components/LogoHeader';

type Member = { user_id: string; is_admin: boolean; display_name?: string | null; email?: string | null };
type TeamInfo = { id: string; name: string };

export default function AdminRoute() {
  const { session, ready } = useAuth();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const shortTeamId = teamId ? `${teamId.slice(0, 4)}…${teamId.slice(-4)}` : '—';

  const loadAdminData = useCallback(async () => {
    if (!ready || !session?.user) return;
    setLoading(true);

    try {
      const { data: tm, error: tmErr } = await supabase
        .from('team_members')
        .select('team_id,is_admin,teams(name)')
        .eq('user_id', session.user.id)
        .eq('is_admin', true)
        .limit(1)
        .maybeSingle();

      if (tmErr) {
        console.error('admin: team_members lookup failed', tmErr);
        setLoading(false);
        return;
      }

      const tid = tm?.team_id ?? null;
      setTeamId(tid);
      setTeamName(tm?.teams?.name ?? null);
      setIsAdmin(!!tm?.is_admin);

      if (tid) {
        const [{ data: memRows, error: memErr }, { data: roster, error: rosterErr }] = await Promise.all([
          supabase
            .from('team_members')
            .select('user_id,is_admin')
            .eq('team_id', tid)
            .order('is_admin', { ascending: false }),
          supabase.rpc('team_users_with_names', { p_team_id: tid }),
        ]);
        if (memErr) {
          console.error('admin: members load failed', memErr);
        }
        if (rosterErr) {
          console.error('admin: roster lookup failed', rosterErr);
        }
        const nameMap = new Map<string, { display: string | null; email: string | null }>();
        (roster || []).forEach((row: any) => {
          nameMap.set(row.user_id, {
            display: row.display_name ?? row.email ?? row.user_id,
            email: row.email ?? null,
          });
        });
        const enriched = (memRows || []).map((m: any) => {
          const info = nameMap.get(m.user_id);
          return {
            user_id: m.user_id,
            is_admin: m.is_admin,
            display_name: info?.display ?? m.user_id,
            email: info?.email ?? null,
          };
        });
        setMembers(enriched);
      } else {
        setMembers([]);
      }
    } catch (error) {
      console.error('admin: load error', error);
    } finally {
      setLoading(false);
    }
  }, [ready, session?.user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadAdminData();
    }, [loadAdminData])
  );

  if (!ready) return <View style={S.center}><ActivityIndicator /></View>;
  if (!session?.user) {
    return (
      <View style={S.center}>
        <Text style={[styles.title, { marginBottom: theme.spacing(2) }]}>Admin Access</Text>
        <Text style={[styles.bodyText, { textAlign: 'center', marginBottom: theme.spacing(3) }]}>
          You're signed out. Please sign in to access admin features.
        </Text>
        <Button 
          title="Go to Login"
          onPress={() => router.replace('/login')}
          accessibilityLabel="Navigate to login page"
        />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={S.center}>
        <Text style={[styles.title, { marginBottom: theme.spacing(2) }]}>Admin Access</Text>
        <Banner 
          kind="info" 
          message="You're not an admin on any team. Contact your team administrator to get access."
        />
        <View style={{ marginTop: theme.spacing(4) }}>
          <Button 
            title="Back to Menu"
            onPress={() => router.replace('/menu')}
            variant="secondary"
            accessibilityLabel="Navigate back to main menu"
          />
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={S.safe}>
      <LogoHeader title="Admin Dashboard" subtitle={teamName || undefined} />
      <View style={S.container}>
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: theme.spacing(8) }}
        showsVerticalScrollIndicator={false}
      >
        <View style={S.header}>
          <Text style={styles.title}>Admin Dashboard</Text>
          <Text style={styles.subtitle}>
            Manage your team and view analytics
          </Text>
        </View>

        {loading ? (
          <View style={S.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.blue} />
          </View>
        ) : (
          <View style={S.content}>
            {/* Team Info Card */}
            <View style={[S.card, { backgroundColor: colors.white }]}>
              <Text style={styles.sectionHeader}>Team Information</Text>
              <View style={S.infoRow}>
                <Text style={styles.labelText}>Team Name:</Text>
                <Text style={[styles.valueText, { fontWeight: '700' }]}>
                  {teamName || 'Loading...'}
                </Text>
              </View>
              <View style={S.infoRow}>
                <Text style={styles.labelText}>Team ID:</Text>
                <Text style={[styles.valueText, { color: '#6b7280', fontFamily: 'monospace', fontSize: 12 }]}>
                  {shortTeamId}
                </Text>
              </View>
              <View style={S.infoRow}>
                <Text style={styles.labelText}>Total Members:</Text>
                <Text style={[styles.valueText, { fontWeight: '700' }]}>
                  {members.length}
                </Text>
              </View>
            </View>

            {/* Team Members Card */}
            <View style={[S.card, { backgroundColor: colors.white }]}>
              <Text style={styles.sectionHeader}>Team Members</Text>
              {members.length === 0 ? (
                <Text style={[styles.bodyText, { textAlign: 'center', paddingVertical: theme.spacing(3) }]}>
                  No team members found.
                </Text>
              ) : (
                <>
                  <View style={S.memberHeader}>
                    <Text style={styles.memberHeaderLabel}>Member</Text>
                    <Text style={styles.memberHeaderLabel}>Role</Text>
                  </View>
                  {members.map((m, index) => (
                    <View key={m.user_id} style={[S.memberRow, index === members.length - 1 && S.memberRowLast ]}>
                      <View style={S.memberInfo}>
                        <Text style={styles.memberName}>
                          {m.display_name || m.user_id}
                        </Text>
                        {m.email ? <Text style={styles.memberEmail}>{m.email}</Text> : null}
                        <Text style={styles.memberId}>{m.user_id.slice(0, 8)}…</Text>
                      </View>
                      <View style={S.roleBadge}>
                        <Text style={m.is_admin ? styles.roleAdmin : styles.roleMember}>
                          {m.is_admin ? 'ADMIN' : 'MEMBER'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </View>

            {/* Admin Actions Card */}
            <View style={[S.card, { backgroundColor: colors.white }]}>
              <Text style={styles.sectionHeader}>Admin Actions</Text>
              <View style={S.actionsGrid}>
                <Button 
                  title="Invite Member"
                  onPress={() => router.push('/admin/invite')}
                  accessibilityLabel="Invite a new team member"
                />
                <Button 
                  title="View Metrics"
                  onPress={() => router.push('/admin/metrics')}
                  accessibilityLabel="View team analytics and metrics"
                />
              </View>
            </View>

            {/* Navigation */}
            <View style={S.navigation}>
              <Button 
                title="Back to Menu"
                onPress={() => router.replace('/menu')}
                variant="secondary"
                accessibilityLabel="Navigate back to main menu"
              />
            </View>
          </View>
        )}
      </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
  },
  container: { 
    flex: 1, 
    backgroundColor: colors.surfaceMuted,
  },
  center: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: theme.spacing(4) 
  },
  header: {
    paddingTop: theme.spacing(4),
    paddingHorizontal: theme.spacing(4),
    paddingBottom: theme.spacing(3),
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing(8),
  },
  content: {
    paddingHorizontal: theme.spacing(4),
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
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing(2),
  },
  memberHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: theme.spacing(2),
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    marginBottom: theme.spacing(2),
  },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing(3),
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  memberRowLast: {
    borderBottomWidth: 0,
  },
  memberInfo: {
    flex: 1,
    marginRight: theme.spacing(2),
  },
  roleBadge: {
    minWidth: theme.spacing(12),
    alignItems: 'flex-end',
  },
  actionsGrid: {
    gap: theme.spacing(3),
  },
  navigation: {
    paddingTop: theme.spacing(2),
  },
});

const styles = StyleSheet.create({
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
  sectionHeader: {
    ...typography.title,
    fontSize: 18,
    marginBottom: theme.spacing(3),
    color: theme.colors.text,
  },
  bodyText: {
    ...typography.body,
    color: theme.colors.text,
  },
  labelText: {
    ...typography.body,
    color: '#6b7280',
  },
  valueText: {
    ...typography.body,
    color: theme.colors.text,
  },
  memberName: {
    ...typography.body,
    color: theme.colors.text,
    fontWeight: '600',
    marginBottom: 2,
  },
  memberEmail: {
    ...typography.label,
    color: '#6b7280',
    fontSize: 13,
  },
  memberId: {
    ...typography.label,
    color: '#9CA3AF',
    fontFamily: 'monospace',
    fontSize: 11,
    marginTop: 2,
  },
  memberHeaderLabel: {
    ...typography.label,
    color: '#6b7280',
    fontSize: 12,
    letterSpacing: 0.6,
  },
  roleAdmin: {
    ...typography.label,
    color: theme.colors.white,
    backgroundColor: theme.colors.blue,
    paddingHorizontal: theme.spacing(2),
    paddingVertical: theme.spacing(1),
    borderRadius: theme.radius.md,
    fontWeight: '700',
    textAlign: 'center',
    fontSize: 12,
  },
  roleMember: {
    ...typography.label,
    color: theme.colors.text,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: theme.spacing(2),
    paddingVertical: theme.spacing(1),
    borderRadius: theme.radius.md,
    fontWeight: '600',
    textAlign: 'center',
    fontSize: 12,
  },
});
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, ScrollView, Platform } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { theme, colors, typography } from '../../src/theme';
import Button from '../../src/components/Button';
import Banner from '../../src/components/Banner';

type Member = { user_id: string; is_admin: boolean; display_name?: string | null; email?: string | null };
type TeamInfo = { id: string; name: string };

export default function AdminRoute() {
  const { session, ready } = useAuth();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!session?.user) return;
      setLoading(true);
      
      try {
        // 1) Get my admin team(s) with team names
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

        // 2) If I have a team, load all members with their names
        if (tid) {
          // Use the existing function that gets display names
          const { data: membersWithNames, error: mErr } = await supabase
            .rpc('team_users_with_names', { p_team_id: tid });
          
          if (mErr) {
            console.error('admin: members load failed', mErr);
            // Fallback to basic member list
            const { data: mem, error: basicErr } = await supabase
              .from('team_members')
              .select('user_id,is_admin')
              .eq('team_id', tid)
              .order('is_admin', { ascending: false });
            if (!basicErr) {
              setMembers(mem || []);
            }
          } else {
            // Combine the names with admin status
            const memberMap = new Map((membersWithNames || []).map((m: any) => [m.user_id, m]));
            const { data: adminStatus } = await supabase
              .from('team_members')
              .select('user_id,is_admin')
              .eq('team_id', tid);
            
            const membersWithAdminInfo = (adminStatus || []).map((admin: any) => ({
              user_id: admin.user_id,
              is_admin: admin.is_admin,
              display_name: memberMap.get(admin.user_id)?.display_name,
              email: memberMap.get(admin.user_id)?.email,
            }));
            
            setMembers(membersWithAdminInfo);
          }
        }
      } catch (error) {
        console.error('admin: load error', error);
      } finally {
        setLoading(false);
      }
    };

    if (ready && session?.user) load();
  }, [ready, session?.user?.id]);

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
                  {teamId?.substring(0, 8)}...
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
                members.map((m, index) => (
                  <View key={m.user_id} style={[S.memberRow, index === members.length - 1 && S.memberRowLast ]}>
                    <View style={S.memberInfo}>
                      <Text style={styles.memberName}>
                        {m.display_name || m.email || 'Unknown User'}
                      </Text>
                      <Text style={styles.memberEmail}>
                        {m.email && m.display_name !== m.email ? m.email : ''}
                      </Text>
                    </View>
                    <View style={S.roleBadge}>
                      <Text style={m.is_admin ? styles.roleAdmin : styles.roleMember}>
                        {m.is_admin ? 'ADMIN' : 'MEMBER'}
                      </Text>
                    </View>
                  </View>
                ))
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
  );
}

const S = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: colors.gray 
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
    backgroundColor: colors.gray,
    paddingHorizontal: theme.spacing(2),
    paddingVertical: theme.spacing(1),
    borderRadius: theme.radius.md,
    fontWeight: '600',
    textAlign: 'center',
    fontSize: 12,
  },
});
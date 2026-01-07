import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, TextInput, Pressable, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import Button from '../components/Button';
import { supabase } from '../lib/supabase';
import { inviteUserByEmail } from '../lib/invite';
import { theme } from '../theme';
import LogoHeader from '../components/LogoHeader';
import { useAuth } from '../hooks/useAuth';

type Member = {
  team_id: string;
  team_name?: string | null;
  user_id: string;
  is_admin: boolean;
  display_name?: string | null;
  email?: string | null;
};

export default function AdminScreen({ onBack }: { onBack: () => void }) {
  const { session } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [teamId, setTeamId] = useState<string>('');
  const [teamOptions, setTeamOptions] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!session?.user) return;
    setLoading(true);
    try {
      const { data: adminRows, error: adminErr } = await supabase
        .from('team_members')
        .select('team_id, is_admin, teams(name)')
        .eq('user_id', session.user.id)
        .eq('is_admin', true);
      if (adminErr) throw adminErr;

      const adminTeams = (adminRows || []).map((row: any) => ({
        id: row.team_id,
        name: row.teams?.name ?? 'Team',
      }));
      setTeamOptions(adminTeams);
      if (!teamId && adminTeams.length) {
        setTeamId(adminTeams[0].id);
      }

      const aggregated: Member[] = [];
      for (const team of adminTeams) {
        const [{ data: membership, error: membershipErr }, { data: roster, error: rosterErr }] = await Promise.all([
          supabase
            .from('team_members')
            .select('user_id,is_admin')
            .eq('team_id', team.id)
            .order('is_admin', { ascending: false }),
          supabase.rpc('team_users_with_names', { p_team_id: team.id }),
        ]);
        if (membershipErr) {
          console.error('admin screen membership load failed', membershipErr);
        }
        if (rosterErr) {
          console.error('admin screen roster load failed', rosterErr);
        }
        const rosterMap = new Map<string, { name: string; email: string | null }>();
        (roster || []).forEach((person: any) => {
          rosterMap.set(person.user_id, {
            name: person.display_name ?? person.email ?? person.user_id,
            email: person.email ?? null,
          });
        });
        (membership || []).forEach((row: any) => {
          const identity = rosterMap.get(row.user_id);
          aggregated.push({
            team_id: team.id,
            team_name: team.name,
            user_id: row.user_id,
            is_admin: row.is_admin,
            display_name: identity?.name ?? row.user_id,
            email: identity?.email ?? null,
          });
        });
      }
      setMembers(aggregated);
    } catch (error: any) {
      Alert.alert('Error', error?.message ?? 'Unable to load team members.');
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, teamId]);

  useEffect(() => {
    load();
  }, [load]);

  const onInvite = async () => {
    try {
      if (!inviteEmail.trim()) {
        throw new Error('Email required');
      }
      const selectedTeam = teamId || teamOptions[0]?.id || undefined;
      await inviteUserByEmail(inviteEmail.trim(), selectedTeam);
      Alert.alert('Invite sent', `An invitation was sent to ${inviteEmail}.`);
      setInviteEmail('');
    } catch (e: any) {
      Alert.alert('Invite failed', e?.message ?? String(e));
    }
  };

  const headerTeamName = teamOptions.find((t) => t.id === teamId)?.name ?? teamOptions[0]?.name ?? undefined;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }}>
      <LogoHeader title="Admin" subtitle={headerTeamName} onBackPress={onBack} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>Team Members</Text>
          {members.length === 0 ? (
            <Text style={styles.emptyState}>No team members found.</Text>
          ) : (
            members.map((member) => (
              <View key={`${member.team_id}-${member.user_id}`} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{member.display_name}</Text>
                  {member.email ? <Text style={styles.memberEmail}>{member.email}</Text> : null}
                  <Text style={styles.memberMeta}>
                    {member.team_name} • {member.user_id.slice(0, 8)}…
                  </Text>
                </View>
                <View style={styles.rolePill}>
                  <Text style={member.is_admin ? styles.roleAdmin : styles.roleMember}>
                    {member.is_admin ? 'ADMIN' : 'MEMBER'}
                  </Text>
                </View>
              </View>
            ))
          )}

          <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Invite user</Text>
          <TextInput
            placeholder="email@example.com"
            value={inviteEmail}
            onChangeText={setInviteEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            style={theme.input}
          />
          <TextInput
            placeholder="Team ID"
            value={teamId}
            onChangeText={setTeamId}
            autoCapitalize="none"
            style={[theme.input, { marginTop: 8 }]}
          />
          <Pressable onPress={onInvite} style={[theme.button, { marginTop: 8 }]}>
            <Text style={theme.buttonText}>Send invite</Text>
          </Pressable>

          <View style={{ marginTop: 16 }}>
            <Button title="Back" onPress={onBack} variant="secondary" />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    gap: 12,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  memberEmail: {
    color: '#6b7280',
  },
  memberMeta: {
    color: '#9ca3af',
    fontSize: 12,
  },
  rolePill: {
    minWidth: 80,
    alignItems: 'flex-end',
  },
  roleAdmin: {
    backgroundColor: '#0f172a',
    color: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontWeight: '700',
  },
  roleMember: {
    backgroundColor: '#e5e7eb',
    color: '#111827',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontWeight: '600',
  },
  emptyState: {
    paddingVertical: 12,
    color: '#6b7280',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

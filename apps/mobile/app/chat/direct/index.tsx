import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet, SafeAreaView, Image } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/hooks/useAuth';
import { colors, theme, typography } from '../../../src/theme';
import { useUISettings } from '../../../src/lib/uiSettings';
import { getSignedStorageUrl } from '../../../src/lib/supabaseHelpers';
import LogoHeader from '../../../src/components/LogoHeader';

interface MemberRow {
  user_id: string;
  display_name?: string | null;
  email?: string | null;
}

export default function DirectMessageRoster() {
  const { session, ready } = useAuth();
  const params = useLocalSearchParams<{ team?: string }>();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState('Team');
  const { fontScale } = useUISettings();

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [avatarMap, setAvatarMap] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || !session?.user) return;
    loadTeam(params.team || null);
  }, [ready, session?.user?.id]);

  const loadTeam = async (preferredTeamId: string | null) => {
    setLoading(true);
    try {
      let activeTeamId = preferredTeamId;
      if (!activeTeamId) {
        const { data, error } = await supabase
          .from('team_members')
          .select('team_id, teams(name)')
          .eq('user_id', session!.user.id)
          .limit(1)
          .single();
        if (error) throw error;
        activeTeamId = data?.team_id ?? null;
        setTeamName(data?.teams?.name || 'Team');
      } else {
        const { data } = await supabase
          .from('teams')
          .select('name')
          .eq('id', activeTeamId)
          .maybeSingle();
        if (data?.name) setTeamName(data.name);
      }
      if (!activeTeamId) {
        setMembers([]);
        setTeamId(null);
        return;
      }
      setTeamId(activeTeamId);
      const { data: roster, error: rosterErr } = await supabase.rpc('team_users_with_names', { p_team_id: activeTeamId });
      if (rosterErr) throw rosterErr;
      const filtered = (roster as any[])
        ?.filter((row) => row.user_id !== session!.user.id)
        .map((row) => ({ user_id: row.user_id, display_name: row.display_name, email: row.email }));
      const finalMembers = filtered || [];
      setMembers(finalMembers);

      // Pull avatars in one shot (then sign them).
      const ids = finalMembers.map((m) => m.user_id).filter(Boolean);
      if (ids.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, avatar_path')
          .in('id', ids);
        const rows = (profiles as any[]) || [];
        const next: Record<string, string | null> = {};
        await Promise.all(
          rows.map(async (p) => {
            const path = p.avatar_path as string | null;
            next[p.id] = path ? await getSignedStorageUrl('avatars', path, 60 * 60 * 4) : null;
          })
        );
        setAvatarMap(next);
      } else {
        setAvatarMap({});
      }
    } catch (error) {
      console.error('direct roster load failed', error);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <SafeAreaView style={styles.safe}>
        <LogoHeader title="Direct Messages" />
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  if (!session?.user) {
    return (
      <SafeAreaView style={styles.safe}>
        <LogoHeader title="Direct Messages" />
        <View style={styles.center}>
          <Text>Please sign in.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <LogoHeader title="Direct Messages" />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.blue} />
        </View>
      ) : !teamId ? (
        <View style={styles.center}>
          <Text style={styles.subtitle}>Join a team to start direct messages.</Text>
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const label = item.display_name || item.email || item.user_id.slice(0, 8);
            const initials = label
              .trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase())
              .join('') || 'U';
            const avatar = avatarMap[item.user_id] || null;

            return (
              <TouchableOpacity
                style={styles.memberRow}
                onPress={() => router.push({ pathname: `/chat/direct/${item.user_id}`, params: { team: teamId! } })}
              >
                <View style={styles.memberLeft}>
                  <View style={styles.avatarCircle}>
                    {avatar ? (
                      <Image source={{ uri: avatar }} style={styles.avatarImage} />
                    ) : (
                      <Text style={[styles.avatarText, { fontSize: Math.round(12 * fontScale) }]}>{initials}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.memberName, { fontSize: Math.round(16 * fontScale) }]} numberOfLines={1}>
                      {label}
                    </Text>
                    {item.email ? (
                      <Text style={[styles.memberEmail, { fontSize: Math.round(13 * fontScale) }]} numberOfLines={1}>
                        {item.email}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.subtitle}>No teammates available for direct messages.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing(4),
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: theme.spacing(2),
    paddingBottom: theme.spacing(4),
  },
  memberRow: {
    backgroundColor: colors.card,
    borderRadius: theme.radius.lg,
    padding: theme.spacing(3),
    marginHorizontal: theme.spacing(1),
    marginVertical: theme.spacing(1),
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memberLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing(2),
    flex: 1,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 40,
    height: 40,
  },
  avatarText: {
    ...typography.label,
    fontWeight: '800',
    color: '#0f172a',
  },
  memberName: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  memberEmail: {
    ...typography.label,
    color: colors.textMuted,
  },
  chevron: {
    fontSize: 28,
    color: colors.textMuted,
  },
});

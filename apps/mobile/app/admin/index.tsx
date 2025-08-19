import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { theme } from '../../src/theme';

type Member = { user_id: string; is_admin: boolean };

export default function AdminRoute() {
  const { session, ready } = useAuth();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!session?.user) return;
      setLoading(true);
      // Read memberships directly from team_members (avoid view/caching surprises)
      const { data: tm, error: tmErr } = await supabase
        .from('team_members')
        .select('team_id,is_admin')
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
      setIsAdmin(!!tm?.is_admin);

      if (tid) {
        const { data: mem, error: mErr } = await supabase
          .from('team_members')
          .select('user_id,is_admin')
          .eq('team_id', tid)
          .order('is_admin', { ascending: false });
        if (mErr) console.error('admin: members load failed', mErr);
        setMembers(mem || []);
      }

      setLoading(false);
    };

    if (ready && session?.user) load();
  }, [ready, session?.user?.id]);

  if (!ready) return <View style={S.center}><ActivityIndicator /></View>;
  if (!session?.user) {
    return (
      <View style={S.center}>
        <Text>You’re signed out.</Text>
        <Pressable onPress={() => router.replace('/login')}
          style={{ ...theme.button, marginTop: 12 }}>
          <Text style={theme.buttonText}>Go to Login</Text>
        </Pressable>
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={S.center}>
        <Text style={S.title}>Admin</Text>
        <Text style={{ textAlign: 'center', marginTop: 8 }}>
          You’re not an admin on any team.
        </Text>
        <Pressable onPress={() => router.replace('/home')}
          style={{ ...theme.button, marginTop: 16 }}>
          <Text style={theme.buttonText}>Back to Home</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={S.container}>
      <Text style={S.title}>Admin</Text>
      {loading ? (
        <ActivityIndicator />
      ) : (
        <>
          <Text style={{ marginBottom: 12, color: '#4b5563' }}>
            Team: <Text style={{ fontWeight: '700' }}>{teamId}</Text>
          </Text>

          {members.map(m => (
            <View key={m.user_id} style={S.row}>
              <Text style={{ flex: 1 }}>{m.user_id}</Text>
              <Text style={{ fontWeight: '700' }}>{m.is_admin ? 'admin' : 'member'}</Text>
            </View>
          ))}

          <Pressable onPress={() => router.push('/admin/invite')}
            style={{ ...theme.button, marginTop: 16 }}>
            <Text style={theme.buttonText}>Invite a member</Text>
          </Pressable>

          <Pressable onPress={() => router.replace('/home')}
            style={{ ...theme.button, marginTop: 8, backgroundColor: '#6b7280' }}>
            <Text style={theme.buttonText}>Back</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 8,
  },
});

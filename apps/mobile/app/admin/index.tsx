// apps/mobile/app/admin/index.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';

type Member = { user_id: string; is_admin: boolean };

export default function AdminIndex() {
  const { session, ready } = useAuth();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!session?.user) return;
      setLoading(true);
      setErr(null);

      const { data: vt, error: vtErr } = await supabase
        .from('v_user_teams')
        .select('team_id,is_admin')
        .eq('user_id', session.user.id)
        .limit(1)
        .maybeSingle();

      if (vtErr) {
        setErr(vtErr.message);
        setLoading(false);
        return;
      }

      setTeamId(vt?.team_id ?? null);
      setIsAdmin(!!vt?.is_admin);

      if (vt?.team_id) {
        const { data: mem, error: mErr } = await supabase
          .from('team_members')
          .select('user_id,is_admin')
          .eq('team_id', vt.team_id)
          .order('is_admin', { ascending: false });

        if (mErr) setErr(mErr.message);
        setMembers(mem || []);
      }
      setLoading(false);
    };

    if (ready && session?.user) run();
  }, [ready, session?.user?.id]);

  if (!ready) return <View style={S.center}><ActivityIndicator /></View>;
  if (!session?.user) return <View style={S.center}><Text>Signed out.</Text></View>;

  if (!isAdmin) {
    return (
      <View style={S.center}>
        <Text style={S.title}>Admin</Text>
        <Text>You’re not an admin on any team.</Text>
        <Pressable onPress={() => router.push('/home')} style={S.btnGray}>
          <Text style={S.btnText}>Back to Home</Text>
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
          {!!err && <Text style={S.err}>{err}</Text>}
          <Text style={S.meta}>Team: <Text style={S.bold}>{teamId}</Text></Text>

          {members.map((m) => (
            <View key={m.user_id} style={S.row}>
              <Text style={{ flex: 1 }}>{m.user_id}</Text>
              <Text style={S.bold}>{m.is_admin ? 'admin' : 'member'}</Text>
            </View>
          ))}

          <Pressable onPress={() => router.push('/admin/invite')} style={S.btn}>
            <Text style={S.btnText}>Invite a member</Text>
          </Pressable>

          <Pressable onPress={() => router.push('/home')} style={S.btnGray}>
            <Text style={S.btnText}>Back</Text>
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
  bold: { fontWeight: '700' },
  meta: { marginBottom: 12, color: '#4b5563' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 8,
  },
  btn: {
    marginTop: 16, backgroundColor: '#2563eb',
    paddingVertical: 10, borderRadius: 8, alignItems: 'center'
  },
  btnGray: {
    marginTop: 12, backgroundColor: '#6b7280',
    paddingVertical: 10, borderRadius: 8, alignItems: 'center'
  },
  btnText: { color: '#fff', fontWeight: '600' },
  err: { color: 'crimson', marginBottom: 8 },
});

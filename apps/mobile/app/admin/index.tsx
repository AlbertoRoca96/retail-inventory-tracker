// apps/mobile/app/admin/index.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
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
  const [lastError, setLastError] = useState<string | null>(null);

  const load = async () => {
    if (!session?.user) return;
    setLoading(true);
    setLastError(null);

    try {
      // Prefer a direct read from team_members (simplest RLS surface)
      const { data: memRow, error: memErr } = await supabase
        .from('team_members')
        .select('team_id,is_admin')
        .eq('user_id', session.user.id)
        .order('is_admin', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (memErr) {
        console.error('team_members read error:', memErr);
        setLastError(memErr.message);
      }

      if (memRow?.team_id) {
        setTeamId(memRow.team_id);
        setIsAdmin(!!memRow.is_admin);

        // Load members of that team for display
        const { data: mems, error: listErr } = await supabase
          .from('team_members')
          .select('user_id,is_admin')
          .eq('team_id', memRow.team_id)
          .order('is_admin', { ascending: false });

        if (listErr) {
          console.error('team member list error:', listErr);
          setLastError(listErr.message);
        } else {
          setMembers(mems || []);
        }
      } else {
        setTeamId(null);
        setIsAdmin(false);
      }
    } catch (e: any) {
      console.error('admin load unexpected error:', e);
      setLastError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (ready && session?.user) load(); }, [ready, session?.user?.id]);

  if (!ready) return <View style={S.center}><ActivityIndicator /></View>;

  if (!session?.user) {
    return (
      <View style={S.center}>
        <Text>You’re signed out.</Text>
        <Link href="/login" asChild>
          <Pressable style={[theme.button, { marginTop: 12 }]}>
            <Text style={theme.buttonText}>Go to Login</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  // If there was a backend error, show it so we know exactly what RLS/policy is blocking you
  if (lastError) {
    return (
      <View style={S.center}>
        <Text style={S.title}>Admin</Text>
        <Text style={{ color: '#b91c1c', textAlign: 'center' }}>
          Error: {lastError}
        </Text>
        <Link href="/home" asChild>
          <Pressable style={[theme.button, { marginTop: 16 }]}>
            <Text style={theme.buttonText}>Back to Home</Text>
          </Pressable>
        </Link>
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
        <Link href="/home" asChild>
          <Pressable style={[theme.button, { marginTop: 16 }]}>
            <Text style={theme.buttonText}>Back to Home</Text>
          </Pressable>
        </Link>
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

          {members.map((m) => (
            <View key={m.user_id} style={S.row}>
              <Text style={{ flex: 1 }}>{m.user_id}</Text>
              <Text style={{ fontWeight: '700' }}>{m.is_admin ? 'admin' : 'member'}</Text>
            </View>
          ))}

          <Link href="/admin/invite" asChild>
            <Pressable style={[theme.button, { marginTop: 16 }]}>
              <Text style={theme.buttonText}>Invite a member</Text>
            </Pressable>
          </Link>

          <Link href="/home" asChild>
            <Pressable style={[theme.button, { marginTop: 8, backgroundColor: '#6b7280' }]}>
              <Text style={theme.buttonText}>Back</Text>
            </Pressable>
          </Link>
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

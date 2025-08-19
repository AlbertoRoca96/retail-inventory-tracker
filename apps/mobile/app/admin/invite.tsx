// apps/mobile/app/admin/invite.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';

type AdminTeam = { team_id: string } | null;

export default function InviteUser() {
  const { session, ready } = useAuth();
  const [adminTeam, setAdminTeam] = useState<AdminTeam>(null);
  const [booting, setBooting] = useState(true);

  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const canSend = !!adminTeam?.team_id && !!normalizedEmail && !busy;

  // Load a team where the current user is admin
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!session?.user) return;
      setBooting(true);
      setMsg(null);

      const { data, error } = await supabase
        .from('team_members')
        .select('team_id,is_admin')
        .eq('user_id', session.user.id)
        .eq('is_admin', true)
        .limit(1)
        .maybeSingle();

      if (!cancelled) {
        if (error) {
          setMsg({ kind: 'err', text: error.message });
          setAdminTeam(null);
        } else {
          setAdminTeam(data ? { team_id: data.team_id } : null);
        }
        setBooting(false);
      }
    };

    if (ready && session?.user) load();
    return () => { cancelled = true; };
  }, [ready, session?.user?.id]);

  const sendInvite = async () => {
    setMsg(null);

    if (!adminTeam?.team_id) {
      setMsg({ kind: 'err', text: 'You are not an admin on any team.' });
      return;
    }
    if (!normalizedEmail) {
      setMsg({ kind: 'err', text: 'Enter an email to invite.' });
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke('invite-user', {
        body: { email: normalizedEmail, team_id: adminTeam.team_id },
      });
      if (error) throw error;
      setMsg({ kind: 'ok', text: `Invite sent to ${normalizedEmail}.` });
      setEmail('');
    } catch (e: any) {
      setMsg({ kind: 'err', text: e?.message ?? 'Failed to send invite.' });
    } finally {
      setBusy(false);
    }
  };

  // ----- Render states -----

  if (!ready) {
    return <View style={S.center}><ActivityIndicator /></View>;
  }

  if (!session?.user) {
    return (
      <View style={S.center}>
        <Text>Signed out.</Text>
        <Pressable onPress={() => router.replace('/login')} style={S.btnGray}>
          <Text style={S.btnText}>Go to Login</Text>
        </Pressable>
      </View>
    );
  }

  if (booting) {
    return <View style={S.center}><ActivityIndicator /></View>;
  }

  if (!adminTeam?.team_id) {
    return (
      <View style={S.center}>
        <Text style={S.title}>Invite a member</Text>
        <Text>You are not an admin on any team.</Text>
        {msg?.kind === 'err' && <Text style={S.err}>{msg.text}</Text>}
        <Pressable onPress={() => router.push('/admin')} style={S.btnGray}>
          <Text style={S.btnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={S.container}>
      <Text style={S.title}>Invite a member</Text>
      <Text style={{ color: '#4b5563', marginBottom: 12 }}>Team: {adminTeam.team_id}</Text>

      <TextInput
        placeholder="person@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={S.input}
      />

      {msg && (
        <Text style={msg.kind === 'ok' ? S.ok : S.err}>
          {msg.text}
        </Text>
      )}

      <Pressable
        onPress={sendInvite}
        disabled={!canSend}
        style={[S.btn, (!canSend || busy) && { opacity: 0.7 }]}
      >
        <Text style={S.btnText}>{busy ? 'Sending…' : 'Send invite'}</Text>
      </Pressable>

      <Pressable onPress={() => router.push('/admin')} style={S.btnGray}>
        <Text style={S.btnText}>Back</Text>
      </Pressable>
    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  input: {
    width: 320, maxWidth: '100%', backgroundColor: '#fff',
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  btn: {
    marginTop: 12, backgroundColor: '#2563eb',
    paddingVertical: 10, borderRadius: 8, alignItems: 'center',
  },
  btnGray: {
    marginTop: 8, backgroundColor: '#6b7280',
    paddingVertical: 10, borderRadius: 8, alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600' },
  ok: { color: '#059669', marginTop: 8 },
  err: { color: 'crimson', marginTop: 8 },
});

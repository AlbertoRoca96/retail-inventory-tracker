// apps/mobile/app/admin/invite.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';

export default function InviteUser() {
  const { session, ready } = useAuth();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    const boot = async () => {
      if (!session?.user) return;
      const { data: vt, error } = await supabase
        .from('v_user_teams')
        .select('team_id,is_admin')
        .eq('user_id', session.user.id)
        .eq('is_admin', true)
        .limit(1)
        .maybeSingle();

      if (error) setErr(error.message);
      setTeamId(vt?.team_id ?? null);
      setLoading(false);
    };
    if (ready && session?.user) boot();
  }, [ready, session?.user?.id]);

  const sendInvite = async () => {
    setErr(null); setOk(null);
    if (!teamId) { setErr('You are not an admin.'); return; }
    if (!email) { setErr('Enter an email to invite.'); return; }

    setSending(true);
    const { error } = await supabase.functions.invoke('invite-user', {
      body: { email: email.trim(), team_id: teamId },
    });
    setSending(false);

    if (error) setErr(error.message);
    else { setOk(`Invite sent to ${email}.`); setEmail(''); }
  };

  if (!ready) return <View style={S.center}><ActivityIndicator /></View>;
  if (!session?.user) return <View style={S.center}><Text>Signed out.</Text></View>;
  if (loading) return <View style={S.center}><ActivityIndicator /></View>;
  if (!teamId) {
    return (
      <View style={S.center}>
        <Text>You are not an admin on any team.</Text>
        <Pressable onPress={() => router.push('/admin')} style={S.btnGray}>
          <Text style={S.btnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={S.container}>
      <Text style={S.title}>Invite a member</Text>
      <Text style={{ color: '#4b5563', marginBottom: 12 }}>Team: {teamId}</Text>

      <TextInput
        placeholder="person@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={S.input}
      />

      {!!err && <Text style={{ color: 'crimson', marginTop: 8 }}>{err}</Text>}
      {!!ok && <Text style={{ color: '#059669', marginTop: 8 }}>{ok}</Text>}

      <Pressable onPress={sendInvite} disabled={sending} style={[S.btn, sending && { opacity: 0.7 }]}>
        <Text style={S.btnText}>{sending ? 'Sending…' : 'Send invite'}</Text>
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
    paddingVertical: 10, borderRadius: 8, alignItems: 'center'
  },
  btnGray: {
    marginTop: 8, backgroundColor: '#6b7280',
    paddingVertical: 10, borderRadius: 8, alignItems: 'center'
  },
  btnText: { color: '#fff', fontWeight: '600' },
});

// apps/mobile/app/admin/invite.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { theme } from '../../src/theme';

export default function InviteUserRoute() {
  const { session, ready } = useAuth();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

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

      if (error) Alert.alert('Error', error.message);
      setTeamId(vt?.team_id ?? null);
      setLoading(false);
    };
    if (ready && session?.user) boot();
  }, [ready, session?.user?.id]);

  const sendInvite = async () => {
    if (!teamId) { Alert.alert('Not allowed', 'You are not an admin.'); return; }
    if (!email) { Alert.alert('Missing email', 'Enter an email to invite.'); return; }

    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('invite-user', {
        body: { email: email.trim(), team_id: teamId },
      });
      if (error) throw error;
      Alert.alert('Invite sent', `An invite was sent to ${email}.`);
      setEmail('');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? String(e));
    } finally {
      setSending(false);
    }
  };

  if (!ready) return <View style={S.center}><ActivityIndicator /></View>;
  if (!session?.user) return <View style={S.center}><Text>Signed out.</Text></View>;
  if (loading) return <View style={S.center}><ActivityIndicator /></View>;

  if (!teamId) {
    return (
      <View style={S.center}>
        <Text>You are not an admin on any team.</Text>
        <Pressable onPress={() => router.replace('/admin')} style={{ ...theme.button, marginTop: 12 }}>
          <Text style={theme.buttonText}>Back</Text>
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
        style={theme.input}
      />

      <Pressable
        onPress={sendInvite}
        disabled={sending}
        style={{ ...theme.button, marginTop: 12, opacity: sending ? 0.7 : 1 }}
      >
        <Text style={theme.buttonText}>{sending ? 'Sending…' : 'Send invite'}</Text>
      </Pressable>

      <Pressable
        onPress={() => router.replace('/admin')}
        style={{ ...theme.button, marginTop: 8, backgroundColor: '#6b7280' }}
      >
        <Text style={theme.buttonText}>Back</Text>
      </Pressable>
    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
});

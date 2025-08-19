import { useState } from 'react';
import { View, Text, TextInput, Pressable, Alert } from 'react-native';
import { supabase } from '../../src/lib/supabase';
import { theme } from '../../src/theme';

export default function AdminInvite() {
  const [email, setEmail] = useState(''); const [teamId, setTeamId] = useState(''); const [busy, setBusy] = useState(false);
  const sendInvite = async () => {
    if (!email) return Alert.alert('Email required');
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/invite-user`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: email.trim(), team_id: teamId || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Invite failed');
      Alert.alert('Invite sent', `Email sent to ${email.trim()}`); setEmail('');
    } catch (e: any) { Alert.alert('Error', e?.message || 'Invite failed'); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex:1, padding:16, gap:12 }}>
      <Text style={{ fontSize:20, fontWeight:'700' }}>Invite user</Text>
      <Text>Email</Text>
      <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={theme.input} />
      <Text style={{ marginTop: 8 }}>Team (optional)</Text>
      <TextInput value={teamId} onChangeText={setTeamId} autoCapitalize="none" style={theme.input} placeholder="team uuid" />
      <Pressable onPress={sendInvite} disabled={busy} style={[theme.button, { marginTop: 12, opacity: busy ? 0.7 : 1 }]}>
        <Text style={theme.buttonText}>{busy ? 'Sending…' : 'Send invite'}</Text>
      </Pressable>
    </View>
  );
}

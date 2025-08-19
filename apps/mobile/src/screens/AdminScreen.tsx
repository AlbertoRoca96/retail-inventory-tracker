import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, TextInput, Pressable } from 'react-native';
import Button from '../components/Button';
import { supabase } from '../lib/supabase';
import { inviteUserByEmail } from '../lib/invite';
import { theme } from '../theme';

type Member = { team_id: string; user_id: string; is_admin: boolean };

export default function AdminScreen({ onBack }: { onBack: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [teamId, setTeamId] = useState<string>('');

  const load = async () => {
    const { data, error } = await supabase.from('team_members').select('*');
    if (error) { Alert.alert('Error', error.message); return; }
    setMembers(data as any);
  };

  useEffect(() => { load(); }, []);

  const onInvite = async () => {
    try {
      if (!inviteEmail) throw new Error('Email required');
      await inviteUserByEmail(inviteEmail.trim(), teamId || undefined);
      Alert.alert('Invite sent', `An invitation was sent to ${inviteEmail}.`);
      setInviteEmail('');
    } catch (e: any) {
      Alert.alert('Invite failed', e?.message ?? String(e));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Team Members</Text>
      {members.map((m, i) => (
        <View key={i} style={styles.row}>
          <Text numberOfLines={1} style={{flex:1, marginRight:8}}>{m.user_id}</Text>
          <Text>{m.is_admin ? 'admin' : 'member'}</Text>
        </View>
      ))}

      <Text style={[styles.title, { marginTop: 16 }]}>Invite user</Text>
      <TextInput
        placeholder="email@example.com"
        value={inviteEmail}
        onChangeText={setInviteEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={theme.input}
      />
      <TextInput
        placeholder="Team ID (optional)"
        value={teamId}
        onChangeText={setTeamId}
        autoCapitalize="none"
        style={[theme.input, { marginTop: 8 }]}
      />
      <Pressable onPress={onInvite} style={[theme.button, { marginTop: 8 }]}>
        <Text style={theme.buttonText}>Send invite</Text>
      </Pressable>

      <Button title="Back" onPress={onBack} variant="secondary" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize:22, fontWeight:'700', marginBottom: 8 },
  row: { flexDirection:'row', justifyContent:'space-between', borderBottomWidth:1, borderColor:'#ddd', paddingVertical:8 }
});

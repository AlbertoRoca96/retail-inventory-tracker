import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import Button from '../components/Button';
import { supabase } from '../lib/supabase';
import { theme } from '../theme';

type Member = { team_id: string; user_id: string; is_admin: boolean };

export default function AdminScreen({ onBack }: { onBack: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);

  const load = async () => {
    const { data, error } = await supabase.from('team_members').select('*');
    if (error) { Alert.alert('Error', error.message); return; }
    setMembers(data as any);
  };

  useEffect(() => { load(); }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Team Members</Text>
      {members.map((m, i) => (
        <View key={i} style={styles.row}>
          <Text>{m.user_id}</Text>
          <Text>{m.is_admin ? 'admin' : 'member'}</Text>
        </View>
      ))}
      <Button title="Back" onPress={onBack} variant="secondary" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize:22, fontWeight:'700', marginBottom: 8 },
  row: { flexDirection:'row', justifyContent:'space-between', borderBottomWidth:1, borderColor:'#ddd', paddingVertical:8 }
});

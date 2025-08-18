// apps/mobile/src/screens/AdminScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView } from 'react-native';
import Button from '../components/Button';
import { supabase } from '../lib/supabase';
import { getYTDTotal, getMonthlyCounts } from '../lib/analytics';

type Member = { team_id: string; user_id: string; is_admin: boolean };

export default function AdminScreen({ onBack }: { onBack: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [snapshot, setSnapshot] = useState<{ ytd: number; thisMonth: number }>({ ytd: 0, thisMonth: 0 });

  const loadMembers = async () => {
    const { data, error } = await supabase.from('team_members').select('*');
    if (error) { Alert.alert('Error', error.message); return; }
    setMembers(data as any);
  };

  const loadSnapshot = async () => {
    try {
      const today = new Date();
      const ytd = await getYTDTotal(today, {});
      const startMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const endMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
      const monthly = await getMonthlyCounts(startMonth, endMonth, {});
      const thisMonth = monthly.reduce((acc, r) => acc + r.submitted, 0);
      setSnapshot({ ytd, thisMonth });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? String(e));
    }
  };

  useEffect(() => { loadMembers(); loadSnapshot(); }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Team Members</Text>
      {members.map((m, i) => (
        <View key={i} style={styles.row}>
          <Text numberOfLines={1} style={{ flex: 1 }}>{m.user_id}</Text>
          <Text>{m.is_admin ? 'admin' : 'member'}</Text>
        </View>
      ))}

      <View style={{ height: 1, backgroundColor: '#e5e7eb', marginVertical: 12 }} />

      <Text style={styles.title}>Snapshot</Text>
      <Text>YTD submissions: <Text style={{ fontWeight: '700' }}>{snapshot.ytd}</Text></Text>
      <Text>This month: <Text style={{ fontWeight: '700' }}>{snapshot.thisMonth}</Text></Text>

      <View style={{ height: 12 }} />
      <Button title="Back" onPress={onBack} variant="secondary" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderColor: '#ddd', paddingVertical: 8 }
});

// apps/mobile/app/admin.tsx
import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, Platform, ScrollView } from 'react-native';
import { supabase } from '../src/lib/supabase';
import { colors } from '../src/theme';
import { getMonthlyCounts, getDailyCounts, getRangeTotal, getYTDTotal } from '../src/lib/analytics';

const isWeb = Platform.OS === 'web';

export default function Admin() {
  // ===== Existing "groups" demo UI (left as-is) =====
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState<string | undefined>();
  const [member, setMember] = useState('');

  const createGroup = async () => {
    const { data: s } = await supabase.auth.getSession();
    const uid = s.session?.user.id ?? 'dev-user';
    const { data, error } = await supabase.from('groups').insert([{ name, created_by: uid }]).select().single();
    if (error) return Alert.alert('Error', error.message);
    setGroupId(data.id); setName('');
  };

  const addMember = async () => {
    if (!groupId) return;
    const { error } = await supabase.from('group_members').insert([{ group_id: groupId, user_id: member }]);
    if (error) return Alert.alert('Error', error.message);
    setMember('');
    Alert.alert('Success', 'Member added');
  };

  // ===== New: Analytics state =====
  const [teamId, setTeamId] = useState<string>('');
  const [creatorId, setCreatorId] = useState<string>(''); // optional filter
  const [contractStart, setContractStart] = useState<string>('2025-01-01'); // example default
  const [rangeStart, setRangeStart] = useState<string>('2025-01-01');
  const [rangeEnd, setRangeEnd] = useState<string>('2025-01-31');

  const [ytd, setYtd] = useState<number>(0);
  const [monthly, setMonthly] = useState<{ month_start: string; submitted: number; cumulative: number }[]>([]);
  const [daily, setDaily] = useState<{ day: string; submitted: number }[]>([]);
  const [rangeTotal, setRangeTotal] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  // load my first team as a convenience
  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user.id;
      if (!uid) return;
      const { data } = await supabase.from('team_members').select('team_id').eq('user_id', uid).limit(1).maybeSingle();
      if (data?.team_id) setTeamId(data.team_id);
    })();
  }, []);

  const filters = useMemo(() => ({
    teamId: teamId || null,
    userId: creatorId || null,
  }), [teamId, creatorId]);

  const loadAnalytics = async () => {
    try {
      setBusy(true);
      const today = new Date().toISOString().slice(0, 10);

      // YTD (as of today)
      const y = await getYTDTotal(today, filters);

      // Monthly from contractStart through the end of the current month
      const endMonth = new Date();
      const endMonthISO = new Date(endMonth.getFullYear(), endMonth.getMonth() + 1, 0).toISOString().slice(0, 10);
      const m = await getMonthlyCounts(contractStart, endMonthISO, filters);

      // Current month daily to date
      const firstOfMonthISO = new Date(endMonth.getFullYear(), endMonth.getMonth(), 1).toISOString().slice(0, 10);
      const d = await getDailyCounts(firstOfMonthISO, today, filters);

      setYtd(y);
      setMonthly(m);
      setDaily(d);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const loadRange = async () => {
    try {
      setBusy(true);
      const total = await getRangeTotal(rangeStart, rangeEnd, filters);
      setRangeTotal(total);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: '700' }}>Admin</Text>

      {/* ===== Existing "groups" demo ===== */}
      <Text style={{ fontWeight: '700' }}>Create Group</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          placeholder="Group name"
          value={name}
          onChangeText={setName}
          style={{ flex: 1, backgroundColor: 'white', borderColor: '#111827', borderWidth: 1, borderRadius: 8, padding: 10 }}
        />
        <Pressable onPress={createGroup}
          style={{ backgroundColor: colors.blue, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 10 }}>
          <Text style={{ color: 'white', fontWeight: '700' }}>Create</Text>
        </Pressable>
      </View>

      <Text style={{ fontWeight: '700', marginTop: 12 }}>Add Member (user id)</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          placeholder="00000000-..."
          value={member}
          onChangeText={setMember}
          style={{ flex: 1, backgroundColor: 'white', borderColor: '#111827', borderWidth: 1, borderRadius: 8, padding: 10 }}
        />
        <Pressable onPress={addMember} disabled={!groupId}
          style={{ backgroundColor: groupId ? colors.blue : colors.gray, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 10 }}>
          <Text style={{ color: groupId ? 'white' : '#6b7280', fontWeight: '700' }}>Add</Text>
        </Pressable>
      </View>
      {groupId ? <Text>Current group: {groupId}</Text> : null}

      {/* ===== New: Analytics ===== */}
      <View style={{ height: 1, backgroundColor: '#e5e7eb', marginVertical: 12 }} />
      <Text style={{ fontSize: 18, fontWeight: '700' }}>Analytics</Text>

      <Text style={{ fontWeight: '700' }}>Filters (optional)</Text>
      <TextInput
        placeholder="Team ID (leave empty for all teams you belong to)"
        value={teamId}
        onChangeText={setTeamId}
        autoCapitalize="none"
        style={{ backgroundColor: 'white', borderColor: '#111827', borderWidth: 1, borderRadius: 8, padding: 10 }}
      />
      <TextInput
        placeholder="Creator User ID (optional)"
        value={creatorId}
        onChangeText={setCreatorId}
        autoCapitalize="none"
        style={{ backgroundColor: 'white', borderColor: '#111827', borderWidth: 1, borderRadius: 8, padding: 10 }}
      />

      <Text style={{ fontWeight: '700', marginTop: 8 }}>Contract start (Month 1 begins)</Text>
      <TextInput
        placeholder="YYYY-MM-DD"
        value={contractStart}
        onChangeText={setContractStart}
        autoCapitalize="none"
        style={{ backgroundColor: 'white', borderColor: '#111827', borderWidth: 1, borderRadius: 8, padding: 10 }}
      />

      <Pressable
        onPress={loadAnalytics}
        disabled={busy}
        style={{ backgroundColor: busy ? colors.gray : colors.blue, paddingVertical: 10, borderRadius: 10, alignItems: 'center' }}>
        <Text style={{ color: 'white', fontWeight: '700' }}>{busy ? 'Loading…' : 'Load Analytics'}</Text>
      </Pressable>

      {/* Outputs */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontWeight: '700' }}>YTD (as of today): {ytd}</Text>

        <Text style={{ fontWeight: '700', marginTop: 8 }}>Monthly (cumulative)</Text>
        {monthly.length === 0 ? <Text style={{ color: '#6b7280' }}>No data yet.</Text> : null}
        {monthly.map((m, idx) => (
          <View key={m.month_start} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderColor: '#eee' }}>
            <Text>{new Date(m.month_start).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}</Text>
            <Text>{m.submitted} (cum {m.cumulative})</Text>
          </View>
        ))}

        <Text style={{ fontWeight: '700', marginTop: 8 }}>Current month (by day)</Text>
        {daily.length === 0 ? <Text style={{ color: '#6b7280' }}>No data yet.</Text> : null}
        {daily.map((d) => (
          <View key={d.day} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
            <Text>{d.day}</Text>
            <Text>{d.submitted}</Text>
          </View>
        ))}
      </View>

      <Text style={{ fontWeight: '700', marginTop: 12 }}>Ad-hoc date range</Text>
      <View style={{ flexDirection: isWeb ? 'row' : 'column', gap: 8 }}>
        <TextInput
          placeholder="Start YYYY-MM-DD"
          value={rangeStart}
          onChangeText={setRangeStart}
          autoCapitalize="none"
          style={{ flex: 1, backgroundColor: 'white', borderColor: '#111827', borderWidth: 1, borderRadius: 8, padding: 10 }}
        />
        <TextInput
          placeholder="End YYYY-MM-DD"
          value={rangeEnd}
          onChangeText={setRangeEnd}
          autoCapitalize="none"
          style={{ flex: 1, backgroundColor: 'white', borderColor: '#111827', borderWidth: 1, borderRadius: 8, padding: 10 }}
        />
      </View>
      <Pressable
        onPress={loadRange}
        disabled={busy}
        style={{ backgroundColor: busy ? colors.gray : colors.blue, paddingVertical: 10, borderRadius: 10, alignItems: 'center' }}>
        <Text style={{ color: 'white', fontWeight: '700' }}>{busy ? 'Loading…' : 'Count Range'}</Text>
      </Pressable>
      <Text>Range total: <Text style={{ fontWeight: '700' }}>{rangeTotal}</Text></Text>
    </ScrollView>
  );
}

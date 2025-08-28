import { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { colors } from '../../src/theme';

type Row = {
  id: string;
  created_at: string;
  store_site: string | null;
  store_location: string | null;
  price_per_unit: number | null;
  priority_level: number | null;

  // NEW: from RPC
  submitter_display_name: string | null;
};

function priColor(n: number | null | undefined) {
  return n === 1 ? '#ef4444' : n === 2 ? '#f59e0b' : '#22c55e';
}

function PriPill({ n }: { n: number | null }) {
  const label = String(n ?? 3);
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 9999,
        backgroundColor: priColor(n),
      }}
    >
      <Text style={{ color: 'white', fontWeight: '800' }}>{label}</Text>
    </View>
  );
}

export default function Submissions() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchRows() {
    setLoading(true);

    // NEW: use RPC that already joins auth.users to fetch submitter's display name
    const { data, error } = await supabase.rpc('list_team_submissions_with_submitter');
    if (!error && data) setRows(data as Row[]);

    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!cancelled) await fetchRows();
    })();

    // Realtime: refresh list on inserts/updates/deletes the user is allowed to see
    const channel = supabase
      .channel('submissions-list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'submissions' },
        () => fetchRows()
      )
      .subscribe();

    return () => {
      cancelled = true;
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, []);

  const renderItem = ({ item }: { item: Row }) => {
    const subtitle = new Date(item.created_at).toLocaleString();
    const price =
      typeof item.price_per_unit === 'number' ? `$${item.price_per_unit}` : '$-';
    const byline = item.submitter_display_name ? `by ${item.submitter_display_name}` : '';

    return (
      <Pressable
        onPress={() => router.push(`/submissions/${item.id}`)}
        style={{
          backgroundColor: 'white',
          borderWidth: 1,
          borderColor: '#111827',
          borderRadius: 10,
          padding: 12,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontWeight: '700' }}>
            {item.store_location || item.store_site || '(no store)'}
          </Text>
          <PriPill n={item.priority_level ?? 3} />
        </View>

        <Text>{subtitle}</Text>
        {byline ? <Text style={{ color: '#475569' }}>{byline}</Text> : null}
        <Text>{price}</Text>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 10 }}>
        Submissions
      </Text>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={renderItem}
      />

      <Pressable onPress={() => router.back()} style={{ alignSelf: 'flex-end', marginTop: 10 }}>
        <Text>Exit</Text>
      </Pressable>
    </View>
  );
}

import { useEffect, useState, useMemo } from 'react';
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

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      // RLS handles visibility (team members can read). No client-side OR filter needed.
      const { data, error } = await supabase
        .from('submissions')
        .select('id, created_at, store_site, store_location, price_per_unit, priority_level')
        .order('created_at', { ascending: false });

      if (!cancelled) {
        if (!error && data) setRows(data as Row[]);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const renderItem = ({ item }: { item: Row }) => {
    const subtitle = useMemo(
      () => new Date(item.created_at).toLocaleString(),
      [item.created_at]
    );

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
        <Text>
          ${item.price_per_unit ?? '-'}
        </Text>
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
      <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 10 }}>Submissions</Text>

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

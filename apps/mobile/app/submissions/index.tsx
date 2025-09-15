import { useEffect, useState, useMemo } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import Head from 'expo-router/head';
import { supabase } from '../../src/lib/supabase';
import { colors, textA11yProps, typography, theme } from '../../src/theme';
import { useUISettings } from '../../src/lib/uiSettings';

type Row = {
  id: string;
  created_at: string;
  store_site: string | null;
  store_location: string | null;
  price_per_unit: number | null;
  priority_level: number | null;
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
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 9999,
        backgroundColor: priColor(n),
        minHeight: 28,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessibilityLabel={`Priority ${label}`}
      accessible
    >
      <Text {...textA11yProps} style={{ color: 'white', fontWeight: '800' }}>{label}</Text>
    </View>
  );
}

export default function Submissions() {
  const { fontScale, highContrast, targetMinHeight } = useUISettings();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const titleStyle = useMemo(() => ({
    fontSize: Math.round(typography.title.fontSize * fontScale * 1.05),
    lineHeight: Math.round(typography.title.lineHeight * fontScale * 1.05),
    fontWeight: '700' as const,
  }), [fontScale]);

  const bodyStyle = useMemo(() => ({
    fontSize: Math.round(typography.body.fontSize * fontScale * 1.06),
    lineHeight: Math.round(typography.body.lineHeight * fontScale * 1.06),
  }), [fontScale]);

  async function fetchRows() {
    setLoading(true);
    const { data, error } = await supabase.rpc('list_team_submissions_with_submitter');
    if (!error && data) setRows(data as Row[]);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => { if (!cancelled) await fetchRows(); })();

    const channel = supabase
      .channel('submissions-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions' }, () => fetchRows())
      .subscribe();

    return () => {
      cancelled = true;
      try { supabase.removeChannel(channel); } catch {}
    };
  }, []);

  const renderItem = ({ item }: { item: Row }) => {
    const subtitle = new Date(item.created_at).toLocaleString();
    const price = typeof item.price_per_unit === 'number' ? `$${item.price_per_unit}` : '$-';
    const byline = item.submitter_display_name ? `by ${item.submitter_display_name}` : '';
    const title = item.store_location || item.store_site || '(no store)';
    const a11y = `Submission ${title}, ${subtitle}, ${byline || 'submitter unknown'}, price ${price}, priority ${item.priority_level ?? 3}`;

    return (
      <Pressable
        onPress={() => router.push(`/submissions/${item.id}`)}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        hitSlop={10}
        style={({ pressed }) => [
          {
            backgroundColor: 'white',
            borderWidth: 1,
            borderColor: highContrast ? '#000000' : '#111827',
            borderRadius: 12,
            padding: 16,
            minHeight: targetMinHeight, // ≥ ~48–56dp per guidelines
          },
          pressed && { opacity: 0.95 },
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 as any }}>
          <Text {...textA11yProps} style={[bodyStyle, { fontWeight: '700' }]}>{title}</Text>
          <PriPill n={item.priority_level ?? 3} />
        </View>
        <Text {...textA11yProps} style={bodyStyle}>{subtitle}</Text>
        {byline ? <Text {...textA11yProps} style={[bodyStyle, { color: '#475569' }]}>{byline}</Text> : null}
        <Text {...textA11yProps} style={bodyStyle}>{price}</Text>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        {/* Give the progressbar an accessible name */}
        <ActivityIndicator accessibilityLabel="Loading submissions" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: colors.gray }}>
      <Head><title>Submissions</title></Head>

      <Text {...textA11yProps} style={[titleStyle, { marginBottom: 10 }]}>Submissions</Text>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: theme.spacing(3) }}
      />
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Exit submissions"
        style={{ alignSelf: 'flex-end', marginTop: 10, minHeight: targetMinHeight, justifyContent: 'center' }}
      >
        <Text {...textA11yProps} style={bodyStyle}>Exit</Text>
      </Pressable>
    </View>
  );
}

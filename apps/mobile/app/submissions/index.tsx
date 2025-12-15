import { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, Image } from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Head from 'expo-router/head';
import { supabase } from '../../src/lib/supabase';
import { colors, textA11yProps, typography, theme } from '../../src/theme';
import { useUISettings } from '../../src/lib/uiSettings';
import { useIsAdmin } from '../../src/hooks/useIsAdmin';
import Button from '../../src/components/Button';
import logoPng from '../../assets/logo.png';

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
  const { isAdmin } = useIsAdmin();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const titleStyle = useMemo(() => ({
    fontSize: Math.round(typography.title.fontSize * fontScale * 1.05),
    lineHeight: Math.round(typography.title.lineHeight * fontScale * 1.05),
    fontWeight: '700' as const,
  }), [fontScale]);

  const bodyStyle = useMemo(() => ({
    fontSize: Math.round(typography.body.fontSize * fontScale * 1.06),
    lineHeight: Math.round(typography.body.lineHeight * fontScale * 1.06),
  }), [fontScale]);

  const fetchRows = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    const { data, error } = await supabase.rpc('list_team_submissions_with_submitter');
    if (!error && data) setRows(data as Row[]);

    if (silent) {
      setRefreshing(false);
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => { if (!cancelled) await fetchRows(); })();

    const channel = supabase
      .channel('submissions-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions' }, () => fetchRows({ silent: true }))
      .subscribe();

    return () => {
      cancelled = true;
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [fetchRows]);

  const handleRefresh = () => {
    fetchRows({ silent: true });
  };

  const handleBack = () => {
    Haptics.selectionAsync().catch(() => {});
    router.back();
  };

  const handleLogout = async () => {
    Haptics.selectionAsync().catch(() => {});
    await supabase.auth.signOut().catch(() => {});
    router.replace('/');
  };

  const goProfile = () => {
    Haptics.selectionAsync().catch(() => {});
    router.push('/account/settings');
  };

  const goAdmin = () => {
    Haptics.selectionAsync().catch(() => {});
    router.push('/admin');
  };

  const goNewForm = () => {
    Haptics.selectionAsync().catch(() => {});
    router.push('/form/new');
  };

  const openSubmission = (submissionId: string) => {
    Haptics.selectionAsync().catch(() => {});
    router.push(`/submissions/${submissionId}`);
  };

  const renderItem = ({ item }: { item: Row }) => {
    const subtitle = new Date(item.created_at).toLocaleString();
    const price = typeof item.price_per_unit === 'number' ? `$${item.price_per_unit}` : '$-';
    const byline = item.submitter_display_name ? `by ${item.submitter_display_name}` : '';
    const title = item.store_location || item.store_site || '(no store)';
    const a11y = `Submission ${title}, ${subtitle}, ${byline || 'submitter unknown'}, price ${price}, priority ${item.priority_level ?? 3}`;

    return (
      <Pressable
        onPress={() => openSubmission(item.id)}
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
    <View style={{ flex: 1, backgroundColor: '#f5f6fb' }}>
      <Head><title>Submissions</title></Head>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
            gap: 8,
          }}
        >
          <Pressable
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={{ paddingVertical: 8, paddingHorizontal: 4 }}
          >
            <Text {...textA11yProps} style={{ fontSize: 18, fontWeight: '600', color: '#2563eb' }}>← Back</Text>
          </Pressable>

          <View style={{ alignItems: 'center', flex: 1 }}>
            <Image
              source={logoPng}
              style={{ width: 64, height: 64, borderRadius: 32, marginBottom: 4 }}
              resizeMode="contain"
              accessibilityLabel="RWS globe"
            />
            <Text {...textA11yProps} style={[titleStyle, { marginBottom: 0 }]}>Submissions</Text>
            <Text {...textA11yProps} style={{ color: '#475569' }}>Every form fits in one view</Text>
          </View>

          <View style={{ minWidth: 110 }}>
            <Button
              title={refreshing ? 'Refreshing…' : 'Refresh'}
              onPress={handleRefresh}
              size="sm"
              variant="secondary"
              fullWidth
              accessibilityLabel="Refresh submissions"
            />
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <View style={{ flexBasis: '48%', flexGrow: 1 }}>
            <Button title="New Form" onPress={goNewForm} variant="success" fullWidth accessibilityLabel="Create new form" />
          </View>
          <View style={{ flexBasis: '48%', flexGrow: 1 }}>
            <Button title="Profile" onPress={goProfile} variant="primary" fullWidth accessibilityLabel="Open profile" />
          </View>
          {isAdmin ? (
            <View style={{ flexBasis: '48%', flexGrow: 1 }}>
              <Button title="Admin" onPress={goAdmin} variant="secondary" fullWidth accessibilityLabel="Admin panel" />
            </View>
          ) : null}
          <View style={{ flexBasis: '48%', flexGrow: 1 }}>
            <Button title="Logout" onPress={handleLogout} variant="error" fullWidth accessibilityLabel="Log out" />
          </View>
        </View>

        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
          ListEmptyComponent={!loading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <Text {...textA11yProps} style={bodyStyle}>No submissions yet.</Text>
            </View>
          ) : null}
        />

        <View style={{ paddingVertical: 16 }}>
          <Button
            title="Scroll to Submit Form"
            onPress={goNewForm}
            variant="success"
            size="lg"
            fullWidth
            accessibilityLabel="Jump to form submission"
          />
        </View>
      </View>
    </View>
  );
}

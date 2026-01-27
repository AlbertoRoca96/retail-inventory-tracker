import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Head from 'expo-router/head';
import { supabase } from '../../src/lib/supabase';
import { colors, textA11yProps, typography } from '../../src/theme';
import { useUISettings } from '../../src/lib/uiSettings';
import { useAuth } from '../../src/hooks/useAuth';
import LogoHeader from '../../src/components/LogoHeader';
import Button from '../../src/components/Button';

interface Row {
  id: string;
  created_at: string;
  store_site: string | null;
  store_location: string | null;
  location: string | null;
  price_per_unit: number | null;
  priority_level: number | null;
  created_by: string | null;
  status: string | null;
}

function priColor(n: number | null | undefined) {
  return n === 1 ? '#da291c' : n === 2 ? '#eeba2b' : '#99e169';
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
      <Text {...textA11yProps} style={{ color: 'white', fontWeight: '800' }}>
        {label}
      </Text>
    </View>
  );
}

export default function Submissions() {
  const { session, ready } = useAuth();
  const { fontScale, highContrast, targetMinHeight } = useUISettings();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [submitterNames, setSubmitterNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const bodyStyle = useMemo(() => ({
    fontSize: Math.round(typography.body.fontSize * fontScale * 1.06),
    lineHeight: Math.round(typography.body.lineHeight * fontScale * 1.06),
  }), [fontScale]);

  const fetchRows = useCallback(async (tid: string, opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    silent ? setRefreshing(true) : setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from('submissions')
        .select('id,created_at,store_site,store_location,location,price_per_unit,priority_level,created_by,status')
        .eq('team_id', tid)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      const nextRows = (data || []) as Row[];
      setRows(nextRows);

      const userIds = Array.from(new Set(nextRows.map((r) => r.created_by).filter(Boolean))) as string[];
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id,display_name,email')
          .in('id', userIds);
        const map: Record<string, string> = {};
        (profiles || []).forEach((p: any) => {
          const name = (p?.display_name || '').trim() || p?.email?.split('@')[0] || p?.id?.slice(0, 8) || '';
          if (p?.id) map[p.id] = name;
        });
        setSubmitterNames(map);
      }
    } catch (error) {
      console.error('submissions list load failed', error);
      setLoadError(error instanceof Error ? error.message : 'Unable to load submissions');
    } finally {
      silent ? setRefreshing(false) : setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (!ready || !session?.user) return;
      setLoading(true);
      const { data, error } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', session.user.id)
        .limit(1)
        .maybeSingle();
      if (error) {
        setLoadError(error.message);
        setLoading(false);
        return;
      }
      setTeamId(data?.team_id ?? null);
      if (!data?.team_id) {
        setLoadError('No team membership found.');
        setLoading(false);
        return;
      }
      await fetchRows(data.team_id, { silent: false });
    })();
  }, [ready, session?.user?.id, fetchRows]);

  const handleRefresh = async () => {
    if (!teamId) return;
    setRefreshing(true);
    await fetchRows(teamId, { silent: true });
  };

  const openSubmission = (submissionId: string) => {
    Haptics.selectionAsync().catch(() => {});
    router.push(`/submissions/${submissionId}`);
  };

  const renderItem = ({ item }: { item: Row }) => {
    const subtitle = new Date(item.created_at).toLocaleString();
    const price = typeof item.price_per_unit === 'number' ? `$${item.price_per_unit}` : '$-';
    const submitter = item.created_by ? (submitterNames[item.created_by] || item.created_by.slice(0, 8)) : '';
    const byline = submitter ? `Created by ${submitter}` : '';
    const title = item.store_site || item.store_location || '(no store)';

    return (
      <Pressable
        onPress={() => openSubmission(item.id)}
        accessibilityRole="button"
        accessibilityLabel={`Submission ${title}, ${subtitle}`}
        hitSlop={10}
        style={({ pressed }) => [
          {
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: highContrast ? colors.black : colors.border,
            borderRadius: 18,
            padding: 18,
            minHeight: targetMinHeight,
            width: '100%',
          },
          pressed && { opacity: 0.92 },
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 as any }}>
          <Text {...textA11yProps} style={[bodyStyle, { fontWeight: '700' }]}>
            {title}
          </Text>
          <PriPill n={item.priority_level ?? 3} />
        </View>
        <Text {...textA11yProps} style={bodyStyle}>{subtitle}</Text>
        {byline ? (
          <Text {...textA11yProps} style={[bodyStyle, { color: colors.textMuted }]}>
            {byline} · {item.status || 'status: n/a'}
          </Text>
        ) : null}
        <Text {...textA11yProps} style={bodyStyle}>{price}</Text>
      </Pressable>
    );
  };

  if (!ready) {
    return (
      <SafeAreaView style={styles.safe}>
        <LogoHeader title="Your Submissions" />
        <View style={styles.centerContainer}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  if (!session?.user) {
    return (
      <SafeAreaView style={styles.safe}>
        <LogoHeader title="Your Submissions" />
        <View style={styles.centerContainer}>
          <Text>Please sign in.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <LogoHeader title="Your Submissions" />
        <View style={styles.centerContainer}>
          <ActivityIndicator accessibilityLabel="Loading submissions" />
        </View>
      </SafeAreaView>
    );
  }

  if (!teamId) {
    return (
      <SafeAreaView style={styles.safe}>
        <LogoHeader title="Your Submissions" />
        <View style={styles.centerContainer}>
          <Text>You are not assigned to a team.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Head><title>Submissions</title></Head>
      <LogoHeader title="Your Submissions" />
      {loadError ? (
        <View style={styles.centerContainer}>
          <Text style={{ color: '#dc2626' }}>{loadError}</Text>
          <View style={{ marginTop: 16 }}>
            <Button title="Try Again" onPress={() => fetchRows(teamId)} />
          </View>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={styles.emptyTitle}>No submissions yet</Text>
              <Text style={styles.subtitle}>Pull down to refresh after your first entry.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  listContent: {
    padding: 16,
    paddingBottom: 120,
  },
  emptyTitle: {
    ...typography.title,
    fontSize: 20,
    marginBottom: 8,
    color: colors.text,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Linking, Alert, Pressable } from 'react-native';
import Button from '../components/Button';
import { supabase } from '../lib/supabase';
import { Submission } from '../types';
import { theme } from '../theme';

/**
 * This screen now supports BOTH the legacy "photo*_path" (signed URL)
 * and the new "photo*_url" (public URL in `photos` bucket).
 * It keeps the existing UI/controls and only adds the new logic.
 */

export default function ViewSubmissionsScreen({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<Submission[]>([]);
  const [sort, setSort] = useState<'recent' | 'az'>('recent');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      // Keep the same table read; RLS already scopes to the viewer's team(s)
      let query = supabase.from('submissions').select('*');
      if (sort === 'recent') query = query.order('created_at', { ascending: false });
      if (sort === 'az') query = query.order('store_location', { ascending: true });
      const { data, error } = await query;
      if (error) throw error;
      setItems((data || []) as Submission[]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [sort]);

  // ---- URL helpers ---------------------------------------------------------
  const openUrl = async (url?: string | null) => {
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Error', 'Could not open link.');
    }
  };

  const openSignedFromPossibleBuckets = async (path?: string | null) => {
    if (!path) return;

    // Try the legacy 'submissions' bucket first (your original code),
    // then fall back to 'photos' (the new uploader default).
    const tryBucket = async (bucket: string) => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60, { download: true });
      return error ? null : data?.signedUrl ?? null;
    };

    const fromSubmissions = await tryBucket('submissions');
    const url = fromSubmissions || (await tryBucket('photos'));
    if (!url) {
      Alert.alert('Error', 'Could not create a download URL.');
      return;
    }
    await openUrl(url);
  };

  const renderItem = ({ item }: { item: Submission }) => {
    const created = useMemo(
      () => new Date(item.created_at).toLocaleDateString(),
      [item.created_at]
    );

    // Prefer public URLs; fall back to signed download by path if needed.
    const photo1Click = () => (item.photo1_url ? openUrl(item.photo1_url) : openSignedFromPossibleBuckets(item.photo1_path));
    const photo2Click = () => (item.photo2_url ? openUrl(item.photo2_url) : openSignedFromPossibleBuckets(item.photo2_path));

    return (
      <View style={styles.card}>
        <Text style={styles.title}>{item.store_location} — {created}</Text>
        {item.brand ? <Text>Brand: {item.brand}</Text> : null}
        {item.store_site ? <Text>Store site: {item.store_site}</Text> : null}
        {item.location ? <Text>Location: {item.location}</Text> : null}
        <Text>Price: {item.price_per_unit ?? '-'}</Text>
        <Text>On shelf: {item.on_shelf ?? '-'}</Text>
        {Array.isArray(item.tags) ? <Text>Tags: {item.tags.join(', ')}</Text> : null}
        {item.notes ? <Text>Notes: {item.notes}</Text> : null}

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          <Button title="Photo 1" onPress={photo1Click} />
          <Button title="Photo 2" onPress={photo2Click} />
        </View>

        {/* Extra action: open the detail route (keeps existing behavior possible) */}
        <Pressable
          onPress={() => Linking.openURL(`/submissions/${item.id}`)}
          style={{ alignSelf: 'flex-end', marginTop: 6 }}
        >
          <Text style={{ color: '#2563eb', fontWeight: '600' }}>Details</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
        <Text style={styles.header}>Submissions</Text>
        <View style={{ flexDirection:'row' }}>
          <Button title="Recent" onPress={() => setSort('recent')} />
          <Button title="A→Z" onPress={() => setSort('az')} variant="secondary" />
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        onRefresh={load}
        refreshing={loading}
        ListEmptyComponent={<Text>No submissions found.</Text>}
        contentContainerStyle={{ paddingBottom: 16 }}
      />
      <Button title="Back" onPress={onBack} variant="secondary" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, paddingHorizontal: theme.spacing(1) },
  header: { fontSize: 20, fontWeight: '700', marginVertical: 8 },
  card: { borderWidth:1, borderColor:'#000', borderRadius:12, padding:12, marginVertical: 6 },
  title: { fontWeight: '600' }
});

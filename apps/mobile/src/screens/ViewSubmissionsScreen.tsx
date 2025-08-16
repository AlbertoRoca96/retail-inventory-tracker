import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Linking, Alert } from 'react-native';
import Button from '../components/Button';
import { supabase } from '../lib/supabase';
import { Submission } from '../types';
import { theme } from '../theme';

export default function ViewSubmissionsScreen({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<Submission[]>([]);
  const [sort, setSort] = useState<'recent' | 'az'>('recent');

  const load = async () => {
    let query = supabase.from('submissions').select('*');
    if (sort === 'recent') query = query.order('created_at', { ascending: false });
    if (sort === 'az') query = query.order('store_location', { ascending: true });
    const { data, error } = await query;
    if (error) { Alert.alert('Error', error.message); return; }
    setItems(data as Submission[]);
  };

  useEffect(() => { load(); }, [sort]);

  const openSigned = async (path: string | null | undefined) => {
    if (!path) return;
    const { data, error } = await supabase.storage.from('submissions').createSignedUrl(path, 60, { download: true });
    if (error) { Alert.alert('Error', error.message); return; }
    if (data?.signedUrl) await Linking.openURL(data.signedUrl);
  };

  const renderItem = ({ item }: { item: Submission }) => (
    <View style={styles.card}>
      <Text style={styles.title}>{item.store_location} — {new Date(item.created_at).toLocaleDateString()}</Text>
      <Text>Price: {item.price_per_unit ?? '-'}</Text>
      <Text>On shelf: {item.on_shelf ?? '-'}</Text>
      <View style={{flexDirection:'row'}}>
        <Button title="Download Photo 1" onPress={() => openSigned(item.photo1_path)} />
        <Button title="Download Photo 2" onPress={() => openSigned(item.photo2_path)} />
      </View>
    </View>
  );

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
        ListEmptyComponent={<Text>No submissions found.</Text>}
      />
      <Button title="Back" onPress={onBack} variant="secondary" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1 },
  header: { fontSize: 20, fontWeight: '700', marginVertical: 8 },
  card: { borderWidth:1, borderColor:'#000', borderRadius:12, padding:12, marginVertical: 6 },
  title: { fontWeight: '600' }
});

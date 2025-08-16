import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Alert, Image } from 'react-native';
import Button from '../components/Button';
import { supabase } from '../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../theme';

export default function CreateFormScreen({ onBack }: { onBack: () => void }) {
  const [date, setDate] = useState<string>('');
  const [storeLocation, setStoreLocation] = useState('');
  const [conditions, setConditions] = useState('');
  const [price, setPrice] = useState('');
  const [shelfSpace, setShelfSpace] = useState('');
  const [onShelf, setOnShelf] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [photo1, setPhoto1] = useState<string | null>(null);
  const [photo2, setPhoto2] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('team_members').select('team_id').then(({ data }) => {
      if (data && data.length) setTeamId(data[0].team_id);
    });
  }, []);

  const pickImage = async (slot: 1 | 2) => {
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (res.canceled) return;
    const uri = res.assets[0].uri;
    if (slot === 1) setPhoto1(uri); else setPhoto2(uri);
  };

  const submit = async () => {
    try {
      if (!teamId) { Alert.alert('Missing team'); return; }
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) { Alert.alert('No user'); return; }
      const { data: inserted, error } = await supabase.from('submissions').insert({
        created_by: user.id,
        team_id: teamId,
        date,
        store_location: storeLocation,
        conditions,
        price_per_unit: price ? Number(price) : null,
        shelf_space: shelfSpace,
        on_shelf: onShelf ? Number(onShelf) : null,
        tags: tags ? tags.split(',').map(t => t.trim()) : [],
        notes
      }).select('*').single();
      if (error) throw error;

      const doUpload = async (localUri: string, slot: 1 | 2) => {
        const resp = await fetch(localUri);
        const blob = await resp.blob();
        const key = `u_${inserted.id}/photo${slot}.jpg`;
        const { error: upErr } = await supabase.storage.from('submissions').upload(key, blob, { upsert: true, contentType: 'image/jpeg' });
        if (upErr) throw upErr;
        const patch = slot === 1 ? { photo1_path: key } : { photo2_path: key };
        await supabase.from('submissions').update(patch).eq('id', inserted.id);
      };

      if (photo1) await doUpload(photo1, 1);
      if (photo2) await doUpload(photo2, 2);

      Alert.alert('Submitted', 'Your submission was saved.');
      onBack();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create New Form</Text>
      <TextInput placeholder="DATE (YYYY-MM-DD)" value={date} onChangeText={setDate} style={styles.input} />
      <TextInput placeholder="STORE LOCATION" value={storeLocation} onChangeText={setStoreLocation} style={styles.input} />
      <TextInput placeholder="CONDITIONS" value={conditions} onChangeText={setConditions} style={styles.input} />
      <TextInput placeholder="PRICE PER UNIT" value={price} onChangeText={setPrice} style={styles.input} keyboardType="decimal-pad" />
      <TextInput placeholder="SHELF SPACE" value={shelfSpace} onChangeText={setShelfSpace} style={styles.input} />
      <TextInput placeholder="ON SHELF" value={onShelf} onChangeText={setOnShelf} style={styles.input} keyboardType="numeric" />
      <TextInput placeholder="TAGS (comma-separated)" value={tags} onChangeText={setTags} style={styles.input} />
      <TextInput placeholder="NOTES" value={notes} onChangeText={setNotes} style={[styles.input, {height: 120}]} multiline />

      <View style={{ flexDirection:'row', justifyContent:'space-between' }}>
        <Button title={photo1 ? 'Retake Photo 1' : 'Take Photo 1'} onPress={() => pickImage(1)} />
        <Button title={photo2 ? 'Retake Photo 2' : 'Take Photo 2'} onPress={() => pickImage(2)} />
      </View>
      <View style={{flexDirection:'row', justifyContent:'space-between'}}>
        {photo1 ? <Image source={{ uri: photo1 }} style={{ width: 140, height: 140, marginRight: 8 }} /> : null}
        {photo2 ? <Image source={{ uri: photo2 }} style={{ width: 140, height: 140 }} /> : null}
      </View>

      <Button title="Submit" onPress={submit} />
      <Button title="Back" onPress={onBack} variant="secondary" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing(2) },
  title: { fontSize: 22, fontWeight: '700', marginBottom: theme.spacing(2) },
  input: { borderWidth:1, borderColor:'#000', borderRadius:12, padding:12, marginVertical:6 }
});

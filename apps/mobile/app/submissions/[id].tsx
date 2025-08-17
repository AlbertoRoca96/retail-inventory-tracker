import { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { colors } from '../../src/theme';

type Row = any;

function toCsv(r: Row) {
  const cells = [
    ['DATE', r.date ?? ''],
    ['STORE LOCATION', r.store_location ?? ''],
    ['CONDITIONS', r.conditions ?? ''],
    ['PRICE PER UNIT', r.price_per_unit ?? ''],
    ['SHELF SPACE', r.shelf_space ?? ''],
    ['ON SHELF', r.on_shelf ?? ''],
    ['TAGS', r.tags ?? ''],
    ['NOTES', r.notes ?? ''],
    ['PHOTO 1', r.photo1_url ?? ''],
    ['PHOTO 2', r.photo2_url ?? '']
  ];
  return cells.map(([k,v]) => `"${k}","${String(v).replace(/"/g,'""')}"`).join('\n');
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 500);
}

export default function Submission() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [row, setRow] = useState<Row|null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('submissions').select('*').eq('id', id).single();
      setRow(data as Row);
    })();
  }, [id]);

  if (!row) return null;

  const share = async () => {
    const csv = toCsv(row);
    if (navigator.share) {
      const file = new File([csv], 'submission.csv', { type: 'text/csv' });
      // @ts-ignore - web share with files
      await navigator.share({ title: 'Submission', text: 'See attached CSV', files: [file] }).catch(()=>{});
    } else {
      download('submission.csv', csv);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding:16, gap:10 }}>
      <Text style={{ fontSize:20, fontWeight:'700' }}>Submission</Text>
      <Text>{row.store_location}</Text>
      <Text>{row.date}</Text>
      <Text>Conditions: {row.conditions}</Text>
      <Text>Price per unit: {row.price_per_unit}</Text>
      <Text>Shelf space: {row.shelf_space}</Text>
      <Text>On shelf: {row.on_shelf}</Text>
      <Text>Tags: {row.tags}</Text>
      <Text>Notes: {row.notes}</Text>

      <View style={{ flexDirection:'row', gap:10 }}>
        {row.photo1_url ? <Image source={{ uri: row.photo1_url }} style={{ flex:1, height:140, borderRadius:10 }} /> : null}
        {row.photo2_url ? <Image source={{ uri: row.photo2_url }} style={{ flex:1, height:140, borderRadius:10 }} /> : null}
      </View>

      <View style={{ flexDirection:'row', gap:10, marginTop:12 }}>
        <Pressable onPress={() => download('submission.csv', toCsv(row))}
          style={{ flex:1, backgroundColor: colors.blue, padding:12, borderRadius:10, alignItems:'center' }}>
          <Text style={{ color:'white', fontWeight:'700' }}>Download</Text>
        </Pressable>
        <Pressable onPress={share}
          style={{ flex:1, backgroundColor: colors.blue, padding:12, borderRadius:10, alignItems:'center' }}>
          <Text style={{ color:'white', fontWeight:'700' }}>Share</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => history.back()} style={{ alignSelf:'flex-end', marginTop:10 }}>
        <Text>Exit</Text>
      </Pressable>
    </ScrollView>
  );
}

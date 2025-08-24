import { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { colors } from '../../src/theme';

type Row = any;

// CSV now includes brand, store_site, and location. Tags are joined if array.
function toCsv(r: Row) {
  const tags =
    Array.isArray(r.tags) ? r.tags.join(', ') : (r.tags ?? '');
  const cells = [
    ['DATE', r.date ?? ''],
    ['BRAND', r.brand ?? ''],
    ['STORE SITE', r.store_site ?? ''],
    ['STORE LOCATION', r.store_location ?? ''],
    ['LOCATIONS', r.location ?? ''],
    ['CONDITIONS', r.conditions ?? ''],
    ['PRICE PER UNIT', r.price_per_unit ?? ''],
    ['SHELF SPACE', r.shelf_space ?? ''],
    ['ON SHELF', r.on_shelf ?? ''],
    ['TAGS', tags],
    ['NOTES', r.notes ?? ''],
    ['PHOTO 1', r.photo1_url ?? r.photo1_path ?? ''],
    ['PHOTO 2', r.photo2_url ?? r.photo2_path ?? ''],
  ];
  return cells
    .map(([k, v]) => `"${k}","${String(v).replace(/"/g, '""')}"`)
    .join('\n');
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export default function Submission() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [row, setRow] = useState<Row | null>(null);

  // If record only has *paths*, we’ll generate short-lived signed URLs here.
  const [photo1Url, setPhoto1Url] = useState<string | null>(null);
  const [photo2Url, setPhoto2Url] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('submissions').select('*').eq('id', id).single();
      const r = data as Row;
      setRow(r);

      // Prefer stored public URLs; otherwise sign the path (try legacy/new buckets).
      const resolveSigned = async (path?: string | null) => {
        if (!path) return null;
        const tryBucket = async (bucket: string) => {
          const { data, error } = await supabase.storage
            .from(bucket)
            .createSignedUrl(path, 60, { download: true });
          return error ? null : data?.signedUrl ?? null;
        };
        return (await tryBucket('submissions')) || (await tryBucket('photos'));
      };

      setPhoto1Url(r?.photo1_url ?? (await resolveSigned(r?.photo1_path)));
      setPhoto2Url(r?.photo2_url ?? (await resolveSigned(r?.photo2_path)));
    })();
  }, [id]);

  if (!row) return null;

  const share = async () => {
    const csv = toCsv(row);
    if (navigator.share) {
      const file = new File([csv], 'submission.csv', { type: 'text/csv' });
      // @ts-ignore - web share with files
      await navigator.share({ title: 'Submission', text: 'See attached CSV', files: [file] }).catch(() => {});
    } else {
      download('submission.csv', csv);
    }
  };

  const tagsText = Array.isArray(row.tags) ? row.tags.join(', ') : (row.tags ?? '');

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text style={{ fontSize: 20, fontWeight: '700' }}>Submission</Text>

      {/* New fields displayed up top while keeping your existing ones */}
      {row.brand ? <Text>Brand: {row.brand}</Text> : null}
      {row.store_site ? <Text>Store site: {row.store_site}</Text> : null}

      <Text>{row.store_location}</Text>
      {row.location ? <Text>Location: {row.location}</Text> : null}
      <Text>{row.date}</Text>

      <Text>Conditions: {row.conditions}</Text>
      <Text>Price per unit: {row.price_per_unit}</Text>
      <Text>Shelf space: {row.shelf_space}</Text>
      <Text>On shelf: {row.on_shelf}</Text>
      <Text>Tags: {tagsText}</Text>
      <Text>Notes: {row.notes}</Text>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {photo1Url ? (
          <Image source={{ uri: photo1Url }} style={{ flex: 1, height: 140, borderRadius: 10 }} />
        ) : null}
        {photo2Url ? (
          <Image source={{ uri: photo2Url }} style={{ flex: 1, height: 140, borderRadius: 10 }} />
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <Pressable
          onPress={() => download('submission.csv', toCsv(row))}
          style={{ flex: 1, backgroundColor: colors.blue, padding: 12, borderRadius: 10, alignItems: 'center' }}
        >
          <Text style={{ color: 'white', fontWeight: '700' }}>Download</Text>
        </Pressable>
        <Pressable
          onPress={share}
          style={{ flex: 1, backgroundColor: colors.blue, padding: 12, borderRadius: 10, alignItems: 'center' }}
        >
          <Text style={{ color: 'white', fontWeight: '700' }}>Share</Text>
        </Pressable>
      </View>

      {/* Keep your Exit button; add router.back() for web/native safety */}
      <Pressable
        onPress={() => (typeof history !== 'undefined' ? history.back() : router.back())}
        style={{ alignSelf: 'flex-end', marginTop: 10 }}
      >
        <Text>Exit</Text>
      </Pressable>
    </ScrollView>
  );
}

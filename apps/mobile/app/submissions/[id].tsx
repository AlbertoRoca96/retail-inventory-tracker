import { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { colors } from '../../src/theme';
import { downloadSubmissionExcel } from '../../src/lib/exportExcel';

type Row = {
  id: string;
  created_at: string;
  created_by: string;
  team_id: string;

  date: string | null;
  store_site: string | null;
  store_location: string | null;
  location: string | null;
  brand: string | null;
  conditions: string | null;
  price_per_unit: number | null;
  shelf_space: string | null;
  on_shelf: number | null;
  tags: string[] | string | null;
  notes: string | null;

  photo1_url?: string | null;
  photo2_url?: string | null;
  photo1_path?: string | null; // legacy fallback signing
  photo2_path?: string | null; // legacy fallback signing

  priority_level?: number | null;

  // NEW (from RPC):
  submitter_email?: string | null;
};

function PriPill({ n }: { n: number | null | undefined }) {
  const label = String(n ?? 3);
  const bg = n === 1 ? '#ef4444' : n === 2 ? '#f59e0b' : '#22c55e';
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, backgroundColor: bg }}>
      <Text style={{ color: 'white', fontWeight: '800' }}>{label}</Text>
    </View>
  );
}

// CSV helper (CSV itself can't embed images; keep URLs for compatibility)
function toCsv(r: Row) {
  const tags =
    Array.isArray(r.tags) ? r.tags.join(', ') :
    (typeof r.tags === 'string' ? r.tags : '');
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
    ['PRIORITY LEVEL', r.priority_level ?? ''],
    ['SUBMITTED BY', r.submitter_email || r.created_by || ''],
    ['PHOTO 1', r.photo1_url ?? r.photo1_path ?? ''],
    ['PHOTO 2', r.photo2_url ?? r.photo2_path ?? ''],
  ];
  return cells.map(([k, v]) => `"${k}","${String(v).replace(/"/g, '""')}"`).join('\n');
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
    if (!id) return;

    (async () => {
      // 1) Prefer the secure RPC (includes submitter_email; enforces team membership)
      const rpc = await supabase.rpc('get_submission_with_submitter', { sub_id: id as any });
      const r = Array.isArray(rpc.data) ? (rpc.data[0] as Row) : (rpc.data as Row | null);

      // 2) If RPC unavailable for some reason, fall back to the raw table (you’ll still have access via RLS).
      let dataRow: Row | null = r ?? null;
      if (!dataRow) {
        const { data } = await supabase.from('submissions').select('*').eq('id', id).maybeSingle();
        dataRow = (data as Row) ?? null;
      }

      if (!dataRow) return;
      setRow(dataRow);

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

      setPhoto1Url(dataRow.photo1_url ?? (await resolveSigned(dataRow.photo1_path)));
      setPhoto2Url(dataRow.photo2_url ?? (await resolveSigned(dataRow.photo2_path)));
    })();
  }, [id]);

  if (!row) return null;

  // Download an .xlsx with embedded images (Excel/Numbers will display them)
  const downloadExcelWithPhotos = async () => {
    const photos: string[] = [];
    const p1 = row.photo1_url || photo1Url || null;
    const p2 = row.photo2_url || photo2Url || null;
    if (p1) photos.push(p1);
    if (p2) photos.push(p2);

    await downloadSubmissionExcel({
      store_site: row.store_site || '',
      date: row.date || '',
      brand: row.brand || '',
      store_location: row.store_location || '',
      location: row.location || '',
      conditions: row.conditions || '',
      price_per_unit: String(row.price_per_unit ?? ''),
      shelf_space: row.shelf_space || '',
      on_shelf: String(row.on_shelf ?? ''),
      tags: Array.isArray(row.tags) ? row.tags.join(', ') : (typeof row.tags === 'string' ? row.tags : ''),
      notes: row.notes || '',
      photo_urls: photos,
    });
  };

  const share = async () => {
    const csv = toCsv(row);
    if (navigator.share) {
      const file = new File([csv], 'submission.csv', { type: 'text/csv' });
      // @ts-ignore - Web Share with files
      await navigator.share({ title: 'Submission', text: 'See attached CSV', files: [file] }).catch(() => {});
    } else {
      download('submission.csv', csv);
    }
  };

  const tagsText =
    Array.isArray(row.tags) ? row.tags.join(', ') :
    (typeof row.tags === 'string' ? row.tags : '');

  const submittedBy = row.submitter_email || row.created_by || '';

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text style={{ fontSize: 20, fontWeight: '700' }}>Submission</Text>

      {/* Header with priority badge */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontWeight: '700' }}>{row.store_location || row.store_site || ''}</Text>
        <PriPill n={row.priority_level ?? 3} />
      </View>

      {/* NEW: submitter identity (email preferred, else UUID) */}
      <Text style={{ color: '#475569' }}>Submitted by: {submittedBy}</Text>

      {row.brand ? <Text>Brand: {row.brand}</Text> : null}
      {row.store_site ? <Text>Store site: {row.store_site}</Text> : null}
      {row.location ? <Text>Location: {row.location}</Text> : null}
      <Text>{row.date}</Text>

      <Text>Conditions: {row.conditions}</Text>
      <Text>Price per unit: {row.price_per_unit}</Text>
      <Text>Shelf space: {row.shelf_space}</Text>
      <Text>On shelf: {row.on_shelf}</Text>
      <Text>Tags: {tagsText}</Text>
      <Text>Notes: {row.notes}</Text>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {photo1Url ? <Image source={{ uri: photo1Url }} style={{ flex: 1, height: 140, borderRadius: 10 }} /> : null}
        {photo2Url ? <Image source={{ uri: photo2Url }} style={{ flex: 1, height: 140, borderRadius: 10 }} /> : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <Pressable
          onPress={downloadExcelWithPhotos}
          style={{ flex: 1, backgroundColor: colors.blue, padding: 12, borderRadius: 10, alignItems: 'center' }}
        >
          <Text style={{ color: 'white', fontWeight: '700' }}>Download Excel (with photos)</Text>
        </Pressable>
        <Pressable
          onPress={share}
          style={{ flex: 1, backgroundColor: colors.blue, padding: 12, borderRadius: 10, alignItems: 'center' }}
        >
          <Text style={{ color: 'white', fontWeight: '700' }}>Share CSV</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => (typeof history !== 'undefined' ? history.back() : router.back())}
        style={{ alignSelf: 'flex-end', marginTop: 10 }}
      >
        <Text>Exit</Text>
      </Pressable>
    </ScrollView>
  );
}

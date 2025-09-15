// apps/mobile/app/submissions/[id].tsx
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, ScrollView, Pressable } from 'react-native';
import { router, useLocalSearchParams, Head } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { colors, theme, typography, textA11yProps } from '../../src/theme';
import { useUISettings } from '../../src/lib/uiSettings';
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
  photo1_path?: string | null;
  photo2_path?: string | null;

  priority_level?: number | null;

  submitter_email?: string | null;
  submitter_display_name?: string | null;
};

function priColor(n: number | null | undefined) {
  return n === 1 ? '#ef4444' : n === 2 ? '#f59e0b' : '#22c55e';
}

function PriPill({ n }: { n: number | null | undefined }) {
  const label = String(n ?? 3);
  const bg = priColor(n ?? 3);
  return (
    <View
      accessible
      accessibilityLabel={`Priority ${label}`}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 9999,
        backgroundColor: bg,
        minHeight: 28,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text {...textA11yProps} style={{ color: 'white', fontWeight: '800' }}>{label}</Text>
    </View>
  );
}

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
    ['SUBMITTED BY', r.submitter_display_name || r.submitter_email || r.created_by || ''],
    ['PHOTO 1', r.photo1_url ?? r.photo1_path ?? ''],
    ['PHOTO 2', r.photo2_url ?? r.photo2_path ?? ''],
  ];
  return cells.map(([k, v]) => `"${k}","${String(v).replace(/"/g, '""')}"`).join('\n');
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export default function Submission() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { fontScale, highContrast, targetMinHeight } = useUISettings();

  const [row, setRow] = useState<Row | null>(null);
  const [photo1Url, setPhoto1Url] = useState<string | null>(null);
  const [photo2Url, setPhoto2Url] = useState<string | null>(null);

  const titleStyle = useMemo(() => ({
    fontSize: Math.round(typography.title.fontSize * fontScale * 1.05),
    lineHeight: Math.round(typography.title.lineHeight * fontScale * 1.05),
    fontWeight: '700' as const,
  }), [fontScale]);

  const labelStyle = useMemo(() => ({
    fontWeight: '700' as const,
    fontSize: Math.round(typography.body.fontSize * fontScale * 1.05),
    lineHeight: Math.round(typography.body.lineHeight * fontScale * 1.05),
  }), [fontScale]);

  const bodyStyle = useMemo(() => ({
    fontSize: Math.round(typography.body.fontSize * fontScale * 1.06),
    lineHeight: Math.round(typography.body.lineHeight * fontScale * 1.06),
  }), [fontScale]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const rpc = await supabase.rpc('get_submission_with_submitter', { sub_id: id as any });
      const r = Array.isArray(rpc.data) ? (rpc.data[0] as Row) : (rpc.data as Row | null);

      let dataRow: Row | null = r ?? null;
      if (!dataRow) {
        const { data } = await supabase.from('submissions').select('*').eq('id', id).maybeSingle();
        dataRow = (data as Row) ?? null;
      }
      if (!dataRow) return;
      setRow(dataRow);

      const resolveSigned = async (path?: string | null) => {
        if (!path) return null;
        const tryBucket = async (bucket: string) => {
          const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60, { download: true });
          return error ? null : data?.signedUrl ?? null;
        };
        return (await tryBucket('submissions')) || (await tryBucket('photos'));
      };

      setPhoto1Url(dataRow.photo1_url ?? (await resolveSigned(dataRow.photo1_path)));
      setPhoto2Url(dataRow.photo2_url ?? (await resolveSigned(dataRow.photo2_path)));
    })();
  }, [id]);

  if (!row) return null;

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
      // @ts-ignore
      await navigator.share({ title: 'Submission', text: 'See attached CSV', files: [file] }).catch(() => {});
    } else {
      download('submission.csv', csv);
    }
  };

  const tagsText = Array.isArray(row.tags) ? row.tags.join(', ') : (typeof row.tags === 'string' ? row.tags : '');
  const submittedBy = row.submitter_display_name || row.submitter_email || row.created_by || '';

  const btnBg = highContrast ? '#1743b3' : colors.blue;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 as any }}>
      <Head><title>Submission</title></Head>

      <Text {...textA11yProps} style={titleStyle}>Submission</Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 as any }}>
        <Text {...textA11yProps} style={labelStyle}>
          {row.store_location || row.store_site || ''}
        </Text>
        <PriPill n={row.priority_level ?? 3} />
      </View>

      <Text {...textA11yProps} style={[bodyStyle, { color: '#475569' }]}>
        Submitted by: {submittedBy}
      </Text>

      {row.brand ? <Text {...textA11yProps} style={bodyStyle}>Brand: {row.brand}</Text> : null}
      {row.store_site ? <Text {...textA11yProps} style={bodyStyle}>Store site: {row.store_site}</Text> : null}
      {row.location ? <Text {...textA11yProps} style={bodyStyle}>Location: {row.location}</Text> : null}
      <Text {...textA11yProps} style={bodyStyle}>{row.date}</Text>

      <Text {...textA11yProps} style={bodyStyle}>Conditions: {row.conditions}</Text>
      <Text {...textA11yProps} style={bodyStyle}>Price per unit: {row.price_per_unit}</Text>
      <Text {...textA11yProps} style={bodyStyle}>Shelf space: {row.shelf_space}</Text>
      <Text {...textA11yProps} style={bodyStyle}>On shelf: {row.on_shelf}</Text>
      <Text {...textA11yProps} style={bodyStyle}>Tags: {tagsText}</Text>
      <Text {...textA11yProps} style={bodyStyle}>Notes: {row.notes}</Text>

      <View style={{ flexDirection: 'row', gap: 12 as any }}>
        {photo1Url ? (
          <Image
            source={{ uri: photo1Url }}
            accessibilityLabel="Photo 1"
            style={{ flex: 1, height: 160, borderRadius: 12, borderWidth: 1, borderColor: '#111' }}
          />
        ) : null}
        {photo2Url ? (
          <Image
            source={{ uri: photo2Url }}
            accessibilityLabel="Photo 2"
            style={{ flex: 1, height: 160, borderRadius: 12, borderWidth: 1, borderColor: '#111' }}
          />
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 12 as any, marginTop: 4 }}>
        <Pressable
          onPress={downloadExcelWithPhotos}
          accessibilityRole="button"
          accessibilityLabel="Download Excel with photos"
          style={[theme.button, { backgroundColor: btnBg, minHeight: targetMinHeight }]}
        >
          <Text {...textA11yProps} style={theme.buttonText}>Download Excel (with photos)</Text>
        </Pressable>
        <Pressable
          onPress={share}
          accessibilityRole="button"
          accessibilityLabel="Share CSV"
          style={[theme.button, { backgroundColor: btnBg, minHeight: targetMinHeight }]}
        >
          <Text {...textA11yProps} style={theme.buttonText}>Share CSV</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => (typeof history !== 'undefined' ? history.back() : router.back())}
        accessibilityRole="button"
        accessibilityLabel="Exit"
        style={{ alignSelf: 'flex-end', marginTop: 10, minHeight: targetMinHeight, justifyContent: 'center' }}
      >
        <Text {...textA11yProps} style={bodyStyle}>Exit</Text>
      </Pressable>
    </ScrollView>
  );
}

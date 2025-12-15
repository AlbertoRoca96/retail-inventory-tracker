import { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, ScrollView, Pressable, Platform, Alert, StyleSheet } from 'react-native';
import Button from '../../src/components/Button';
import { router, useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { supabase } from '../../src/lib/supabase';
import { colors, theme, typography, textA11yProps } from '../../src/theme';
import { useUISettings } from '../../src/lib/uiSettings';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

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

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});

function PriPill({ n }: { n: number | null | undefined }) {
  const label = String(n ?? 3);
  const bg = priColor(n ?? 3);
  return (
    <View
      accessible
      accessibilityLabel={`Priority ${label}`}

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 9999,
        backgroundColor: bg,
        minHeight: 28,
        alignItems: 'center',
        justifyContent: 'center',
      }}

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
    >
      <Text {...textA11yProps} style={{ color: 'white', fontWeight: '800' }}>{label}</Text>
    </View>
  );
}

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});

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

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});

const isWeb = Platform.OS === 'web';

function downloadCsvWeb(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  if (typeof document !== 'undefined') {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  }

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});

async function shareCsvNative(filename: string, text: string) {
  const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!dir) {
    throw new Error('Unable to access the document directory.');
  }

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});

  const target = `${dir}${filename}`;
  await FileSystem.writeAsStringAsync(target, text, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(target, {
        mimeType: 'text/csv',
        UTI: 'public.comma-separated-values-text',
        dialogTitle: 'Share CSV',
      });
    } else {
      Alert.alert('Sharing unavailable', 'Unable to open the iOS share sheet on this device.');
    }

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
  } finally {
    await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);
  }

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
}

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});

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

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
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
    if (!isWeb) {
      Alert.alert('Web only', 'Excel downloads are only available from the web dashboard for now.');
      return;
    }

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
    const photos: string[] = [];
    const p1 = row.photo1_url || photo1Url || null;
    const p2 = row.photo2_url || photo2Url || null;
    if (p1) photos.push(p1);
    if (p2) photos.push(p2);

    const { downloadSubmissionExcel } = await import('../../src/lib/exportExcel');
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

  const shareCsv = async () => {
    const csv = toCsv(row);

    if (isWeb) {
      if (
        typeof navigator !== 'undefined' &&
        typeof (navigator as any).share === 'function' &&
        typeof File !== 'undefined'
      ) {
        try {
          // Browsers with the Web Share API + File support
          const file = new File([csv], 'submission.csv', { type: 'text/csv' });
          await (navigator as any).share({ title: 'Submission', text: 'See attached CSV', files: [file] });
          return;
        } catch (err) {
          console.warn('Web share failed, falling back to download', err);
        }

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
      }

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
      downloadCsvWeb('submission.csv', csv);
      return;
    }

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});

    try {
      await shareCsvNative('submission.csv', csv);
    } catch (error: any) {
      Alert.alert('Share failed', error?.message ?? 'Unable to create the CSV file.');
    }

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
  };

  const tagsText = Array.isArray(row.tags) ? row.tags.join(', ') : (typeof row.tags === 'string' ? row.tags : '');
  const submittedBy = row.submitter_display_name || row.submitter_email || row.created_by || '';

  const saveCsvToFiles = async () => {
    const csv = toCsv(row);
    const fileName = `submission-${row.id || Date.now()}.csv`;
    const dest = `${FileSystem.documentDirectory || FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(dest, csv, { encoding: FileSystem.EncodingType.UTF8 });
    Alert.alert('CSV saved', `Saved to Files app → On My iPhone → ${fileName}`);
  };

  const photoUrls = [row.photo1_url || photo1Url, row.photo2_url || photo2Url].filter(Boolean) as string[];
  const buildPdfPayload = () => ({
    store_site: row.store_site || '',
    date: row.date || '',
    brand: row.brand || '',
    store_location: row.store_location || '',
    location: row.location || '',
    conditions: row.conditions || '',
    price_per_unit: String(row.price_per_unit ?? ''),
    shelf_space: row.shelf_space || '',
    on_shelf: String(row.on_shelf ?? ''),
    tags: tagsText,
    notes: row.notes || '',
    priority_level: row.priority_level ? String(row.priority_level) : undefined,
    photo_urls: photoUrls,
  });

  const savePdf = async () => {
    try {
      const mod = Platform.OS === 'web'
        ? await import('../../src/lib/exportPdf.web')
        : await import('../../src/lib/exportPdf.native');
      const fn = (mod as any)?.downloadSubmissionPdf || (mod as any)?.default?.downloadSubmissionPdf;
      if (typeof fn === 'function') {
        await fn(buildPdfPayload());
      }

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
    } catch (err: any) {
      Alert.alert('PDF failed', err?.message ?? 'Unable to generate PDF');
    }

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f4f6fb' }} contentContainerStyle={{ padding: 16, gap: 12 as any }}>
      <Head><title>Submission</title></Head>

      <Pressable
        onPress={() => (typeof history !== 'undefined' ? history.back() : router.back())}

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={{ alignSelf: 'flex-start', paddingVertical: 4 }}

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
      >
        <Text {...textA11yProps} style={{ fontSize: 18, color: '#2563eb', fontWeight: '600' }}>← Back</Text>
      </Pressable>

      <View style={detailStyles.card}>
        <Text {...textA11yProps} style={[titleStyle, { marginBottom: 8 }]}>Submission</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 as any }}>
        <Text {...textA11yProps} style={labelStyle}>
          {row.store_location || row.store_site || ''}

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
        </Text>
        <PriPill n={row.priority_level ?? 3} />
      </View>

      <Text {...textA11yProps} style={[bodyStyle, { color: '#475569' }]}>
        Submitted by: {submittedBy}

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
      </Text>

      {row.brand ? <Text {...textA11yProps} style={bodyStyle}>Brand: {row.brand}</Text> : null}

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
      {row.store_site ? <Text {...textA11yProps} style={bodyStyle}>Store site: {row.store_site}</Text> : null}

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
      {row.location ? <Text {...textA11yProps} style={bodyStyle}>Location: {row.location}</Text> : null}

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
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

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
            accessibilityLabel="Photo 1"
            style={{ flex: 1, height: 160, borderRadius: 12, borderWidth: 1, borderColor: '#111' }}

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
          />
        ) : null}

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
        {photo2Url ? (
          <Image
            source={{ uri: photo2Url }}

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
            accessibilityLabel="Photo 2"
            style={{ flex: 1, height: 160, borderRadius: 12, borderWidth: 1, borderColor: '#111' }}

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
          />
        ) : null}

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
      </View>

      <View style={{ flexDirection: 'row', gap: 8 as any, marginTop: 4, flexWrap: 'wrap' }}>
        {isWeb ? (
          <Button
            title="Download Excel"
            onPress={downloadExcelWithPhotos}

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
            variant="secondary"
            fullWidth
            accessibilityLabel="Download Excel with photos"
          />
        ) : null}

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
        <Button
          title="Share CSV"
          onPress={shareCsv}

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
          variant="primary"
          fullWidth
          accessibilityLabel="Share CSV"
        />
        <Button
          title="Save CSV"
          onPress={saveCsvToFiles}

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
          variant="ghost"
          fullWidth
          accessibilityLabel="Save CSV to Files"
        />
        <Button
          title="Save PDF"
          onPress={savePdf}

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
          variant="success"
          fullWidth
          accessibilityLabel="Save PDF copy"
        />
        <Button
          title="💬 Chat"
          onPress={() => router.push(`/chat/${row.id}`)}

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
          variant="secondary"
          fullWidth
          accessibilityLabel="Open discussion about this submission"
        />
      </View>

      <Pressable
        onPress={() => (typeof history !== 'undefined' ? history.back() : router.back())}

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
        accessibilityRole="button"
        accessibilityLabel="Exit"
        style={{ alignSelf: 'flex-end', marginTop: 10, minHeight: targetMinHeight, justifyContent: 'center' }}

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
      >
        <Text {...textA11yProps} style={bodyStyle}>Exit</Text>
      </Pressable>
      </View>
    </ScrollView>
  );
}

const detailStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});

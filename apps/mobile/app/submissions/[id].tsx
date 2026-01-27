import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  StyleSheet,
  SafeAreaView,
  Linking,
} from 'react-native';
import Button from '../../src/components/Button';
import { router, useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { supabase } from '../../src/lib/supabase';
import { colors, typography, textA11yProps, theme } from '../../src/theme';
import { useUISettings } from '../../src/lib/uiSettings';
import { shareCsvNative } from '../../src/lib/shareCsv';
import LogoHeader from '../../src/components/LogoHeader';
import { getSignedStorageUrl } from '../../src/lib/supabaseHelpers';

const isWeb = Platform.OS === 'web';

type Row = {
  id: string;
  created_at: string;
  created_by: string;
  team_id: string;
  status: string | null;

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
};

/** Build a human-friendly base name for exported files from the submission. */
function buildSubmissionFileBase(row: Row, submitterName?: string | null): string {
  const primary = row.store_site || row.store_location || 'submission';
  const name = (submitterName || '').trim();
  const parts = [primary];
  if (row.date) parts.push(row.date);
  if (name) parts.push(name);
  return parts.filter(Boolean).join(' - ');
}

/** Basic filename sanitizer for all platforms. */
function sanitizeFileBase(name: string): string {
  return name.replace(/[^a-z0-9_.-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'submission';
}

function priColor(n: number | null | undefined) {
  return n === 1 ? '#da291c' : n === 2 ? '#eeba2b' : '#99e169';
}

function PriPill({ n }: { n: number | null | undefined }) {
  const label = String(n ?? 3);
  const bg = priColor(n ?? 3);
  return (
    <View
      accessible
      accessibilityLabel={`Priority ${label}`}
      style={[styles.priorityPill, { backgroundColor: bg }]}
    >
      <Text {...textA11yProps} style={styles.priorityText}>
        {label}
      </Text>
    </View>
  );
}

function toCsv(
  r: Row,
  submittedBy: string,
  photo1Resolved?: string | null,
  photo2Resolved?: string | null
) {
  const tags = Array.isArray(r.tags)
    ? r.tags.join(', ')
    : typeof r.tags === 'string'
      ? r.tags
      : '';
  const cells = [
    ['DATE', r.date ?? ''],
    ['BRAND', r.brand ?? ''],
    ['STORE SITE', r.store_site ?? ''],
    ['STORE LOCATION', r.store_location ?? ''],
    ['LOCATIONS', r.location ?? ''],
    ['CONDITIONS', r.conditions ?? ''],
    ['PRICE PER UNIT', r.price_per_unit ?? ''],
    ['SHELF SPACE', r.shelf_space ?? ''],
    ['FACES ON SHELF', r.on_shelf ?? ''],
    ['TAGS', tags],
    ['NOTES', r.notes ?? ''],
    ['PRIORITY LEVEL', r.priority_level ?? ''],
    ['SUBMITTED BY', submittedBy || ''],
    // Prefer the same resolved URLs used in the UI so CSV matches what users see online
    ['PHOTO 1', photo1Resolved ?? r.photo1_url ?? r.photo1_path ?? ''],
    ['PHOTO 2', photo2Resolved ?? r.photo2_url ?? r.photo2_path ?? ''],
  ];
  return cells
    .map(([k, v]) => `"${k}","${String(v).replace(/"/g, '""')}"`)
    .join('\n');
}

function downloadCsvWeb(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  if (typeof document !== 'undefined') {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export default function Submission() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { fontScale, targetMinHeight } = useUISettings();

  const [row, setRow] = useState<Row | null>(null);
  const [photo1Url, setPhoto1Url] = useState<string | null>(null);
  const [photo2Url, setPhoto2Url] = useState<string | null>(null);
  const [submitterName, setSubmitterName] = useState<string>('');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

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
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const flash = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase
        .from('submissions')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) {
        console.error('submission detail load failed', error);
        return;
      }
      const dataRow = (data as Row) ?? null;
      if (!dataRow) return;
      setRow(dataRow);

      if (dataRow.created_by) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name,email')
            .eq('id', dataRow.created_by)
            .maybeSingle();
          const name =
            profile?.display_name?.trim() ||
            profile?.email?.split('@')[0] ||
            dataRow.created_by.slice(0, 8) ||
            '';
          setSubmitterName(name);
        } catch {
          setSubmitterName(dataRow.created_by.slice(0, 8));
        }
      } else {
        setSubmitterName('');
      }

      const resolveSigned = async (path?: string | null) => {
        if (!path) return null;
        const buckets = ['submissions', 'chat', 'photos'];
        for (const bucket of buckets) {
          const signed = await getSignedStorageUrl(bucket, path, 3600);
          if (signed) return signed;
        }
        return null;
      };

      setPhoto1Url(dataRow.photo1_url ?? (await resolveSigned(dataRow.photo1_path)));
      setPhoto2Url(dataRow.photo2_url ?? (await resolveSigned(dataRow.photo2_path)));
    })();
  }, [id]);

  if (!row) return null;

  // NOTE: Native no longer uses this; web-only for now.
  const downloadSpreadsheetWithPhotos = async () => {
    console.warn('[downloadSpreadsheetWithPhotos] tapped');

    const photos: string[] = [];
    const p1 = row.photo1_url || photo1Url || null;
    const p2 = row.photo2_url || photo2Url || null;
    if (p1) photos.push(p1);
    if (p2) photos.push(p2);

    const baseName = sanitizeFileBase(buildSubmissionFileBase(row, submitterName));

    const submissionPayload = {
      store_site: row.store_site || '',
      date: row.date || '',
      brand: row.brand || '',
      store_location: row.store_location || '',
      location: row.location || '',
      conditions: row.conditions || '',
      price_per_unit: row.price_per_unit ?? '',
      shelf_space: row.shelf_space || '',
      on_shelf: row.on_shelf ?? '',
      tags: Array.isArray(row.tags) ? row.tags.join(', ') : (typeof row.tags === 'string' ? row.tags : ''),
      notes: row.notes || '',
      priority_level: row.priority_level ?? '',
      submitted_by: submittedBy || '',
      photo_urls: photos,
    };

    try {
      if (isWeb) {
        const mod = await import('../../src/lib/exportSpreadsheet.web');
        await mod.downloadSubmissionSpreadsheet(submissionPayload as any, { fileNamePrefix: baseName });
        flash('success', 'Spreadsheet downloaded');
        return;
      }

      const edge = await import('../../src/lib/submissionSpreadsheet.native');
      await edge.shareSubmissionSpreadsheetFromEdge(row.id, baseName);
      flash('success', 'Share sheet opened');
    } catch (err: any) {
      Alert.alert('Spreadsheet failed', err?.message ?? 'Unable to generate spreadsheet');
      flash('error', 'Unable to generate spreadsheet');
    }
  };

  const shareSubmission = async () => {
    console.warn('[shareSubmission] tapped');

    const baseName = sanitizeFileBase(buildSubmissionFileBase(row, submitterName));
    const submissionPayload = {
      store_site: row.store_site || '',
      date: row.date || '',
      brand: row.brand || '',
      store_location: row.store_location || '',
      location: row.location || '',
      conditions: row.conditions || '',
      price_per_unit: row.price_per_unit ?? '',
      shelf_space: row.shelf_space || '',
      on_shelf: row.on_shelf ?? '',
      tags: Array.isArray(row.tags) ? row.tags.join(', ') : (typeof row.tags === 'string' ? row.tags : ''),
      notes: row.notes || '',
      priority_level: row.priority_level ?? '',
      submitted_by: submittedBy || '',
      photo_urls: photoUrls,
    };

    try {
      if (Platform.OS === 'web') {
        const mod = await import('../../src/lib/exportSpreadsheet.web');
        await mod.downloadSubmissionSpreadsheet(submissionPayload as any, { fileNamePrefix: baseName });
        flash('success', 'Spreadsheet downloaded');
        return;
      }

      const edge = await import('../../src/lib/submissionSpreadsheet.native');
      await edge.shareSubmissionSpreadsheetFromEdge(row.id, baseName);
      flash('success', 'Share sheet opened');
    } catch (err: any) {
      console.warn('[shareSubmission] failed', err);
      Alert.alert('Share failed', err?.message ?? 'Unable to share this submission.');
      flash('error', 'Could not share submission');
    }
  };

  const sendSpreadsheetToChat = async () => {
    console.warn('[sendSpreadsheetToChat] tapped');

    const baseName = sanitizeFileBase(buildSubmissionFileBase(row, submitterName));
    const submissionPayload = {
      store_site: row.store_site || '',
      date: row.date || '',
      brand: row.brand || '',
      store_location: row.store_location || '',
      location: row.location || '',
      conditions: row.conditions || '',
      price_per_unit: row.price_per_unit ?? '',
      shelf_space: row.shelf_space || '',
      on_shelf: row.on_shelf ?? '',
      tags: Array.isArray(row.tags) ? row.tags.join(', ') : (typeof row.tags === 'string' ? row.tags : ''),
      notes: row.notes || '',
      priority_level: row.priority_level ?? '',
      submitted_by: submittedBy || '',
      photo_urls: photoUrls,
    };

    try {
      if (Platform.OS === 'web') {
        const mod = await import('../../src/lib/exportSpreadsheet.web');
        await mod.downloadSubmissionSpreadsheet(submissionPayload as any, { fileNamePrefix: baseName });
        flash('success', 'Spreadsheet downloaded');
        return;
      }

      if (!row.team_id) {
        Alert.alert('Missing team', 'Cannot send spreadsheet without a team id.');
        return;
      }

      const edge = await import('../../src/lib/submissionSpreadsheet.native');
      const chat = await import('../../src/lib/chat');

      const path = await edge.downloadSubmissionSpreadsheetToPath(row.id, baseName);
      const result = await chat.sendExcelFileAttachmentMessageFromPath(
        row.team_id,
        null,
        path,
        `${baseName}.xlsx`,
        'Submission spreadsheet',
        { is_internal: true }
      );

      if (!result.success) {
        throw new Error(result.error || 'Unable to send spreadsheet to chat');
      }

      flash('success', 'Spreadsheet sent to team chat');
    } catch (err: any) {
      console.warn('[sendSpreadsheetToChat] failed', err);
      Alert.alert('Send failed', err?.message ?? 'Unable to send spreadsheet to chat.');
      flash('error', 'Unable to send spreadsheet to chat');
    }
  };

  const tagsText = Array.isArray(row.tags)
    ? row.tags.join(', ')
    : typeof row.tags === 'string'
      ? row.tags
      : '';
  const submittedBy = submitterName || row.created_by || '';

  const photo1 = row.photo1_url || photo1Url || null;
  const photo2 = row.photo2_url || photo2Url || null;
  const photoUrls = [photo1, photo2].filter(Boolean) as string[];
  const csvSaveLabel = Platform.OS === 'web' ? 'Download Spreadsheet' : 'Send Spreadsheet to Chat';
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
        const baseName = sanitizeFileBase(buildSubmissionFileBase(row, submitterName));
        await fn(buildPdfPayload(), { fileNamePrefix: baseName });
        if (Platform.OS === 'web') {
          flash('success', 'PDF downloaded');
          Alert.alert('PDF ready', 'Check your downloads folder for the exported PDF.');
        } else {
          // Native: rely on the system share sheet UX only.
          flash('success', 'Share sheet opened');
        }
      }
    } catch (err: any) {
      Alert.alert('PDF failed', err?.message ?? 'Unable to generate PDF');
      flash('error', 'Unable to generate PDF');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Head>
        <title>Submission</title>
      </Head>
      <LogoHeader title="Submission" />
      <View style={styles.body}>
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.surfaceMuted }}
          contentContainerStyle={{ padding: 16, gap: 12 as any }}
        >
        <View style={styles.card}>
        <Text {...textA11yProps} style={[titleStyle, { marginBottom: 8 }]}>
          Submission
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 as any }}>
          <Text {...textA11yProps} style={labelStyle}>
            {row.store_location || row.store_site || ''}
          </Text>
          <PriPill n={row.priority_level ?? 3} />
        </View>

        <Text {...textA11yProps} style={[bodyStyle, { color: colors.textMuted }]}>
          Submitted by: {submittedBy}
        </Text>

        {row.brand ? <Text {...textA11yProps} style={bodyStyle}>Brand: {row.brand}</Text> : null}
        {row.store_site ? <Text {...textA11yProps} style={bodyStyle}>Store site: {row.store_site}</Text> : null}
        {row.location ? <Text {...textA11yProps} style={bodyStyle}>Location: {row.location}</Text> : null}
        <Text {...textA11yProps} style={bodyStyle}>{row.date}</Text>

        <Text {...textA11yProps} style={bodyStyle}>Conditions: {row.conditions}</Text>
        <Text {...textA11yProps} style={bodyStyle}>Price per unit: {row.price_per_unit}</Text>
        <Text {...textA11yProps} style={bodyStyle}>Shelf space: {row.shelf_space}</Text>
        <Text {...textA11yProps} style={bodyStyle}>Faces on shelf: {row.on_shelf}</Text>
        <Text {...textA11yProps} style={bodyStyle}>Tags: {tagsText}</Text>
        <Text {...textA11yProps} style={bodyStyle}>Notes: {row.notes}</Text>

        <View>
          <Text {...textA11yProps} style={[labelStyle, { marginTop: 12 }]}>Photos</Text>
          {photoUrls.length === 0 ? (
            <Text {...textA11yProps} style={[bodyStyle, { color: colors.textMuted }]}>No photos attached.</Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoRow}
            >
              {photoUrls.map((uri, index) => (
                <Pressable
                  key={`${uri}-${index}`}
                  onPress={() => Linking.openURL(uri)}
                  style={[
                    styles.photoWrapper,
                    index === photoUrls.length - 1 && { marginRight: 0 },
                  ]}
                  accessibilityLabel={`Open photo ${index + 1}`}
                >
                  <Image source={{ uri }} style={styles.photo} />
                  <Text style={styles.photoBadge}>Photo {index + 1}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={styles.actionsGrid}>
          <Button
            title="Share Spreadsheet"
            onPress={shareSubmission}
            variant="primary"
            fullWidth
            accessibilityLabel="Share submission spreadsheet"
          />
          <Button
            title={csvSaveLabel}
            onPress={sendSpreadsheetToChat}
            variant="primary"
            fullWidth
            accessibilityLabel={Platform.OS === 'web' ? 'Download spreadsheet file' : 'Send spreadsheet to team chat'}
          />
          <Button
            title="Save PDF"
            onPress={savePdf}
            variant="success"
            fullWidth
            accessibilityLabel="Save PDF copy"
          />
          <Button
            title="Open Chat"
            onPress={() => router.push('/chat/team')}
            variant="success"
            fullWidth
            accessibilityLabel="Open team chat"
          />
        </View>

        <Button
          title="Exit"
          onPress={() => (typeof history !== 'undefined' ? history.back() : router.back())}
          variant="error"
          size="sm"
          fullWidth
          accessibilityLabel="Exit submission"
        />
      </View>
        </ScrollView>
        {toast ? (
          <View
            style={[
              styles.toast,
              toast.kind === 'success' ? styles.toastSuccess : styles.toastError,
              styles.toastFloating,
            ]}
          >
            <Text style={styles.toastText}>{toast.text}</Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  priorityPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: colors.primary[600],
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityText: {
    color: colors.white,
    fontWeight: '800',
  },
  photoRow: {
    paddingVertical: 8,
    paddingRight: 8,
  },
  photoWrapper: {
    marginRight: 12,
    alignItems: 'center',
  },
  photo: {
    width: 180,
    height: 160,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#111',
    backgroundColor: '#f1f5f9',
    resizeMode: 'cover',
  },
  photoBadge: {
    ...typography.label,
    color: colors.textMuted,
    marginTop: 6,
    textAlign: 'center',
  },
  actionsGrid: {
    flexDirection: 'column',
    gap: 12,
  },
  toast: {
    borderRadius: theme.radius.lg,
    padding: 12,
    borderWidth: 1,
    marginBottom: 4,
  },
  toastSuccess: {
    backgroundColor: '#ecfdf5',
    borderColor: '#34d399',
  },
  toastError: {
    backgroundColor: '#fef2f2',
    borderColor: '#f87171',
  },
  toastText: {
    ...typography.body,
    textAlign: 'center',
    color: colors.text,
  },
  toastFloating: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
  },
});
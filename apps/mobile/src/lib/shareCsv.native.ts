// apps/mobile/src/lib/shareCsv.native.ts
import { Share } from 'react-native';
import { alertStorageUnavailable, resolveWritableDirectory } from './storageAccess';

function sanitizeFileName(name: string) {
  return name.replace(/[^a-z0-9_.-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'submission.csv';
}

export async function shareCsvNative(csv: string, fileName = 'submission.csv') {
  try {
    const FileSystem = await import('expo-file-system');
    const safeDir = resolveWritableDirectory(FileSystem, 'documents-first');
    if (!safeDir) {
      alertStorageUnavailable();
      throw new Error('No writable directory available for CSV export');
    }

    const safeName = sanitizeFileName(fileName);
    const filePath = `${safeDir}${safeName}`;

    await FileSystem.writeAsStringAsync(filePath, csv, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    let Sharing: typeof import('expo-sharing') | null = null;
    try {
      Sharing = await import('expo-sharing');
    } catch {
      Sharing = null;
    }

    if (Sharing && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(filePath, {
        mimeType: 'text/csv',
        dialogTitle: 'Share submission CSV',
        UTI: 'public.comma-separated-values-text',
      });
      return;
    }

    await Share.share({
      title: 'Share submission CSV',
      message: 'Submission data attached as CSV.',
      url: filePath,
    });
  } catch (error) {
    if (__DEV__) {
      console.warn('shareCsvNative failed', error);
    }
    throw error;
  }
}

// apps/mobile/src/lib/shareCsv.native.ts
import { Platform, Share } from 'react-native';
import { alertStorageUnavailable, resolveWritableDirectory } from './storageAccess';

function sanitizeFileName(name: string) {
  return name.replace(/[^a-z0-9_.-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'submission.csv';
}

export async function shareCsvNative(csv: string, fileName = 'submission.csv') {
  const debug = __DEV__;
  try {
    const FileSystem = await import('expo-file-system');
    const directories = {
      documentDirectory: FileSystem.documentDirectory,
      cacheDirectory: FileSystem.cacheDirectory,
    };
    if (debug) {
      console.log('[shareCsvNative] platform', Platform.OS, directories);
    }

    // Try Documents first (so it behaves like the web export), then fall back to cache.
    let baseDir = resolveWritableDirectory(FileSystem, 'documents-first');
    if (!baseDir) {
      baseDir = resolveWritableDirectory(FileSystem, 'cache-first');
    }
    if (!baseDir) {
      alertStorageUnavailable();
      if (debug) {
        console.warn('[shareCsvNative] no writable directory, falling back to message-only share');
      }
      await Share.share({
        title: 'Share submission CSV',
        message: csv,
      });
      return;
    }

    // Ensure the directory exists (especially when using cache-first)
    try {
      const info = await FileSystem.getInfoAsync(baseDir);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });
      }
    } catch (dirErr) {
      if (debug) {
        console.warn('[shareCsvNative] unable to ensure directory', baseDir, dirErr);
      }
    }

    const safeName = sanitizeFileName(fileName);
    const filePath = `${baseDir}${safeName}`;

    if (debug) {
      console.log('[shareCsvNative] writing CSV', filePath, `(${csv.length} chars)`);
    }

    await FileSystem.writeAsStringAsync(filePath, csv, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    let Sharing: typeof import('expo-sharing') | null = null;
    try {
      Sharing = await import('expo-sharing');
    } catch (err) {
      if (debug) {
        console.warn('[shareCsvNative] expo-sharing unavailable', err);
      }
      Sharing = null;
    }

    const sharingAvailable = Sharing ? await Sharing.isAvailableAsync() : false;
    if (debug) {
      console.log('[shareCsvNative] sharing available?', sharingAvailable);
    }

    if (sharingAvailable && Sharing) {
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
    if (debug) {
      console.warn('[shareCsvNative] failed', error);
    }
    throw error;
  }
}

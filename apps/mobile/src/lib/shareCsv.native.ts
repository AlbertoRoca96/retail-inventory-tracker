// apps/mobile/src/lib/shareCsv.native.ts
import { Platform } from 'react-native';
import { alertStorageUnavailable } from './storageAccess';

function sanitizeFileName(name: string) {
  return name.replace(/[^a-z0-9_.-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'submission.csv';
}

export async function shareCsvNative(csv: string, fileName = 'submission.csv') {
  const debug = __DEV__;
  try {
    const FileSystemModule = await import('expo-file-system');
    const FileSystem: typeof import('expo-file-system') = (FileSystemModule as any)?.default ?? FileSystemModule;
    const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    if (!baseDir) {
      alertStorageUnavailable();
      throw new Error('No cache directory available for CSV export');
    }
    const exportDir = `${baseDir}exports/csv/`;
    if (debug) {
      console.log('[shareCsvNative] platform', Platform.OS, {
        cacheDirectory: FileSystem.cacheDirectory,
        documentDirectory: FileSystem.documentDirectory,
        exportDir,
      });
    }
    try {
      const info = await FileSystem.getInfoAsync(exportDir);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(exportDir, { intermediates: true });
      }
    } catch (dirErr) {
      if (debug) {
        console.warn('[shareCsvNative] unable to ensure export dir', exportDir, dirErr);
      }
    }

    const safeName = sanitizeFileName(fileName);
    const filePath = `${exportDir}${safeName}`;

    if (debug) {
      console.log('[shareCsvNative] writing CSV', filePath, `(${csv.length} chars)`);
    }

    await FileSystem.writeAsStringAsync(filePath, csv, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    let Sharing: typeof import('expo-sharing') | null = null;
    try {
      const SharingModule = await import('expo-sharing');
      Sharing = (SharingModule as any)?.default ?? SharingModule;
    } catch (err) {
      if (debug) {
        console.warn('[shareCsvNative] expo-sharing unavailable', err);
      }
      Sharing = null;
    }

    const info = await FileSystem.getInfoAsync(filePath);
    if (debug) {
      console.log('[shareCsvNative] file info', info);
    }

    if (!Sharing) {
      throw new Error('Sharing module unavailable');
    }
    const sharingAvailable = await Sharing.isAvailableAsync();
    if (debug) {
      console.log('[shareCsvNative] sharing available?', sharingAvailable);
    }
    if (!sharingAvailable) {
      throw new Error('Sharing is not available on this device');
    }

    await Sharing.shareAsync(filePath, {
      mimeType: 'text/csv',
      dialogTitle: 'Share submission CSV',
      UTI: 'public.comma-separated-values-text',
    });
    return;
  } catch (error) {
    if (debug) {
      console.warn('[shareCsvNative] failed', error);
    }
    throw error;
  }
}

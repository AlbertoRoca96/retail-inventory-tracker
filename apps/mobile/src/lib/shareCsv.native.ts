// apps/mobile/src/lib/shareCsv.native.ts
import { Platform } from 'react-native';
import { alertStorageUnavailable, ensureExportDirectory } from './storageAccess';
import { shareFileNative } from './shareFile.native';

function sanitizeFileName(name: string) {
  return name.replace(/[^a-z0-9_.-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'submission.csv';
}

export async function shareCsvNative(csv: string, fileName = 'submission.csv') {
  const debug = __DEV__;
  try {
    // Use the legacy filesystem API to avoid the runtime deprecation error
    // when calling writeAsStringAsync in Expo 54.
    const FileSystemModule = await import('expo-file-system/legacy');
    const FileSystem: typeof import('expo-file-system') = (FileSystemModule as any)?.default ?? FileSystemModule;

    const exportDir =
      (await ensureExportDirectory(FileSystem, 'csv', 'documents-first')) ??
      (await ensureExportDirectory(FileSystem, 'csv', 'cache-first'));

    if (!exportDir) {
      // This should be practically impossible on a real device now that
      // ensureExportDirectory falls back to a root directory, but keep
      // a soft alert just in case.
      alertStorageUnavailable();
      throw new Error('Files storage unavailable on this device. Please enable Files access.');
    }
    if (debug) {
      console.log('[shareCsvNative] platform', Platform.OS, {
        cacheDirectory: FileSystem.cacheDirectory,
        documentDirectory: FileSystem.documentDirectory,
        temporaryDirectory: (FileSystem as any).temporaryDirectory,
        exportDir,
      });
    }

    const safeName = sanitizeFileName(fileName);
    const filePath = `${exportDir}${safeName}`;

    if (debug) {
      console.log('[shareCsvNative] writing CSV', filePath, `(${csv.length} chars)`);
    }

    // Expo's writeAsStringAsync defaults to UTF-8; avoid touching
    // EncodingType in case it is undefined in some runtimes.
    await FileSystem.writeAsStringAsync(filePath, csv as any);

    const info = await FileSystem.getInfoAsync(filePath);
    if (debug) {
      console.log('[shareCsvNative] file info', info);
    }

    await shareFileNative(filePath, {
      mimeType: 'text/csv',
      dialogTitle: 'Share submission CSV',
      uti: 'public.comma-separated-values-text',
      message: 'Submission data attached as CSV.',
    });
    return;
  } catch (error) {
    if (debug) {
      console.warn('[shareCsvNative] failed', error);
    }
    throw error;
  }
}
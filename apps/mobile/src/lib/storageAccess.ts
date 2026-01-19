// apps/mobile/src/lib/storageAccess.ts
import { Alert } from 'react-native';

export type DirectoryPreference = 'documents-first' | 'cache-first';

let storageAlertShown = false;

const normalizeDir = (dir: string) => (dir.endsWith('/') ? dir : `${dir}/`);

export function resolveWritableDirectory(
  FileSystem: typeof import('expo-file-system'),
  preference: DirectoryPreference = 'documents-first'
) {
  // On iOS, Files.app exposes the app container; documentDirectory is the most stable
  // place for user-facing exports. Cache/temp are fine fallbacks but we should never
  // blow up just because one of them is missing.
  const primaryOrder =
    preference === 'documents-first'
      ? [FileSystem.documentDirectory, FileSystem.cacheDirectory]
      : [FileSystem.cacheDirectory, FileSystem.documentDirectory];

  const extras = [
    (FileSystem as any).temporaryDirectory,
    (FileSystem as any).documentDirectory,
    (FileSystem as any).storageDirectory,
    'file:///tmp/',
  ];

  const dir = [...primaryOrder, ...extras].find((path) => typeof path === 'string' && path.length > 0) ?? null;
  return dir ? normalizeDir(dir) : null;
}

export async function ensureExportDirectory(
  FileSystem: typeof import('expo-file-system'),
  subfolder: string,
  preference: DirectoryPreference = 'documents-first'
) {
  const root = resolveWritableDirectory(FileSystem, preference);
  if (!root) return null;
  const exportDir = `${root}exports/${subfolder}/`;
  try {
    const info = await FileSystem.getInfoAsync(exportDir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(exportDir, { intermediates: true });
    }
    return exportDir;
  } catch (err) {
    if (__DEV__) {
      console.warn('[storageAccess] ensureExportDirectory failed', exportDir, err);
    }
    // As a last resort, fall back to the root directory itself rather than
    // treating storage as completely unavailable. The share sheet will still
    // be able to move the file into Files when the user picks a destination.
    return normalizeDir(root);
  }
}

export function alertStorageUnavailable() {
  if (storageAlertShown) return;
  storageAlertShown = true;
  Alert.alert(
    'Storage unavailable',
    'We could not access a writable directory on this device. Please enable Files access or try again on a physical device before sharing.'
  );
}

// apps/mobile/src/lib/storageAccess.ts
import { Alert } from 'react-native';

export type DirectoryPreference = 'documents-first' | 'cache-first';

let storageAlertShown = false;

const normalizeDir = (dir: string) => (dir.endsWith('/') ? dir : `${dir}/`);

export function resolveWritableDirectory(
  FileSystem: typeof import('expo-file-system'),
  preference: DirectoryPreference = 'documents-first'
) {
  const order =
    preference === 'documents-first'
      ? [FileSystem.documentDirectory, FileSystem.cacheDirectory]
      : [FileSystem.cacheDirectory, FileSystem.documentDirectory];

  const dir = order.find((path) => typeof path === 'string' && path.length > 0) ?? null;
  return dir ? normalizeDir(dir) : null;
}

export function alertStorageUnavailable() {
  if (storageAlertShown) return;
  storageAlertShown = true;
  Alert.alert(
    'Storage unavailable',
    'We could not access a writable directory on this device. Please enable Files access or try again on a physical device before sharing.'
  );
}

// apps/mobile/src/lib/shareFile.native.ts
// Centralized native file sharing helper so CSV and PDF use the exact same
// pipeline on iOS/Android. This avoids subtle differences between flows.

import { Share } from 'react-native';

export type ShareFileOptions = {
  mimeType?: string;
  dialogTitle?: string;
  uti?: string;
  message?: string;
};

export async function shareFileNative(filePath: string, opts: ShareFileOptions = {}) {
  const debug = __DEV__;

  try {
    let Sharing: typeof import('expo-sharing') | null = null;
    try {
      const SharingModule = await import('expo-sharing');
      Sharing = (SharingModule as any)?.default ?? SharingModule;
    } catch (err) {
      if (debug) {
        console.warn('[shareFileNative] expo-sharing unavailable', err);
      }
      Sharing = null;
    }

    if (Sharing) {
      try {
        const available = await Sharing.isAvailableAsync();
        if (debug) {
          console.log('[shareFileNative] sharing available?', available, {
            filePath,
            mimeType: opts.mimeType,
            uti: opts.uti,
          });
        }
        if (available) {
          await Sharing.shareAsync(filePath, {
            mimeType: opts.mimeType,
            UTI: opts.uti,
            dialogTitle: opts.dialogTitle,
          });
          return;
        }
      } catch (err) {
        if (debug) {
          console.warn('[shareFileNative] Sharing.shareAsync failed, falling back', err);
        }
      }
    }

    // Fallback: use React Native Share with a file URL. This will still surface
    // the system share sheet on iOS with options like Messages, Mail, and
    // "Save to Files" when supported.
    if (debug) {
      console.log('[shareFileNative] using React Native Share fallback', { filePath });
    }
    await Share.share({
      title: opts.dialogTitle ?? 'Share file',
      message: opts.message ?? 'File attached.',
      url: filePath,
    });
  } catch (error) {
    if (debug) {
      console.warn('[shareFileNative] failed', error);
    }
    throw error;
  }
}

export default { shareFileNative };

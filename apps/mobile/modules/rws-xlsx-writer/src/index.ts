import { requireNativeModule } from 'expo-modules-core';

export type KeyValueRow = {
  label: string;
  value: string;
};

export type WriteSubmissionXlsxArgs = {
  /** Absolute file path on iOS (NOT file://) */
  destPath: string;
  title: string;
  rows: KeyValueRow[];
  /** Absolute file paths for JPEG/PNG images (NOT file://). Up to 6. */
  imagePaths: string[];
};

export type WriteBase64ToTempFileArgs = {
  base64: string;
  /** Optional file name (e.g. "submission-123.xlsx"). Defaults to random. */
  fileName?: string;
};

export type RwsXlsxWriterNativeModule = {
  isAvailable(): Promise<boolean>;
  writeSubmissionXlsx(args: WriteSubmissionXlsxArgs): Promise<string>;
  writeBase64ToTempFile(args: WriteBase64ToTempFileArgs): Promise<string>;
};

// iOS only. On Android/web this will throw on import, so callers must gate it.
export default requireNativeModule<RwsXlsxWriterNativeModule>('RwsXlsxWriter');

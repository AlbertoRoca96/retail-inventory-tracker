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

export type RwsXlsxWriterNativeModule = {
  isAvailable(): Promise<boolean>;
  writeSubmissionXlsx(args: WriteSubmissionXlsxArgs): Promise<string>;
};

// iOS only. On Android/web this will throw on import, so callers must gate it.
export default requireNativeModule<RwsXlsxWriterNativeModule>('RwsXlsxWriter');

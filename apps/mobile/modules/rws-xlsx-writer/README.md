# rws-xlsx-writer

Expo native module that generates XLSX files **on-device** using **libxlsxwriter** (C library).

Why: ExcelJS on iOS can crash (OOM / watchdog) when embedding multiple photos. libxlsxwriter writes directly to disk.

## Supported platforms

- iOS: ✅ implemented
- Android: 🚧 not implemented (falls back to server/edge in app code)

## iOS dependencies

This module uses CocoaPods:
- `libxlsxwriter`
- `ExpoModulesCore`

When you run an EAS build (or `expo run:ios`), Pods will be installed and `libxlsxwriter` will be compiled.

## JS API

```ts
import RwsXlsxWriter from 'rws-xlsx-writer';

await RwsXlsxWriter.writeSubmissionXlsx({
  destPath: '/absolute/path/to/file.xlsx',
  title: 'SUBMISSION',
  rows: [{ label: 'DATE', value: '2026-01-30' }],
  imagePaths: ['/absolute/path/to/photo1.jpg'],
});
```

Note: native expects *plain file paths* (no `file://` prefix).

Reports support up to **20 photos**, kept in input order in the existing two-column grid (ten 12-row blocks). Arrays over 20, unreadable images, and image insertion failures reject the export instead of silently omitting photos.

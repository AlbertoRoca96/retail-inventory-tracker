import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const slots = Array.from({ length: 20 }, (_, i) => i + 1);
const photos = slots.map((i) => `data:image/jpeg;base64,photo${i}`);
const payload = {
  store_site: 'Store', date: '2026-11-24', brand: 'Brand', store_location: '',
  location: '', conditions: '', price_per_unit: '', shelf_space: '', on_shelf: '',
  tags: '', notes: '', photo_urls: photos,
};
function load(file, mocks = {}, globals = {}) {
  const output = ts.transpileModule(source(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports, require: (name) => {
      if (name in mocks) return mocks[name];
      if (name === './reportPhotos') return { MAX_REPORT_PHOTOS: 20, REPORT_PHOTO_SLOTS: slots };
      if (name === './reportProducts') return { productExportRows: () => [] };
      return require(name);
    }, console, setTimeout, clearTimeout, Uint8Array, Blob, ...globals,
  }, { filename: file });
  return exports;
}
function browser() {
  return {
    fetch: async () => ({ ok: true, blob: async () => new Blob(['image']) }),
    Image: class {
      naturalWidth = 100;
      naturalHeight = 100;
      set src(value) { this.url = value; this.onload(); }
    },
    document: { createElement: (tag) => tag === 'canvas' ? {
      getContext: () => ({ drawImage() {} }),
      toDataURL: () => 'data:image/jpeg;base64,YQ==',
      toBlob: (done) => done(new Blob(['image'])),
    } : { click() {}, remove() {}, style: {} }, body: { appendChild() {}, removeChild() {} } },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    window: { navigator: {}, setTimeout, open() {} },
    navigator: {}, atob: (data) => Buffer.from(data, 'base64').toString('binary'),
  };
}

test('web XLSX embeds all 20 ordered photos in ten unchanged two-column blocks', async () => {
  const ExcelJS = require('exceljs');
  let workbook;
  class Workbook extends ExcelJS.Workbook { constructor() { super(); workbook = this; } }
  const mod = load('src/lib/exportExcel.ts', { exceljs: { default: { Workbook } } }, browser());
  await mod.downloadSubmissionExcel(payload);
  const images = workbook.worksheets[0].getImages();
  assert.equal(images.length, 20);
  const start = images[0].range.tl.nativeRow;
  images.forEach((image, index) => {
    assert.equal(image.range.tl.nativeCol, index % 2);
    assert.equal(image.range.tl.nativeRow, start + Math.floor(index / 2) * 12);
  });
  await assert.rejects(mod.downloadSubmissionExcel({ ...payload, photo_urls: [...photos, photos[0]] }), /at most 20/);
});

test('web PDF paginates every full pair inside page margins without shrinking photos', async () => {
  const pages = [];
  const font = { widthOfTextAtSize: (text) => text.length * 5 };
  const doc = {
    addPage: () => {
      const page = { images: [], drawRectangle() {}, drawText() {}, drawImage(_image, box) { this.images.push(box); } };
      pages.push(page);
      return page;
    },
    embedFont: async () => font,
    embedJpg: async () => ({ width: 100, height: 100 }),
    save: async () => new Uint8Array(),
  };
  const mod = load('src/lib/exportPdf.web.ts', {
    'pdf-lib': { PDFDocument: { create: async () => doc }, StandardFonts: {}, rgb: () => ({}) },
  }, browser());
  await mod.downloadSubmissionPdf(payload);
  assert.equal(pages.flatMap((page) => page.images).length, 20);
  assert.ok(pages.length > 1);
  for (const page of pages) {
    assert.equal(page.images.length % 2, 0, 'pairs must stay together');
    for (const box of page.images) assert.ok(box.y >= 36 && box.y + box.height <= 756);
    for (let index = 0; index < page.images.length; index += 2) {
      assert.equal(page.images[index].y, page.images[index + 1].y);
      assert.equal(page.images[index].height, page.images[index + 1].height);
    }
  }
  assert.equal(pages[0].images[0].height, 250);
  assert.equal(pages.at(-1).images.at(-1).height, 140);
});

test('native PDF retains ten indivisible 250pt pairs and rejects failed photos', async () => {
  let html;
  const mod = load('src/lib/exportPdf.native.ts', {
    'expo-file-system/legacy': { deleteAsync: async () => {}, copyAsync: async () => {} },
    'expo-print': { printToFileAsync: async (options) => { html = options.html; return { uri: 'tmp.pdf' }; } },
    'expo-image-manipulator': {},
    './storageAccess': { ensureExportDirectory: async () => 'file:///exports/' },
    './shareFile.native': {},
  });
  await mod.createSubmissionPdf(payload);
  assert.equal((html.match(/class="grid"/g) || []).length, 10);
  assert.equal((html.match(/<img src=/g) || []).length, 20);
  assert.match(html, /page-break-inside: avoid/);
  assert.match(html, /height: 250pt/);
  assert.match(html, /max-height: 238pt/);
  await assert.rejects(mod.createSubmissionPdf({ ...payload, photo_urls: ['file:///missing.jpg'] }, { inlineImages: true }), /Unable to prepare photo 1\/1/);
  await assert.rejects(mod.createSubmissionPdf({ ...payload, photo_urls: [...photos, photos[0]] }), /at most 20/);
});

test('iOS streaming passes every image path to native in slot order', async () => {
  const paths = [];
  let args;
  const mod = load('src/lib/submissionSpreadsheet.streaming.native.ts', {
    'react-native': { Platform: { OS: 'ios' } },
    'expo-file-system/legacy': {
      temporaryDirectory: 'file:///tmp/', deleteAsync: async () => {},
      downloadAsync: async (url) => ({ uri: url }),
    },
    'expo-image-manipulator': {
      SaveFormat: { JPEG: 'jpeg' },
      manipulateAsync: async (uri) => {
        const path = `file:///photo-${photos.indexOf(uri) + 1}.jpg`;
        paths.push(path.replace('file://', ''));
        return { uri: path };
      },
    },
    './shareFile.native': {},
    'rws-xlsx-writer': { default: {
      isAvailable: async () => true,
      writeSubmissionXlsx: async (options) => { args = options; return '/report.xlsx'; },
    } },
  });
  assert.equal(await mod.buildStreamingSubmissionSpreadsheetToPath(payload), 'file:///report.xlsx');
  assert.equal(args.imagePaths.length, 20);
  assert.deepEqual(Array.from(args.imagePaths), paths);
  assert.equal(args.imagePaths.at(-1), '/photo-20.jpg');
  await assert.rejects(mod.buildStreamingSubmissionSpreadsheetToPath({ ...payload, photo_urls: [...photos, photos[0]] }), /at most 20/);
});

test('native ExcelJS fallback includes every photo and rejects missing image data', async () => {
  const ExcelJS = require('exceljs');
  let workbook;
  let failImage = false;
  class Workbook extends ExcelJS.Workbook { constructor() { super(); workbook = this; } }
  const mod = load('src/lib/exportSpreadsheet.native.ts', {
    exceljs: { default: { Workbook } },
    'expo-file-system/legacy': {
      cacheDirectory: 'file:///tmp/', documentDirectory: 'file:///docs/', EncodingType: { Base64: 'base64' },
      downloadAsync: async (_url, dest) => ({ uri: dest }),
      deleteAsync: async () => {}, makeDirectoryAsync: async () => {}, writeAsStringAsync: async () => {},
    },
    'expo-image-manipulator': {
      SaveFormat: { JPEG: 'jpeg' },
      manipulateAsync: async () => failImage ? {} : { base64: 'YQ==', width: 100, height: 100 },
    },
    './shareFile.native': {},
  }, { __DEV__: false });
  await mod.buildSubmissionSpreadsheetFile(payload);
  const images = workbook.worksheets[0].getImages();
  assert.equal(images.length, 20);
  assert.equal(images.at(-1).range.tl.nativeRow - images[0].range.tl.nativeRow, 108);
  failImage = true;
  await assert.rejects(mod.buildSubmissionSpreadsheetFile(payload), /Unable to prepare photo 1\/20/);
});

test('detail and Objective-C writer have no six-photo cap or stored-URL override', () => {
  const detail = source('app/submissions/[id].tsx');
  assert.match(detail, /REPORT_PHOTO_SLOTS\.map/);
  assert.match(detail, /if \(!path\) return url \|\| null/);
  assert.match(detail, /const signed = await resolveSigned\(path\)/);
  assert.match(detail, /if \(!photosReady\) throw new Error/);
  const native = source('modules/rws-xlsx-writer/ios/RwsXlsxWriterModule.m');
  assert.match(native, /MaxReportPhotos = 20/);
  assert.match(native, /i < imagePaths\.count/);
  assert.doesNotMatch(native, /paths\.count >= 6|MIN\(\(NSInteger\)6/);
  assert.match(native, /Unable to embed every photo/);
});

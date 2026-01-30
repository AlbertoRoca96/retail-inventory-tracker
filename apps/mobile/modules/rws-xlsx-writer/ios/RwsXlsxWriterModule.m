#import "RwsXlsxWriterModule.h"

#import <Foundation/Foundation.h>
#import "xlsxwriter.h"

@implementation RwsXlsxWriterModule

EX_EXPORT_MODULE(RwsXlsxWriter)

EX_EXPORT_METHOD_AS(isAvailable,
                    isAvailableWithResolver:(EXPromiseResolveBlock)resolve
                    rejecter:(EXPromiseRejectBlock)reject)
{
  (void)reject;
  resolve(@(YES));
}

static NSString * _Nonnull ToNSString(id _Nullable value) {
  if (value == nil || value == (id)[NSNull null]) return @"";
  if ([value isKindOfClass:[NSString class]]) return (NSString *)value;
  return [[NSString stringWithFormat:@"%@", value] copy];
}

static void WriteMergedTitle(lxw_worksheet *worksheet, lxw_format *format, NSString *title) {
  // Merge A1:B1
  worksheet_merge_range(worksheet, 0, 0, 0, 1, [title UTF8String], format);
}

static void WriteKeyValueRow(lxw_worksheet *worksheet,
                             lxw_format *labelFmt,
                             lxw_format *valueFmt,
                             int row,
                             NSString *label,
                             NSString *value)
{
  worksheet_write_string(worksheet, row, 0, [[label uppercaseString] UTF8String], labelFmt);
  worksheet_write_string(worksheet, row, 1, [value UTF8String], valueFmt);
}

static void ApplyBordersToArea(lxw_worksheet *worksheet, int firstRow, int lastRow) {
  // libxlsxwriter applies borders via formats, not cell properties.
  // For simplicity: we just set row heights here. Borders are handled by label/value formats.
  for (int r = firstRow; r <= lastRow; r++) {
    worksheet_set_row(worksheet, r, 18, NULL);
  }
}

static void InsertImageGrid(lxw_worksheet *worksheet, NSArray<NSString *> *imagePaths, int startRow) {
  // 2 columns (A,B), 3 blocks (6 slots). Each block is 12 rows tall.
  // We insert at top-left cell of each block and scale the image down.
  for (NSInteger i = 0; i < MIN((NSInteger)6, imagePaths.count); i++) {
    NSString *path = imagePaths[i];
    if (!path.length) continue;

    int col = (int)(i % 2);
    int block = (int)(i / 2);
    int row = startRow + block * 12;

    lxw_image_options options;
    memset(&options, 0, sizeof(options));
    options.x_scale = 0.35;
    options.y_scale = 0.35;
    options.x_offset = 2;
    options.y_offset = 2;

    worksheet_insert_image_opt(worksheet, row, col, [path UTF8String], &options);
  }
}

static NSString *EnsureExportsDirOrReject(EXPromiseRejectBlock reject) {
  NSString *tmp = NSTemporaryDirectory();
  NSString *exportsDir = [tmp stringByAppendingPathComponent:@"exports"]; 

  NSError *dirErr = nil;
  [[NSFileManager defaultManager] createDirectoryAtPath:exportsDir
                            withIntermediateDirectories:YES
                                             attributes:nil
                                                  error:&dirErr];
  if (dirErr) {
    reject(@"fs_fail", [NSString stringWithFormat:@"Unable to create exports dir: %@", dirErr], nil);
    return nil;
  }
  return exportsDir;
}

EX_EXPORT_METHOD_AS(writeBase64ToTempFile,
                    writeBase64ToTempFile:(NSDictionary *)args
                    resolver:(EXPromiseResolveBlock)resolve
                    rejecter:(EXPromiseRejectBlock)reject)
{
  NSString *base64 = ToNSString(args[@"base64"]);
  NSString *fileName = ToNSString(args[@"fileName"]);

  if (!base64.length) {
    reject(@"bad_args", @"base64 is required", nil);
    return;
  }

  NSString *exportsDir = EnsureExportsDirOrReject(reject);
  if (!exportsDir) return;

  if (!fileName.length) {
    fileName = [NSString stringWithFormat:@"file-%@.bin", [[NSUUID UUID] UUIDString]];
  }

  NSString *destPath = [exportsDir stringByAppendingPathComponent:fileName];

  NSData *data = [[NSData alloc] initWithBase64EncodedString:base64 options:0];
  if (!data || data.length == 0) {
    reject(@"bad_args", @"Unable to decode base64 (empty)", nil);
    return;
  }

  NSError *writeErr = nil;
  BOOL ok = [data writeToFile:destPath options:NSDataWritingAtomic error:&writeErr];
  if (!ok || writeErr) {
    reject(@"fs_fail", [NSString stringWithFormat:@"Unable to write file: %@", writeErr], nil);
    return;
  }

  resolve(destPath);
}

EX_EXPORT_METHOD_AS(writeSubmissionXlsx,
                    writeSubmissionXlsx:(NSDictionary *)args
                    resolver:(EXPromiseResolveBlock)resolve
                    rejecter:(EXPromiseRejectBlock)reject)
{
  NSString *destPath = ToNSString(args[@"destPath"]);
  // Accept file:// URIs too.
  if ([destPath hasPrefix:@"file://"]) {
    destPath = [destPath substringFromIndex:7];
  }
  NSString *title = ToNSString(args[@"title"]);
  NSArray *rows = (NSArray *)args[@"rows"];
  NSArray *imagePaths = (NSArray *)args[@"imagePaths"];

  if (!destPath.length) {
    NSString *exportsDir = EnsureExportsDirOrReject(reject);
    if (!exportsDir) return;

    NSString *fileName = [NSString stringWithFormat:@"submission-%@.xlsx", [[NSUUID UUID] UUIDString]];
    destPath = [exportsDir stringByAppendingPathComponent:fileName];
  }

  // Create workbook
  lxw_workbook *workbook = workbook_new([destPath UTF8String]);
  if (!workbook) {
    reject(@"xlsx_fail", @"Unable to create workbook", nil);
    return;
  }

  lxw_worksheet *worksheet = workbook_add_worksheet(workbook, "submission");
  worksheet_set_column(worksheet, 0, 0, 44, NULL);
  worksheet_set_column(worksheet, 1, 1, 44, NULL);

  // Formats
  lxw_format *titleFmt = workbook_add_format(workbook);
  format_set_bold(titleFmt);
  format_set_align(titleFmt, LXW_ALIGN_LEFT);
  format_set_align(titleFmt, LXW_ALIGN_VERTICAL_CENTER);
  format_set_border(titleFmt, LXW_BORDER_THIN);

  lxw_format *labelFmt = workbook_add_format(workbook);
  format_set_bold(labelFmt);
  format_set_align(labelFmt, LXW_ALIGN_VERTICAL_CENTER);
  format_set_border(labelFmt, LXW_BORDER_THIN);

  lxw_format *valueFmt = workbook_add_format(workbook);
  format_set_align(valueFmt, LXW_ALIGN_VERTICAL_CENTER);
  format_set_border(valueFmt, LXW_BORDER_THIN);

  // Title row
  WriteMergedTitle(worksheet, titleFmt, title.length ? title : @"SUBMISSION");

  int r = 1;
  if ([rows isKindOfClass:[NSArray class]]) {
    for (id rowObj in rows) {
      if (![rowObj isKindOfClass:[NSDictionary class]]) continue;
      NSDictionary *row = (NSDictionary *)rowObj;
      NSString *label = ToNSString(row[@"label"]);
      NSString *value = ToNSString(row[@"value"]);
      WriteKeyValueRow(worksheet, labelFmt, valueFmt, r, label, value);
      r++;
      if (r > 60) break; // sanity cap
    }
  }

  // Blank line
  r++;

  // Photos header
  worksheet_merge_range(worksheet, r, 0, r, 1, "PHOTOS", titleFmt);
  r++;

  int imageTopRow = r;
  int imageBottomRow = imageTopRow + 36 - 1;
  ApplyBordersToArea(worksheet, imageTopRow, imageBottomRow);

  if ([imagePaths isKindOfClass:[NSArray class]]) {
    NSMutableArray<NSString *> *paths = [NSMutableArray array];
    for (id p in imagePaths) {
      NSString *s = ToNSString(p);
      if (s.length) [paths addObject:s];
      if (paths.count >= 6) break;
    }
    InsertImageGrid(worksheet, paths, imageTopRow);
  }

  // Close workbook (writes file)
  lxw_error err = workbook_close(workbook);
  if (err != LXW_NO_ERROR) {
    reject(@"xlsx_fail", [NSString stringWithFormat:@"workbook_close error: %d", err], nil);
    return;
  }

  resolve(destPath);
}

@end

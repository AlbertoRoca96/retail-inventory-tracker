import type { ReportProduct } from './reportProducts';
import { REPORT_PHOTO_SLOTS } from './reportPhotos.ts';

export type ReportSaveRequest = {
  ownerId: string;
  signature: string;
  payload: Record<string, any>;
  products: ReportProduct[];
  confirmed: boolean;
};

export function requestSignature(values: unknown, products: unknown, photoUris: string[]): string {
  return JSON.stringify({ values, products, photoUris });
}

export function canonicalReport(payload: Record<string, any>): Record<string, any> {
  const result = { ...payload };
  for (const slot of REPORT_PHOTO_SLOTS) {
    // Delivery links are regenerated for exports, never stored as retry identity.
    if (result[`photo${slot}_path`]) result[`photo${slot}_url`] = null;
  }
  return result;
}

export function assertRetryMatches(request: ReportSaveRequest, ownerId: string, signature: string) {
  if (request.ownerId !== ownerId) throw new Error('Pending save belongs to another account.');
  if (request.signature !== signature) {
    throw new Error('This report has a frozen save request. Restore the original draft values to retry, or verify it in Reports before starting a new report. Edited values have not been sent.');
  }
}

export function isRetryableReportError(error: { message?: string; status?: number; code?: string }): boolean {
  return error.status === 0 || (typeof error.status === 'number' && error.status >= 500)
    || /network|failed to fetch|load failed|timeout|timed out|connection/i.test(error.message || '');
}

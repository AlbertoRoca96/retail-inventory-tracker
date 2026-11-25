import { queuedProducts, type ReportProduct } from './reportProducts.ts';

export type QueuedSubmission = { id: string; createdAt: string; payload: any; products?: ReportProduct[] };

/** Caller serializes queue access. Delete only after the atomic RPC has acknowledged success. */
export async function flushQueuedReports(
  userId: string,
  items: QueuedSubmission[],
  submit: (payload: any, products: ReportProduct[]) => Promise<void>,
  persist: (remaining: QueuedSubmission[]) => Promise<void>,
): Promise<number> {
  let flushed = 0;
  for (const item of [...items]) {
    if ((item.payload?.created_by || item.payload?.user_id) !== userId) continue;
    await submit(item.payload, queuedProducts(item.products));
    const remaining = items.filter((candidate) => candidate !== item);
    // If persistence fails the entry stays available for an idempotent retry.
    await persist(remaining);
    items = remaining;
    flushed++;
  }
  return flushed;
}

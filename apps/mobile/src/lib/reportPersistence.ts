import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { queuedProducts, type ReportProduct } from './reportProducts';
import { flushQueuedReports, type QueuedSubmission } from './reportQueue';
import { canonicalReport } from './reportRequest';

const DRAFT_KEY = 'rit:new-form-draft:v10';
function draftKey(ownerId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(ownerId)) throw new Error('Sign in before saving a draft.');
  return `${DRAFT_KEY}:${ownerId}`;
}
const QUEUE_KEY = 'rit:submission-queue:v1';
const storage = {
  async get(key: string) {
    return Platform.OS === 'web' ? (typeof window === 'undefined' ? null : window.localStorage.getItem(key)) : AsyncStorage.getItem(key);
  },
  async set(key: string, value: string) {
    if (Platform.OS === 'web') window.localStorage.setItem(key, value);
    else await AsyncStorage.setItem(key, value);
  },
  async remove(key: string) {
    if (Platform.OS === 'web') window.localStorage.removeItem(key);
    else await AsyncStorage.removeItem(key);
  },
};
let draftPending: Promise<unknown> = Promise.resolve();
function draftWrite(work: () => Promise<void>) {
  const next = draftPending.then(work, work);
  draftPending = next.catch(() => {});
  return next;
}
export async function saveDraftLocal(draft: unknown, ownerId: string) {
  const serialized = JSON.stringify(draft);
  const key = draftKey(ownerId);
  await draftWrite(() => storage.set(key, serialized));
}
export async function loadDraftLocal<T>(ownerId: string): Promise<T | null> {
  const raw = await storage.get(draftKey(ownerId));
  return raw ? JSON.parse(raw) as T : null;
}
// Legacy unowned v9 drafts stay on disk but are never exposed to another login.
export async function clearDraftLocal(ownerId: string) {
  const key = draftKey(ownerId);
  await draftWrite(() => storage.remove(key));
}
export async function readQueue(): Promise<QueuedSubmission[]> {
  const raw = await storage.get(QUEUE_KEY);
  const items = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(items)) throw new Error('Invalid offline queue; local data retained.');
  return items;
}
// Serialize read/modify/write within this app instance so flush cannot overwrite an enqueue.
let pending: Promise<unknown> = Promise.resolve();
function locked<T>(work: () => Promise<T>): Promise<T> {
  const next = pending.then(work, work);
  pending = next.catch(() => {});
  return next;
}
export function enqueueSubmission(payload: any, products: ReportProduct[] = []) {
  return locked(async () => {
    const items = await readQueue();
    const existing = items.find(item => item.payload?.id === payload.id && item.payload?.created_by === payload.created_by);
    const canonical = canonicalReport(payload);
    if (existing) {
      if (JSON.stringify(canonicalReport(existing.payload)) !== JSON.stringify(canonical)
          || JSON.stringify(queuedProducts(existing.products)) !== JSON.stringify(queuedProducts(products))) {
        throw new Error('A different request with this report ID is already queued. Original retained.');
      }
      return;
    }
    items.push({ id: payload.id, createdAt: new Date().toISOString(), payload: canonical, products });
    await storage.set(QUEUE_KEY, JSON.stringify(items));
  });
}
export async function submitReport(payload: any, products?: unknown) {
  const { error } = await supabase.rpc('submit_report_v1', { p_report: canonicalReport(payload), p_products: queuedProducts(products) });
  if (error) throw error;
}
export function flushReportQueue(userId: string) {
  return locked(async () => {
    const items = await readQueue();
    return flushQueuedReports(userId, items, submitReport,
      (remaining) => storage.set(QUEUE_KEY, JSON.stringify(remaining)));
  });
}

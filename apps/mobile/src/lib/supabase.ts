import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const memory = new Map<string, string>();

const webGet = (k: string) =>
  typeof window === 'undefined' ? memory.get(k) ?? null : window.localStorage.getItem(k);

const webSet = (k: string, v: string) => {
  if (typeof window === 'undefined') { memory.set(k, v); return; }
  window.localStorage.setItem(k, v);
};

const webRemove = (k: string) => {
  if (typeof window === 'undefined') { memory.delete(k); return; }
  window.localStorage.removeItem(k);
};

const storage = {
  getItem: (k: string) =>
    Platform.OS === 'web' ? Promise.resolve(webGet(k)) : SecureStore.getItemAsync(k),
  setItem: (k: string, v: string) =>
    Platform.OS === 'web' ? (webSet(k, v), Promise.resolve()) : SecureStore.setItemAsync(k, v),
  removeItem: (k: string) =>
    Platform.OS === 'web' ? (webRemove(k), Promise.resolve()) : SecureStore.deleteItemAsync(k),
};

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);

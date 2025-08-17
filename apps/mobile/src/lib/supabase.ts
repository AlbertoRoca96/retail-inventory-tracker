import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

type StorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

// SSR-safe in-memory storage (used during static export in Node)
const mem = new Map<string, string>();
const memoryStorage: StorageAdapter = {
  getItem: async (k) => (mem.has(k) ? (mem.get(k) as string) : null),
  setItem: async (k, v) => { mem.set(k, v); },
  removeItem: async (k) => { mem.delete(k); },
};

// Browser localStorage (guarded for SSR)
const webStorage: StorageAdapter = {
  getItem: async (k) => (typeof window !== 'undefined' ? window.localStorage.getItem(k) : null),
  setItem: async (k, v) => { if (typeof window !== 'undefined') window.localStorage.setItem(k, v); },
  removeItem: async (k) => { if (typeof window !== 'undefined') window.localStorage.removeItem(k); },
};

// Native storage via SecureStore
const nativeStorage: StorageAdapter = {
  getItem: (k) => SecureStore.getItemAsync(k),
  setItem: (k, v) => SecureStore.setItemAsync(k, v),
  removeItem: (k) => SecureStore.deleteItemAsync(k),
};

const storage: StorageAdapter =
  Platform.OS === 'web'
    ? (typeof window === 'undefined' ? memoryStorage : webStorage)
    : nativeStorage;

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
      // Only try to parse URL hash for sessions in a real browser
      detectSessionInUrl: Platform.OS === 'web' && typeof window !== 'undefined',
    },
  }
);

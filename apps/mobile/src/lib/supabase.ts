import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const isWeb = Platform.OS === 'web';
const hasWindow = typeof window !== 'undefined';
const hasLocalStorage = isWeb && hasWindow && 'localStorage' in window;

const memory = new Map<string, string | null>();
const memoryStorage = {
  getItem: (k: string) => Promise.resolve(memory.get(k) ?? null),
  setItem: (k: string, v: string) => { memory.set(k, v); return Promise.resolve(); },
  removeItem: (k: string) => { memory.delete(k); return Promise.resolve(); },
};

const webStorage = {
  getItem: (k: string) => Promise.resolve(localStorage.getItem(k)),
  setItem: (k: string, v: string) => { localStorage.setItem(k, v); return Promise.resolve(); },
  removeItem: (k: string) => { localStorage.removeItem(k); return Promise.resolve(); },
};

const nativeStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};

const storage = isWeb ? (hasLocalStorage ? webStorage : memoryStorage) : nativeStorage;

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);

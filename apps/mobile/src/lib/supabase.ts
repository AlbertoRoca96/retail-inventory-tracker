import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const isSSR = typeof window === 'undefined';
const isWeb = Platform.OS === 'web';

const storage = {
  getItem: async (k: string) => {
    if (isSSR) return null;                             // export/SSR: don't touch native or browser APIs
    if (isWeb) return window.localStorage.getItem(k);   // browser
    return await SecureStore.getItemAsync(k);           // iOS/Android
  },
  setItem: async (k: string, v: string) => {
    if (isSSR) return;
    if (isWeb) { window.localStorage.setItem(k, v); return; }
    await SecureStore.setItemAsync(k, v);
  },
  removeItem: async (k: string) => {
    if (isSSR) return;
    if (isWeb) { window.localStorage.removeItem(k); return; }
    await SecureStore.deleteItemAsync(k);
  },
};

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const isSSR = typeof window === 'undefined';
const isWeb = Platform.OS === 'web';

const storage = {
  getItem: async (k: string) => {
    if (isSSR) return null;                             // export/SSR: don't touch native or browser APIs
    if (isWeb && typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(k);            // browser
    }
    return await SecureStore.getItemAsync(k);           // iOS/Android
  },
  setItem: async (k: string, v: string) => {
    if (isSSR) return;
    if (isWeb && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(k, v);
      return;
    }
    await SecureStore.setItemAsync(k, v);
  },
  removeItem: async (k: string) => {
    if (isSSR) return;
    if (isWeb && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(k);
      return;
    }
    await SecureStore.deleteItemAsync(k);
  },
};

const EXPO_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const EXPO_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

const missingEnv: string[] = [];

if (__DEV__) {
  const preview = (value?: string | null) => {
    if (!value) return 'undefined';
    if (value.length <= 12) return value;
    return `${value.slice(0, 8)}…${value.slice(-4)}`;
  };
  console.log('[Supabase] Runtime env check', {
    url: preview(EXPO_SUPABASE_URL),
    anonKey: preview(EXPO_SUPABASE_ANON_KEY),
  });
}
if (!EXPO_SUPABASE_URL) missingEnv.push('EXPO_PUBLIC_SUPABASE_URL (or SUPABASE_URL)');
if (!EXPO_SUPABASE_ANON_KEY) missingEnv.push('EXPO_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY)');

let supabaseClient: SupabaseClient;

if (missingEnv.length === 0) {
  supabaseClient = createClient(EXPO_SUPABASE_URL!, EXPO_SUPABASE_ANON_KEY!, {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
} else {
  const message =
    `[Supabase] Missing environment variables: ${missingEnv.join(
      ', '
    )}. Supabase features are disabled until they are provided.`;
  console.warn(message);
  // Create a proxy that throws a descriptive error if any Supabase method is invoked.
  supabaseClient = new Proxy({} as SupabaseClient, {
    get() {
      throw new Error(message);
    },
  });
}

export const supabase = supabaseClient;
export const hasSupabaseConfig = missingEnv.length === 0;

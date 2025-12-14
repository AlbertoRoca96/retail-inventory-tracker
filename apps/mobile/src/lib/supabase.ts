import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const FALLBACK_SUPABASE_URL = 'https://prhhlvdoplavakbgcbes.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByaGhsdmRvcGxhdmFrYmdjYmVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUzNDQ5MzQsImV4cCI6MjA3MDkyMDkzNH0.1m2eqSItpNq_rl_uU5PwOlSubdCfwp-NmW2QCPVWB5c';

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

const getConfigExtra = () => {
  const expoConfig = Constants.expoConfig;
  const manifest2 = (Constants as unknown as { manifest2?: { extra?: Record<string, unknown> } }).manifest2;
  const legacyManifest = (Constants as unknown as { manifest?: { extra?: Record<string, unknown> } }).manifest;
  return expoConfig?.extra ?? manifest2?.extra ?? legacyManifest?.extra ?? {};
};

const sanitize = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return undefined;
  return trimmed;
};

const isValidHttpUrl = (value?: string | null) => {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
};

const extra = getConfigExtra();
const envSupabaseUrl = sanitize(process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL);
const envSupabaseAnonKey = sanitize(
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
);

const extraSupabaseUrl = sanitize(extra.supabaseUrl as string | undefined);
const extraSupabaseAnonKey = sanitize(extra.supabaseAnonKey as string | undefined);

const resolvedSupabaseUrl =
  envSupabaseUrl ?? extraSupabaseUrl ?? FALLBACK_SUPABASE_URL;
const resolvedSupabaseAnonKey =
  envSupabaseAnonKey ?? extraSupabaseAnonKey ?? FALLBACK_SUPABASE_ANON_KEY;

const missingEnv: string[] = [];

if (__DEV__) {
  const preview = (value?: string) => {
    if (!value) return 'undefined';
    if (value.length <= 12) return value;
    return `${value.slice(0, 8)}…${value.slice(-4)}`;
  };
  const source = envSupabaseUrl || envSupabaseAnonKey
    ? 'env'
    : extraSupabaseUrl || extraSupabaseAnonKey
    ? 'constants.extra'
    : 'fallback';
  console.log('[Supabase] Runtime config', {
    url: preview(resolvedSupabaseUrl),
    anonKey: preview(resolvedSupabaseAnonKey),
    source,
  });
}

const supabaseUrl = isValidHttpUrl(resolvedSupabaseUrl) ? resolvedSupabaseUrl : undefined;
const supabaseAnonKey = resolvedSupabaseAnonKey;

if (!supabaseUrl) {
  missingEnv.push('EXPO_PUBLIC_SUPABASE_URL (or SUPABASE_URL)');
} else if (!isValidHttpUrl(supabaseUrl)) {
  missingEnv.push('EXPO_PUBLIC_SUPABASE_URL must start with http(s)://');
}
if (!supabaseAnonKey) missingEnv.push('EXPO_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY)');

let supabaseClient: SupabaseClient;

if (missingEnv.length === 0 && supabaseUrl && supabaseAnonKey) {
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
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

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { FALLBACK_SUPABASE_ANON_KEY, FALLBACK_SUPABASE_URL } from '../config/staticSupabase';

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

type ConfigSource = 'env' | 'constants.extra' | 'fallback';
type ConfigDiagnostics = {
  source: ConfigSource;
  hasUrl: boolean;
  urlValid: boolean;
  hasAnonKey: boolean;
};

const extra = getConfigExtra();
const envSupabaseUrl = sanitize(process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL);
const envSupabaseAnonKey = sanitize(
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
);

const extraSupabaseUrl = sanitize(extra.supabaseUrl as string | undefined);
const extraSupabaseAnonKey = sanitize(extra.supabaseAnonKey as string | undefined);

const fallbackSupabaseUrl = sanitize(FALLBACK_SUPABASE_URL);
const fallbackSupabaseAnonKey = sanitize(FALLBACK_SUPABASE_ANON_KEY);

const candidates: { source: ConfigSource; url?: string; anonKey?: string }[] = [
  { source: 'env', url: envSupabaseUrl, anonKey: envSupabaseAnonKey },
  { source: 'constants.extra', url: extraSupabaseUrl, anonKey: extraSupabaseAnonKey },
  { source: 'fallback', url: fallbackSupabaseUrl, anonKey: fallbackSupabaseAnonKey },
];

const configDiagnostics: ConfigDiagnostics[] = candidates.map((candidate) => ({
  source: candidate.source,
  hasUrl: !!candidate.url,
  urlValid: isValidHttpUrl(candidate.url),
  hasAnonKey: !!candidate.anonKey,
}));

const resolvedConfig = candidates.find(
  (candidate) => isValidHttpUrl(candidate.url) && !!candidate.anonKey
);

const supabaseUrl = resolvedConfig?.url;
const supabaseAnonKey = resolvedConfig?.anonKey;
const supabaseConfigSource: ConfigSource | null = resolvedConfig?.source ?? null;

const missingEnv: string[] = [];

if (__DEV__) {
  console.log('[Supabase] Runtime config', {
    resolvedFrom: supabaseConfigSource ?? 'none',
    diagnostics: configDiagnostics,
  });
}

if (!supabaseUrl) {
  missingEnv.push('EXPO_PUBLIC_SUPABASE_URL (or SUPABASE_URL)');
}
if (!supabaseAnonKey) {
  missingEnv.push('EXPO_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY)');
}

const summarizeDiagnostics = () =>
  configDiagnostics
    .map((diag) => {
      const urlState = diag.hasUrl ? (diag.urlValid ? 'url:valid' : 'url:invalid') : 'url:missing';
      const keyState = diag.hasAnonKey ? 'key:present' : 'key:missing';
      return `${diag.source} (${urlState}, ${keyState})`;
    })
    .join(' | ');

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
  const missingList = missingEnv.length ? missingEnv.join(', ') : 'Unknown config failure';
  const message =
    `[Supabase] Missing environment variables: ${missingList}. Supabase features are disabled until they are provided. Diagnostics -> ${summarizeDiagnostics()}`;
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
export const supabaseConfigInfo = {
  source: supabaseConfigSource,
  diagnostics: configDiagnostics,
};

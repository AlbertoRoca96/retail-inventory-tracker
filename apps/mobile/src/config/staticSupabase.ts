import fallback from "./staticSupabase.json";

export const FALLBACK_SUPABASE_URL = fallback.url;
export const FALLBACK_SUPABASE_ANON_KEY = fallback.anonKey;

export const supabaseFallback = {
  url: FALLBACK_SUPABASE_URL,
  anonKey: FALLBACK_SUPABASE_ANON_KEY,
} as const;

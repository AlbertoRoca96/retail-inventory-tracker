export const FALLBACK_SUPABASE_URL = "https://prhhlvdoplavakbgcbes.supabase.co";
export const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByaGhsdmRvcGxhdmFrYmdjYmVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUzNDQ5MzQsImV4cCI6MjA3MDkyMDkzNH0.1m2eqSItpNq_rl_uU5PwOlSubdCfwp-NmW2QCPVWB5c";

export const supabaseFallback = {
  url: FALLBACK_SUPABASE_URL,
  anonKey: FALLBACK_SUPABASE_ANON_KEY,
} as const;

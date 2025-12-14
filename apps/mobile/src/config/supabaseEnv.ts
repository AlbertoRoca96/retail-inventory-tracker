const FALLBACK_SUPABASE_URL = "https://prhhlvdoplavakbgcbes.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByaGhsdmRvcGxhdmFrYmdjYmVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUzNDQ5MzQsImV4cCI6MjA3MDkyMDkzNH0.1m2eqSItpNq_rl_uU5PwOlSubdCfwp-NmW2QCPVWB5c";

type SupabaseConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  source: "env" | "fallback";
};

const sanitize = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return undefined;
  return trimmed;
};

export const resolveSupabaseConfig = (): SupabaseConfig => {
  const envSupabaseUrl = sanitize(process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL);
  const envSupabaseAnonKey = sanitize(
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
  );

  const supabaseUrl = envSupabaseUrl ?? FALLBACK_SUPABASE_URL;
  const supabaseAnonKey = envSupabaseAnonKey ?? FALLBACK_SUPABASE_ANON_KEY;

  return {
    supabaseUrl,
    supabaseAnonKey,
    source: envSupabaseUrl && envSupabaseAnonKey ? "env" : "fallback",
  };
};

export const supabaseFallbacks = {
  FALLBACK_SUPABASE_URL,
  FALLBACK_SUPABASE_ANON_KEY,
};

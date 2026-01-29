import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().int().positive().optional().default(8787),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  ALLOWED_ORIGINS: z.string().optional(),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadConfig(): AppConfig {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Throwing here is good: fail-fast beats mysterious 500s.
    throw new Error(`Invalid env: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function parseAllowedOrigins(raw?: string): string[] {
  const cleaned = (raw ?? '').trim();
  if (!cleaned) return [];
  return cleaned
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

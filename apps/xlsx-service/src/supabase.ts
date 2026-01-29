import { createClient } from '@supabase/supabase-js';

import type { AppConfig } from './config.js';

export function createAdminSupabase(config: AppConfig) {
  // Service role bypasses RLS. Treat it like a loaded gun.
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

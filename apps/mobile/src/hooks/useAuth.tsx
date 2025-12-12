// apps/mobile/src/hooks/useAuth.tsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { webBasePath } from '../lib/webBasePath';

// Keep public shape simple
type Session = { user: any } | null;

type AuthValue = {
  session: Session;
  ready: boolean; // becomes true after the initial session check completes
  demo: boolean;  // dev-bypass indicator (anonymous auth)
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithOtp: (email: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

// Build-time flag (set to "false" in web.yml for production web)
const BYPASS =
  String(process.env.EXPO_PUBLIC_DEV_BYPASS_LOGIN || '').toLowerCase() === 'true';

// Detect anonymous Supabase user across SDK variants
const isAnonymousUser = (u: any) =>
  !!(u?.is_anonymous || u?.app_metadata?.provider === 'anonymous');

// Compute redirect URL for email flows (magic link / confirm / reset)
function emailRedirectTo(): string | undefined {
  if (
    typeof window === 'undefined' ||
    typeof window.location === 'undefined' ||
    typeof window.location.origin !== 'string'
  ) {
    return undefined;
  }
  const base = `${window.location.origin}${webBasePath()}`; // e.g. ".../retail-inventory-tracker"
  return `${base}/auth/callback`;
}

const AuthCtx = createContext<AuthValue>({
  session: null,
  ready: false,
  demo: BYPASS,
  signIn: async () => {},
  signUp: async () => {},
  signInWithOtp: async () => {},
  resetPassword: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unsub: null | (() => void) = null;

    (async () => {
      try {
        // 1) Pick up any persisted session
        const { data: s0 } = await supabase.auth.getSession();
        const current = (s0.session as any) ?? null;

        // 2) Enforce no-anonymous when BYPASS is off
        if (!BYPASS && current?.user && isAnonymousUser(current.user)) {
          await supabase.auth.signOut();
          if (!cancelled) setSession(null);
        } else if (BYPASS && !current) {
          // 3) Optional dev bypass: sign in anonymously once
          try {
            // @ts-expect-error: signInAnonymously may be missing on older typings
            await (supabase.auth as any).signInAnonymously?.();
            const fresh = (await supabase.auth.getSession()).data.session;
            if (!cancelled) setSession((fresh as any) ?? null);
          } catch {
            if (!cancelled) setSession(null);
          }
        } else {
          if (!cancelled) setSession(current);
        }

        // 4) Subscribe to auth state changes (store cleanup)
        const { data } = supabase.auth.onAuthStateChange(async (_evt, s1) => {
          if (!BYPASS && s1?.user && isAnonymousUser(s1.user)) {
            await supabase.auth.signOut();
            if (!cancelled) setSession(null);
            return;
          }
          if (!cancelled) setSession((s1 as any) ?? null);
        });
        unsub = () => data.subscription.unsubscribe();
      } finally {
        // Mark the gate as ready regardless of outcome
        if (!cancelled) setReady(true);
      }
    })();

    // Cleanup on unmount
    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      ready,
      demo: BYPASS,

      // Email + password login
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },

      // Email + password sign-up (will require email confirm if enabled in Supabase)
      async signUp(email, password) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: emailRedirectTo() },
        });
        if (error) throw error;
      },

      // Passwordless magic link
      async signInWithOtp(email) {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: emailRedirectTo() },
        });
        if (error) throw error;
      },

      // Password reset email
      async resetPassword(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: emailRedirectTo(),
        } as any);
        if (error) throw error;
      },

      async signOut() {
        await supabase.auth.signOut();
      },
    }),
    [session, ready]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

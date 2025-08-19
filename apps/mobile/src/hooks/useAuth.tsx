// apps/mobile/src/hooks/useAuth.tsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { webBasePath } from '../lib/webBasePath';

// Public shape kept simple to avoid importing supabase types here
type Session = { user: any } | null;

type AuthValue = {
  session: Session;
  demo: boolean; // dev-bypass indicator (anonymous auth)
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithOtp: (email: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

// Toggle ON only in local/dev to skip login via anonymous auth.
// IMPORTANT: This is read at build time for the web bundle.
const BYPASS = String(process.env.EXPO_PUBLIC_DEV_BYPASS_LOGIN || '').toLowerCase() === 'true';

// Detect anonymous Supabase user across SDK versions
const isAnonymousUser = (u: any): boolean =>
  !!(u?.is_anonymous || u?.app_metadata?.provider === 'anonymous');

// Compute the email redirect URL for web auth flows (magic link / confirm)
// Example: https://<user>.github.io/retail-inventory-tracker/auth/callback
function emailRedirectTo(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const base = `${window.location.origin}${webBasePath()}`;
  return `${base}/auth/callback`;
}

const AuthCtx = createContext<AuthValue>({
  session: null,
  demo: BYPASS,
  signIn: async () => {},
  signUp: async () => {},
  signInWithOtp: async () => {},
  resetPassword: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>(null);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      // 1) Pick up existing session (persisted in localStorage/SecureStore)
      const { data: s0 } = await supabase.auth.getSession();
      const current = (s0.session as any) ?? null;

      // 2) If BYPASS is OFF but we find an anonymous session => force logout
      if (!BYPASS && current?.user && isAnonymousUser(current.user)) {
        await supabase.auth.signOut();
        if (!cancelled) setSession(null);
      } else if (!current && BYPASS) {
        // 3) If BYPASS is ON and there's no session, sign in anonymously once
        try {
          await supabase.auth.signInAnonymously();
          const fresh = (await supabase.auth.getSession()).data.session;
          if (!cancelled) setSession((fresh as any) ?? null);
        } catch {
          // ignore; user will see login screen
          if (!cancelled) setSession(null);
        }
      } else {
        if (!cancelled) setSession(current);
      }

      // 4) Subscribe to auth changes
      const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, s1) => {
        // Guard against anonymous sessions slipping in when BYPASS is OFF
        if (!BYPASS && s1?.user && isAnonymousUser(s1.user)) {
          await supabase.auth.signOut();
          if (!cancelled) setSession(null);
          return;
        }
        if (!cancelled) setSession((s1 as any) ?? null);
      });

      return () => sub.subscription.unsubscribe();
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      demo: BYPASS,

      // Email + password login
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },

      // Create an account (email + password)
      // If "Confirm email" is enabled in Supabase, the user must confirm via email first.
      async signUp(email, password) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: emailRedirectTo() },
        });
        if (error) throw error;
      },

      // Passwordless (magic link)
      async signInWithOtp(email) {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: emailRedirectTo() },
        });
        if (error) throw error;
      },

      // Send password reset email
      async resetPassword(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: emailRedirectTo(), // takes the user back to the app after resetting
        } as any);
        if (error) throw error;
      },

      async signOut() {
        await supabase.auth.signOut();
      },
    }),
    [session]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

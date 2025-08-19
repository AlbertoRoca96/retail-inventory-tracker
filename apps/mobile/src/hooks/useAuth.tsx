// apps/mobile/src/hooks/useAuth.tsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { webBasePath } from '../lib/webBasePath';

// Keep the public shape lightweight
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

// Build-time flag (set to "false" in web.yml for production web)
const BYPASS = String(process.env.EXPO_PUBLIC_DEV_BYPASS_LOGIN || '').toLowerCase() === 'true';

// Helper: detect anonymous Supabase users (covers SDK variants)
const isAnonymousUser = (u: any): boolean =>
  !!(u?.is_anonymous || u?.app_metadata?.provider === 'anonymous');

// Build a redirect URL for email flows that returns to our app on web.
// Examples:
//   - GitHub Pages: https://<user>.github.io/retail-inventory-tracker/auth/callback
//   - Local dev:    http://localhost:8081/auth/callback (or whatever dev host)
// Make sure this exact path is added in Supabase → Authentication → URL Configuration → Redirect URLs.
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
      // 1) Pick up any persisted session
      const { data: s0 } = await supabase.auth.getSession();
      const current = (s0.session as any) ?? null;

      // 2) If BYPASS is OFF but an anonymous session is present → force logout
      if (!BYPASS && current?.user && isAnonymousUser(current.user)) {
        await supabase.auth.signOut();
        if (!cancelled) setSession(null);
      } else if (BYPASS && !current) {
        // 3) Optional dev bypass: create an anonymous session once
        try {
          await supabase.auth.signInAnonymously();
          const fresh = (await supabase.auth.getSession()).data.session;
          if (!cancelled) setSession((fresh as any) ?? null);
        } catch {
          if (!cancelled) setSession(null);
        }
      } else {
        if (!cancelled) setSession(current);
      }

      // 4) React to future auth changes
      const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, s1) => {
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
    return () => { cancelled = true; };
  }, []);

  const value = useMemo<AuthValue>(() => ({
    session,
    demo: BYPASS,

    // Standard email/password sign-in
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },

    // Email/password sign-up
    // If “Confirm email” is enabled in Supabase, user must click the email first.
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
  }), [session]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

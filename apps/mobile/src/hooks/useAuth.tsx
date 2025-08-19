// apps/mobile/src/hooks/useAuth.tsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

// Public shape
type Session = { user: any } | null;

type AuthValue = {
  session: Session;
  demo: boolean; // dev-bypass indicator
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithOtp: (email: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

// Toggle ON only in local/dev to keep the “skip login” behavior.
const BYPASS = String(process.env.EXPO_PUBLIC_DEV_BYPASS_LOGIN || '').toLowerCase() === 'true';

// Helper: detect anonymous Supabase user across SDK versions
const isAnonymousUser = (u: any): boolean =>
  !!(u?.is_anonymous || u?.app_metadata?.provider === 'anonymous');

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
      // Pick up existing session (persisted in localStorage/SecureStore)
      const { data: s0 } = await supabase.auth.getSession(); // supabase-js reference: getSession
      const current = (s0.session as any) ?? null;

      // If BYPASS is OFF but we find an anonymous session => force logout
      if (!BYPASS && current?.user && isAnonymousUser(current.user)) {
        await supabase.auth.signOut();
        if (!cancelled) setSession(null);
      } else {
        if (!cancelled) setSession(current);
      }

      // Subscribe to auth changes
      const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, s1) => {
        // Guard against anonymous sessions slipping in
        if (!BYPASS && s1?.user && isAnonymousUser(s1.user)) {
          await supabase.auth.signOut();
          if (!cancelled) setSession(null);
          return;
        }
        if (!cancelled) setSession((s1 as any) ?? null);
      }); // supabase-js reference: onAuthStateChange

      return () => sub.subscription.unsubscribe();
    };

    bootstrap();
    return () => { cancelled = true; };
  }, []);

  const value = useMemo<AuthValue>(() => ({
    session,
    demo: BYPASS,

    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },

    async signUp(email, password) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      // If "Confirm email" is enabled, the user must confirm before first login.
    },

    async signInWithOtp(email) {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
    },

    async resetPassword(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
    },

    async signOut() {
      await supabase.auth.signOut();
    },
  }), [session]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

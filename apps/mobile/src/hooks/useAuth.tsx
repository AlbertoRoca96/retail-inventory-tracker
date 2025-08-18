// apps/mobile/src/hooks/useAuth.tsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

// Public shape
type Session = { user: { id: string; email?: string | null } } | null;

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
// In production, set this to false or remove it.
const BYPASS = String(process.env.EXPO_PUBLIC_DEV_BYPASS_LOGIN || '').toLowerCase() === 'true';

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
      // 1) pick up existing session
      const { data: s0 } = await supabase.auth.getSession(); // ref: getSession
      if (!cancelled) setSession((s0.session as any) ?? null);

      // 2) subscribe to auth changes
      const { data: sub } = supabase.auth.onAuthStateChange((_evt, s1) => {
        if (!cancelled) setSession((s1 as any) ?? null);
      }); // ref: onAuthStateChange

      // 3) Optional dev-bypass: sign in anonymously once
      if (BYPASS) {
        const cur = (await supabase.auth.getSession()).data.session;
        if (!cur) {
          await supabase.auth.signInAnonymously(); // ref: signInAnonymously
          const fresh = (await supabase.auth.getSession()).data.session;
          if (!cancelled) setSession((fresh as any) ?? null);
        }
      }

      return () => sub.subscription.unsubscribe();
    };

    bootstrap();
    return () => { cancelled = true; };
  }, []);

  const value = useMemo<AuthValue>(() => ({
    session,
    demo: BYPASS,

    // Email + password login (standard)
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password }); // ref: signInWithPassword
      if (error) throw error;
    },

    // Create an account (email + password)
    async signUp(email, password) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      // If “Confirm email” is enabled in your project, user must confirm before first login.
    },

    // Passwordless email (magic link)
    async signInWithOtp(email) {
      const { error } = await supabase.auth.signInWithOtp({ email }); // ref: signInWithOtp
      if (error) throw error;
    },

    // Send password reset email
    async resetPassword(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email); // ref: resetPasswordForEmail
      if (error) throw error;
    },

    async signOut() {
      await supabase.auth.signOut();
    },
  }), [session]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

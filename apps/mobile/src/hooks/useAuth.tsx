// apps/mobile/src/hooks/useAuth.tsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { webBasePath } from '../lib/webBasePath';

type Session = { user: any } | null;

type AuthValue = {
  session: Session;
  ready: boolean;              // <— new
  demo: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithOtp: (email: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const BYPASS = String(process.env.EXPO_PUBLIC_DEV_BYPASS_LOGIN || '').toLowerCase() === 'true';
const isAnonymousUser = (u: any) => !!(u?.is_anonymous || u?.app_metadata?.provider === 'anonymous');

function emailRedirectTo(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const base = `${window.location.origin}${webBasePath()}`;
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

    (async () => {
      try {
        const { data: s0 } = await supabase.auth.getSession();
        const current = (s0.session as any) ?? null;

        if (!BYPASS && current?.user && isAnonymousUser(current.user)) {
          await supabase.auth.signOut();
          if (!cancelled) setSession(null);
        } else if (BYPASS && !current) {
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

        const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, s1) => {
          if (!BYPASS && s1?.user && isAnonymousUser(s1.user)) {
            await supabase.auth.signOut();
            if (!cancelled) setSession(null);
            return;
          }
          if (!cancelled) setSession((s1 as any) ?? null);
        });

        // mark ready after initial bootstrap
        if (!cancelled) setReady(true);

        return () => sub.subscription.unsubscribe();
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const value = useMemo<AuthValue>(() => ({
    session,
    ready,
    demo: BYPASS,
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signUp(email, password) {
      const { error } = await supabase.auth.signUp({
        email, password, options: { emailRedirectTo: emailRedirectTo() },
      });
      if (error) throw error;
    },
    async signInWithOtp(email) {
      const { error } = await supabase.auth.signInWithOtp({
        email, options: { emailRedirectTo: emailRedirectTo() },
      });
      if (error) throw error;
    },
    async resetPassword(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: emailRedirectTo(),
      } as any);
      if (error) throw error;
    },
    async signOut() { await supabase.auth.signOut(); },
  }), [session, ready]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type Session = { user: { id: string; email?: string | null } } | null;

type AuthValue = {
  session: Session;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<AuthValue>({ session: null, signOut: async () => {} });

const BYPASS = String(process.env.EXPO_PUBLIC_DEV_BYPASS_LOGIN || '').toLowerCase() === 'true';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      // 1) pick up existing session
      const { data } = await supabase.auth.getSession();
      if (!cancelled) setSession((data.session as any) ?? null);

      // 2) subscribe to changes
      const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
        if (!cancelled) setSession((s as any) ?? null);
      });

      // 3) if bypass is ON and we’re not logged in, sign in anonymously
      if (BYPASS) {
        const cur = (await supabase.auth.getSession()).data.session;
        if (!cur) {
          await supabase.auth.signInAnonymously(); // creates a real user + JWT
          const fresh = (await supabase.auth.getSession()).data.session;
          if (!cancelled) setSession((fresh as any) ?? null);
        }
      }

      return () => sub.subscription.unsubscribe();
    };

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

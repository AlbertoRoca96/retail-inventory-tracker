import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type Session = { user: { id: string; email?: string | null } } | null;
type AuthValue = {
  session: Session;
  signInWithEmail: (email: string, password: string) => Promise<{ error?: Error }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue>({
  session: null,
  signInWithEmail: async () => ({}),
  signOut: async () => {}
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session>(null);

  useEffect(() => {
    const bypass = String(process.env.EXPO_PUBLIC_DEV_BYPASS_LOGIN || '').toLowerCase() === 'true';
    if (bypass) {
      setSession({ user: { id: 'dev-user', email: 'dev@example.com' } });
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session as Session));
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, s) => setSession(s as Session));
    return () => subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      signInWithEmail: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error ?? undefined };
      },
      signOut: async () => {
        await supabase.auth.signOut();
      }
    }),
    [session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);

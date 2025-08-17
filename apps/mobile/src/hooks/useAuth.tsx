import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type AuthContextShape = {
  user: { id: string; email?: string } | null;
  demo: boolean;
  loading: boolean;
  signIn: (email?: string, password?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextShape>({
  user: null,
  demo: false,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
});

const DEV_BYPASS =
  (process.env.EXPO_PUBLIC_DEV_BYPASS_LOGIN || '').toLowerCase() === 'true';

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  // try to hydrate Supabase session (real login) on load
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) setUser({ id: data.user.id, email: data.user.email ?? undefined });
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email ?? undefined });
        setDemo(false);
      } else {
        setUser(null);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email?: string, password?: string) => {
    // Bypass when fields are empty and flag is on
    if (DEV_BYPASS && (!email || email.trim() === '') && (!password || password.trim() === '')) {
      setDemo(true);
      setUser({ id: 'demo', email: 'demo@local' });
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email || '',
      password: password || '',
    });
    if (error) throw error;
    setDemo(false);
    setUser({ id: data.user.id, email: data.user.email ?? undefined });
  };

  const signOut = async () => {
    if (demo) {
      setDemo(false);
      setUser(null);
      return;
    }
    await supabase.auth.signOut();
    setUser(null);
  };

  const value = useMemo(
    () => ({ user, demo, loading, signIn, signOut }),
    [user, demo, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);

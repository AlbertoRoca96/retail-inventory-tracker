import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import { supabase } from '../lib/supabase';

type AuthCtx = {
  authed: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx>({
  authed: false,
  loading: true,
  login: async () => {},
  logout: async () => {}
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const bypass = process.env.EXPO_PUBLIC_DEV_BYPASS_LOGIN === 'true';

  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);

  // Initialize auth state
  useEffect(() => {
    (async () => {
      if (bypass) {
        setAuthed(true);
        setLoading(false);
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      setAuthed(!!session);
      setLoading(false);
    })();
  }, [bypass]);

  const login = async (email: string, password: string) => {
    if (bypass) {
      setAuthed(true);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    setAuthed(true);
  };

  const logout = async () => {
    if (!bypass) await supabase.auth.signOut();
    setAuthed(false);
  };

  const value = useMemo(() => ({ authed, loading, login, logout }), [authed, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);

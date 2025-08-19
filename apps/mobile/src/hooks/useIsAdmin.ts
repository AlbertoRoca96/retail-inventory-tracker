import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export function useIsAdmin() {
  const { session, ready } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!ready || !session?.user) { setIsAdmin(false); setLoading(false); return; }
      setLoading(true);
      const { data } = await supabase
        .from('team_members')
        .select('is_admin')
        .eq('user_id', session.user.id)
        .eq('is_admin', true)
        .limit(1)
        .maybeSingle();
      if (!cancelled) { setIsAdmin(!!data); setLoading(false); }
    };
    run();
    return () => { cancelled = true; };
  }, [ready, session?.user?.id]);

  return { isAdmin, loading };
}

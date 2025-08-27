import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Stack, Redirect, usePathname } from 'expo-router';
import { AuthProvider, useAuth } from '../src/hooks/useAuth';
import { supabase } from '../src/lib/supabase';

function isUnauthPath(p: string | null) {
  if (!p) return false;
  return p.endsWith('/login') || p.endsWith('/auth/callback');
}
function isAdminSection(p: string | null) {
  if (!p) return false;
  return p.endsWith('/admin') || p.includes('/admin/');
}
function isHomePath(p: string | null) {
  if (!p) return false;
  return p.endsWith('/home');
}

function Gate({ children }: { children: React.ReactNode }) {
  const { session, ready } = useAuth();
  const pathname = usePathname();

  const [adminReady, setAdminReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const me = session?.user?.id || '';
  const [alert, setAlert] = useState<{ id: string; store?: string; who?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!ready) return;

      if (!session?.user) {
        if (!cancelled) { setIsAdmin(false); setAdminReady(true); }
        return;
      }

      const { data, error } = await supabase
        .from('team_members')
        .select('is_admin')
        .eq('user_id', session.user.id)
        .eq('is_admin', true)
        .limit(1)
        .maybeSingle();

      if (!cancelled) {
        setIsAdmin(!!data && !error);
        setAdminReady(true);
      }
    };

    setAdminReady(false);
    run();
    return () => { cancelled = true; };
  }, [ready, session?.user?.id]);

  // Subscribe to priority-1 inserts/updates for all of my teams
  useEffect(() => {
    if (!session?.user?.id) return;

    let cancelled = false;
    const channels: ReturnType<typeof supabase.channel>[] = [];

    (async () => {
      const { data: teams } = await supabase
        .from('team_members')
        .select('team_id, teams(name)')
        .eq('user_id', session.user!.id);

      if (cancelled) return;
      for (const t of (teams || [])) {
        const teamId = t.team_id;

        const handle = (payload: any) => {
          const row = payload?.new || {};
          if (row.priority_level === 1 && row.created_by !== me) {
            setAlert({ id: row.id, store: row.store_location || row.store_site || '', who: row.created_by });
          }
        };

        const ch = supabase.channel(`pri1-${teamId}`)
          .on('postgres_changes',
              { event: 'INSERT', schema: 'public', table: 'submissions', filter: `team_id=eq.${teamId}` },
              handle)
          .on('postgres_changes',
              { event: 'UPDATE', schema: 'public', table: 'submissions', filter: `team_id=eq.${teamId}` },
              handle)
          .subscribe();

        channels.push(ch);
      }
    })();

    return () => {
      cancelled = true;
      for (const ch of channels) {
        try { supabase.removeChannel(ch); } catch {}
      }
    };
  }, [session?.user?.id]);

  if (!ready) return <>{children}</>;
  const onUnauth = isUnauthPath(pathname);

  if (!session && !onUnauth) return <Redirect href="/login" />;

  if (session && pathname?.endsWith('/login')) {
    if (!adminReady) return <>{children}</>;
    return <Redirect href={isAdmin ? '/admin' : '/menu'} />;
  }

  if (session && isAdminSection(pathname)) {
    if (!adminReady) return <>{children}</>;
    if (!isAdmin) return <Redirect href="/menu" />;
  }

  if (session && isHomePath(pathname)) {
    if (!adminReady) return <>{children}</>;
    if (!isAdmin) return <Redirect href="/menu" />;
  }

  return (
    <>
      {alert ? (
        <View style={{
          position:'absolute', top: 20, left: 16, right: 16, zIndex: 9999,
          backgroundColor: '#ef4444', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#fff'
        }}>
          <Text style={{ color:'#fff', fontWeight:'800', marginBottom: 4 }}>PRIORITY 1 ALERT</Text>
          <Text style={{ color:'#fff' }}>New urgent submission{alert.store ? ` @ ${alert.store}` : ''}</Text>
          <View style={{ flexDirection:'row', gap: 8, marginTop: 8 }}>
            <Pressable onPress={() => setAlert(null)}
              style={{ backgroundColor:'#111827', paddingHorizontal:10, paddingVertical:6, borderRadius:8 }}>
              <Text style={{ color:'#fff', fontWeight:'700' }}>Dismiss</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {children}
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <Gate>
        <Stack screenOptions={{ headerShown: false }} />
      </Gate>
    </AuthProvider>
  );
}

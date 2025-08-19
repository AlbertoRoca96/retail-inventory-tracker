import React, { useEffect, useState } from 'react';
import { Stack, Redirect, usePathname } from 'expo-router';
import { AuthProvider, useAuth } from '../src/hooks/useAuth';
import { supabase } from '../src/lib/supabase';

/** Treat both plain and GH Pages paths as unauth-allowed */
function isUnauthPath(p: string | null) {
  if (!p) return false;
  // Works whether pathname is "/login" or "/retail-inventory-tracker/login"
  return p.endsWith('/login') || p.endsWith('/auth/callback');
}

/** Matches "/admin" or anything under it, even with a GH Pages base path */
function isAdminSection(p: string | null) {
  if (!p) return false;
  return p.endsWith('/admin') || p.includes('/admin/');
}

/** Matches "/home" exactly (we'll steer non-admins away from it) */
function isHomePath(p: string | null) {
  if (!p) return false;
  return p.endsWith('/home');
}

function Gate({ children }: { children: React.ReactNode }) {
  const { session, ready } = useAuth();
  const pathname = usePathname();

  // Admin status (queried once we know the user)
  const [adminReady, setAdminReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // Until auth bootstrap finishes, don't query
      if (!ready) return;

      if (!session?.user) {
        // Not signed in -> no admin
        if (!cancelled) { setIsAdmin(false); setAdminReady(true); }
        return;
      }

      // Check membership directly from team_members to avoid any view caching weirdness
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

  // 🚦 Do nothing until Supabase finishes initial session check
  if (!ready) return <>{children}</>;

  const onUnauth = isUnauthPath(pathname);

  // Not signed in => gate everything except login/callback
  if (!session && !onUnauth) return <Redirect href="/login" />;

  // Signed in and currently on /login -> send to the right place (wait for admin check)
  if (session && pathname?.endsWith('/login')) {
    if (!adminReady) return <>{children}</>;
    return <Redirect href={isAdmin ? '/admin' : '/menu'} />;
  }

  // Signed in, non-admin trying to visit /admin -> push to /menu (wait for admin check)
  if (session && isAdminSection(pathname)) {
    if (!adminReady) return <>{children}</>;
    if (!isAdmin) return <Redirect href="/menu" />;
  }

  // Signed in, non-admin on /home -> push to /menu
  if (session && isHomePath(pathname)) {
    if (!adminReady) return <>{children}</>;
    if (!isAdmin) return <Redirect href="/menu" />;
  }

  return <>{children}</>;
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

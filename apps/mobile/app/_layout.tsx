// apps/mobile/app/_layout.tsx
import React from 'react';
import { Stack, Redirect, usePathname } from 'expo-router';
import { AuthProvider, useAuth } from '../src/hooks/useAuth';

/**
 * Providers must wrap the route tree. We wrap the router with AuthProvider,
 * then use a Gate component (below) to redirect based on session.
 */
function Gate() {
  const { session } = useAuth();
  const pathname = usePathname();

  // Allow unauth access to login, the Supabase callback, and a debug page
  const unauth = new Set<string>(['/login', '/auth/callback', '/debug-auth']);
  const isOnUnauth = unauth.has(pathname);

  // Unauthenticated: keep only unauth routes open
  if (!session && !isOnUnauth) return <Redirect href="/login" />;

  // Authenticated: keep them out of /login
  if (session && pathname === '/login') return <Redirect href="/home" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

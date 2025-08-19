// apps/mobile/app/_layout.tsx
import React from 'react';
import { Stack, Redirect, usePathname } from 'expo-router';
import { useAuth } from '../src/hooks/useAuth';

/**
 * Auth gate:
 * - If no session → only allow /login and /auth/callback
 * - If session  → keep users out of /login
 */
function Gate() {
  const { session } = useAuth();
  const pathname = usePathname();

  const unauth = new Set<string>(['/login', '/auth/callback', '/debug-auth']);
  const isOnUnauth = unauth.has(pathname);

  if (!session && !isOnUnauth) return <Redirect href="/login" />;
  if (session && pathname === '/login') return <Redirect href="/home" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  // AuthProvider lives in App.tsx now; Gate just uses it.
  return <Gate />;
}

// apps/mobile/app/_layout.tsx
import React from 'react';
import { Stack, Redirect, usePathname } from 'expo-router';
import { useAuth } from '../src/hooks/useAuth';

/**
 * Global auth gate:
 * - If no session -> redirect to /login (except when already on an unauth route)
 * - If session -> keep users out of /login (send to /home)
 *
 * Unauthenticated allowlist MUST include /auth/callback so Supabase can complete
 * email confirm / magic-link / reset flows before we block the route.
 */
export default function RootLayout() {
  const { session } = useAuth();
  const pathname = usePathname();

  // Allow unauth access to the login screen and the Supabase email callback
  const unauthRoutes = new Set<string>(['/login', '/auth/callback']);
  const isOnUnauthRoute = unauthRoutes.has(pathname);

  // Unauthenticated: force to /login (but let /login and /auth/callback through)
  if (!session && !isOnUnauthRoute) {
    return <Redirect href="/login" />;
  }

  // Authenticated: keep them out of /login
  if (session && pathname === '/login') {
    return <Redirect href="/home" />; // change to '/menu' if that's your preferred landing page
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

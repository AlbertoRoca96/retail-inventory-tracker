// apps/mobile/app/_layout.tsx
import React from 'react';
import { Stack, Redirect, usePathname } from 'expo-router';
import { useAuth } from '../src/hooks/useAuth';

/**
 * Global auth gate:
 * - If no session -> redirect to /login (except when already on /login)
 * - If session -> keep users out of /login (send to /home)
 *
 * Adjust the post-login redirect ("/home") if your preferred landing page differs.
 */
export default function RootLayout() {
  const { session } = useAuth();
  const pathname = usePathname();

  // Routes that should remain accessible without a session
  const unauthRoutes = new Set(['/login']);
  const isOnUnauthRoute = unauthRoutes.has(pathname);

  // Unauthenticated: force to /login
  if (!session && !isOnUnauthRoute) {
    return <Redirect href="/login" />;
  }

  // Authenticated: keep them out of /login
  if (session && isOnUnauthRoute) {
    // Change "/home" to "/menu" or "/" if that's your preferred landing page.
    return <Redirect href="/home" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

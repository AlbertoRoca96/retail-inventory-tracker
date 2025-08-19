// apps/mobile/app/_layout.tsx
import React from 'react';
import { Stack, Redirect, usePathname } from 'expo-router';
import { AuthProvider, useAuth } from '../src/hooks/useAuth';

/**
 * We mount AuthProvider at the top and keep the auth gate in a child
 * component so the hook can read a real context instead of the default.
 */

function AuthGate() {
  const { session } = useAuth();
  const pathname = usePathname();

  // Allow unauth access to login and the Supabase email callback
  const unauthRoutes = new Set<string>(['/login', '/auth/callback']);
  const isOnUnauth = unauthRoutes.has(pathname);

  // Not signed in -> force to /login (but let /login and /auth/callback through)
  if (!session && !isOnUnauth) return <Redirect href="/login" />;

  // Signed in -> keep them out of /login
  if (session && pathname === '/login') return <Redirect href="/home" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

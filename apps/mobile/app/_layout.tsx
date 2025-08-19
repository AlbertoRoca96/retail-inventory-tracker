// apps/mobile/app/_layout.tsx
import React from 'react';
import { Stack, Redirect, usePathname } from 'expo-router';
import { AuthProvider, useAuth } from '../src/hooks/useAuth';

function AuthGate() {
  const { session, ready } = useAuth();
  const pathname = usePathname();

  // Wait for the first auth bootstrap to finish to avoid flicker/loops
  if (!ready) return null;

  // Allow unauth access to login and the Supabase email callback
  const unauth = new Set<string>(['/login', '/auth/callback']);
  const isOnUnauth = unauth.has(pathname);

  if (!session && !isOnUnauth) return <Redirect href="/login" />;
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

// apps/mobile/app/_layout.tsx
import React from 'react';
import { Stack, Redirect, usePathname } from 'expo-router';
import { AuthProvider, useAuth } from '../src/hooks/useAuth';

function Gate({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const pathname = usePathname();
  const unauth = new Set<string>(['/login', '/auth/callback']);
  const isOnUnauth = unauth.has(pathname);

  if (!session && !isOnUnauth) return <Redirect href="/login" />;
  if (session && pathname === '/login') return <Redirect href="/home" />;
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

// apps/mobile/app/_layout.tsx
import React from 'react';
import { Stack, Redirect, usePathname } from 'expo-router';
import { AuthProvider, useAuth } from '../src/hooks/useAuth';

/** Treat both plain and GH Pages paths as unauth-allowed */
function isUnauthPath(p: string | null) {
  if (!p) return false;
  // Works whether pathname is "/login" or "/retail-inventory-tracker/login"
  return p.endsWith('/login') || p.endsWith('/auth/callback');
}

function Gate({ children }: { children: React.ReactNode }) {
  const { session, ready } = useAuth();
  const pathname = usePathname();

  // 🚦 Do nothing until Supabase finishes initial session check
  if (!ready) return <>{children}</>;

  const onUnauth = isUnauthPath(pathname);

  if (!session && !onUnauth) return <Redirect href="/login" />;
  if (session && pathname?.endsWith('/login')) return <Redirect href="/home" />;

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

// apps/mobile/app/_layout.tsx
import React from 'react';
import { Stack, Redirect, usePathname } from 'expo-router';
import { AuthProvider, useAuth } from '../src/hooks/useAuth';
import { webBasePath } from '../src/lib/webBasePath';

function Gate({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  let pathname = usePathname();

  // Normalize: remove the GH Pages base path if present.
  const base = webBasePath(); // e.g. "/retail-inventory-tracker" on Pages
  if (base && pathname.startsWith(base)) {
    pathname = pathname.slice(base.length) || '/';
  }

  const isLogin = pathname === '/login';
  const isCallback = pathname.startsWith('/auth/callback');

  if (!session && !(isLogin || isCallback)) return <Redirect href="/login" />;
  if (session && isLogin) return <Redirect href="/home" />;

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

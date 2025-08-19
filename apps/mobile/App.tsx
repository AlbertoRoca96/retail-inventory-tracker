// apps/mobile/App.tsx
import React from 'react';
import { Slot } from 'expo-router';
import { AuthProvider } from './src/hooks/useAuth';

/**
 * Root of the app for Expo Router.
 * Wrap the entire route tree with AuthProvider.
 * All pages under /app now have access to useAuth().
 */
export default function App() {
  return (
    <AuthProvider>
      <Slot />
    </AuthProvider>
  );
}

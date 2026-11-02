// apps/mobile/app/auth/callback.tsx
import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { supabase } from '../../src/lib/supabase';
import { router } from 'expo-router';

export default function AuthCallback() {
  const [msg, setMsg] = useState('Completing sign in…');

  useEffect(() => {
    (async () => {
      try {
        if (typeof window === 'undefined' || !window.location?.href) {
          setMsg('Open this authentication link in a browser.');
          return;
        }

        const url = new URL(window.location.href);
        const hash = new URLSearchParams(
          url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
        );
        const flow = url.searchParams.get('flow') ??
          url.searchParams.get('type') ??
          hash.get('type');
        const passwordFlow = flow === 'invite' || flow === 'recovery';
        const destination = passwordFlow ? '/auth/set-password' : '/menu';

        const code = url.searchParams.get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          router.replace(destination);
          return;
        }

        const accessToken = hash.get('access_token');
        const refreshToken = hash.get('refresh_token');
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          router.replace(destination);
          return;
        }

        const existing = await supabase.auth.getSession();
        if (existing.data.session) {
          router.replace(destination);
          return;
        }

        const authError = url.searchParams.get('error_description') ??
          hash.get('error_description');
        setMsg(authError || 'This authentication link is invalid or has expired.');
      } catch (error: any) {
        setMsg(error?.message || 'Unable to complete authentication.');
      }
    })();
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Text>{msg}</Text>
    </View>
  );
}

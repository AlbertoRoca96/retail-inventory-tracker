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
        const url = typeof window !== 'undefined' ? window.location.href : '';

        // 1) Try the PKCE code flow first (magic link / password reset use this)
        const u = new URL(url);
        const hasCode = !!u.searchParams.get('code');

        if (hasCode) {
          const { error } = await supabase.auth.exchangeCodeForSession(url);
          if (error) { setMsg(error.message); return; }
          router.replace('/menu');
          return;
        }

        // 2) Fallback for INVITE links (hash tokens: #access_token=...&refresh_token=...)
        //    Invite flow may not support the PKCE code exchange.
        //    Parse tokens from the hash and set the session manually.
        const hash = u.hash?.startsWith('#') ? u.hash.slice(1) : '';
        const h = new URLSearchParams(hash);
        const access_token = h.get('access_token');
        const refresh_token = h.get('refresh_token');

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) { setMsg(error.message); return; }
          router.replace('/menu');
          return;
        }

        // Nothing we recognize
        setMsg('No auth parameters found in URL.');
      } catch (e: any) {
        setMsg(e?.message || 'Something went wrong');
      }
    })();
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Text>{msg}</Text>
    </View>
  );
}

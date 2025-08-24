import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { supabase } from '../../src/lib/supabase';
import { router } from 'expo-router';

export default function AuthCallback() {
  const [msg, setMsg] = useState('Completing sign in…');

  useEffect(() => {
    (async () => {
      try {
        // Handles email confirm, magic link, and password reset redirects
        const url = typeof window !== 'undefined' ? window.location.href : '';
        const { error } = await supabase.auth.exchangeCodeForSession(url);
        if (error) { setMsg(error.message); return; }
        router.replace('/menu'); // ✅ land on Menu, not /home
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

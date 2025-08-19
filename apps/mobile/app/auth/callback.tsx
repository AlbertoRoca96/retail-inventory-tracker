import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { supabase } from '../../src/lib/supabase';
import { router } from 'expo-router';

export default function AuthCallback() {
  useEffect(() => {
    (async () => {
      await new Promise(r => setTimeout(r, 100));
      const { data } = await supabase.auth.getSession();
      router.replace(data.session ? '/' : '/login');
    })();
  }, []);
  return <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}><Text>Finishing sign-in…</Text></View>;
}

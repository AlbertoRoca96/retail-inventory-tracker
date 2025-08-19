// apps/mobile/app/home.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/hooks/useAuth';
import { theme } from '../src/theme';

export default function HomeRoute() {
  const { session } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      if (!session?.user) return;
      const { data } = await supabase
        .from('v_user_teams')
        .select('is_admin')
        .eq('user_id', session.user.id)
        .eq('is_admin', true)
        .limit(1)
        .maybeSingle();
      setIsAdmin(!!data);
    })();
  }, [session?.user?.id]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '700' }}>You’re in ✅</Text>
      <Text style={{ color: '#6b7280' }}>Placeholder “home” screen.</Text>

      {isAdmin && (
        <Link href="/admin" asChild>
          <Pressable style={[theme.button, { marginTop: 8 }]}>
            <Text style={theme.buttonText}>Go to Admin</Text>
          </Pressable>
        </Link>
      )}
    </View>
  );
}

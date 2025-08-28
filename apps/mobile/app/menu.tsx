// apps/mobile/app/menu.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { colors } from '../src/theme';
import { supabase } from '../src/lib/supabase';
import { useIsAdmin } from '../src/hooks/useIsAdmin';

export default function Menu() {
  const { isAdmin, loading } = useIsAdmin();

  // Lightweight check so we can surface a direct "Set Display Name" shortcut if needed
  const [needsDisplayName, setNeedsDisplayName] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const name = (data.user?.user_metadata as any)?.display_name;
      if (!cancelled) setNeedsDisplayName(!name || String(name).trim().length === 0);
    })();
    return () => { cancelled = true; };
  }, []);

  const Btn = ({
    label,
    onPress,
    bg = colors.blue,
    fg = 'white',
    mt = 6,
  }: {
    label: string;
    onPress: () => void;
    bg?: string;
    fg?: string;
    mt?: number;
  }) => (
    <Pressable
      onPress={onPress}
      style={{
        width: 260,
        backgroundColor: bg,
        padding: 14,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: mt,
      }}
    >
      <Text style={{ color: fg, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 12 }}>Menu</Text>

      <Btn label="Create New Form" onPress={() => router.push('/form/new')} />
      <Btn label="View Submissions" onPress={() => router.push('/submissions')} />

      {/* Make Account easy to find */}
      <Btn
        label="Account"
        onPress={() => router.push('/account/settings')}
        bg="#e5e7eb"
        fg={colors.text}
      />

      {/* If user hasn't set a display name yet, surface a shortcut to the capture page */}
      {needsDisplayName ? (
        <Btn
          label="Set Display Name"
          onPress={() => router.push('/account/display-name')}
          bg="#f3f4f6"
          fg={colors.text}
        />
      ) : null}

      {/* Admin-only actions */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 10 }} />
      ) : isAdmin ? (
        <>
          <Btn label="Admin" onPress={() => router.push('/admin')} />
          <Btn label="Metrics" onPress={() => router.push('/admin/metrics')} />
        </>
      ) : null}

      <Btn
        label="Log Out"
        onPress={async () => {
          await supabase.auth.signOut().catch(() => {});
          router.replace('/'); // Gate will route unauth users to /login
        }}
        bg={colors.gray}
        fg={colors.black}
        mt={14}
      />
    </View>
  );
}

// apps/mobile/app/menu.tsx
import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { colors } from '../src/theme';
import { supabase } from '../src/lib/supabase';
import { useIsAdmin } from '../src/hooks/useIsAdmin';

export default function Menu() {
  const { isAdmin, loading } = useIsAdmin();

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
          router.replace('/'); // Gate will send unauth users to /login
        }}
        bg={colors.gray}
        fg={colors.black}
        mt={14}
      />
    </View>
  );
}

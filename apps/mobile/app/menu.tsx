// apps/mobile/app/menu.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Head, router } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { useIsAdmin } from '../src/hooks/useIsAdmin';
import { useUISettings } from '../src/lib/uiSettings';
import { colors, theme, typography, textA11yProps } from '../src/theme';

export default function Menu() {
  const { isAdmin, loading } = useIsAdmin();
  const { fontScale, highContrast, targetMinHeight, simplifiedMode, largeText } = useUISettings();

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

  // Typography scaled by user preference
  const titleStyle = useMemo(() => ({
    fontSize: Math.round(typography.title.fontSize * fontScale * 1.05),
    lineHeight: Math.round(typography.title.lineHeight * fontScale * 1.05),
    fontWeight: '700' as const,
    marginBottom: 12,
  }), [fontScale]);

  const bodyStyle = useMemo(() => ({
    fontSize: Math.round(typography.body.fontSize * fontScale * (largeText || simplifiedMode ? 1.08 : 1.02)),
    lineHeight: Math.round(typography.body.lineHeight * fontScale * (largeText || simplifiedMode ? 1.08 : 1.02)),
    fontWeight: '700' as const,
  }), [fontScale, largeText, simplifiedMode]);

  const basePadV = simplifiedMode ? theme.spacing(3) : theme.spacing(2);

  const Btn = ({
    label,
    onPress,
    bg = colors.blue,
    fg = colors.white,
    mt = 6,
    a11y,
  }: {
    label: string;
    onPress: () => void;
    bg?: string;
    fg?: string;
    mt?: number;
    a11y?: string;
  }) => {
    // Slightly darker button in high-contrast
    const effectiveBg =
      highContrast && bg === colors.blue ? '#1743b3'
      : highContrast && bg === colors.red ? '#b11414'
      : bg;

    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={a11y ?? label}
        hitSlop={10}
        style={({ pressed }) => [
          {
            width: 280,
            backgroundColor: effectiveBg,
            paddingVertical: basePadV,
            paddingHorizontal: 16,
            borderRadius: 12,
            alignItems: 'center',
            marginTop: mt,
            minHeight: targetMinHeight, // ≥48dp target (Material guidance)
            borderWidth: highContrast ? 1 : 0,
            borderColor: highContrast ? '#000' : 'transparent',
          },
          pressed && { opacity: 0.97 },
        ]}
      >
        <Text {...textA11yProps} style={[bodyStyle, { color: fg }]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
      <Head><title>Menu</title></Head>

      <Text {...textA11yProps} style={titleStyle}>Menu</Text>

      <Btn label="Create New Form" onPress={() => router.push('/form/new')} a11y="Create new form" />
      <Btn label="View Submissions" onPress={() => router.push('/submissions')} a11y="View submissions" />

      {/* Account */}
      <Btn label="Account" onPress={() => router.push('/account/settings')} a11y="Account settings" />

      {/* If user hasn't set a display name yet, surface a shortcut */}
      {needsDisplayName ? (
        <Btn label="Set Display Name" onPress={() => router.push('/account/display-name')} a11y="Set display name" />
      ) : null}

      {/* Admin-only actions */}
      {loading ? (
        <ActivityIndicator accessibilityLabel="Loading admin status" style={{ marginTop: 10 }} />
      ) : isAdmin ? (
        <>
          <Btn label="Admin" onPress={() => router.push('/admin')} a11y="Admin section" />
          <Btn label="Metrics" onPress={() => router.push('/admin/metrics')} a11y="Metrics dashboard" />
        </>
      ) : null}

      {/* Logout is red */}
      <Btn
        label="Log Out"
        onPress={async () => {
          await supabase.auth.signOut().catch(() => {});
          router.replace('/'); // Gate will route unauth users to /login
        }}
        bg={colors.red}
        fg={colors.white}
        mt={14}
        a11y="Log out"
      />
    </View>
  );
}

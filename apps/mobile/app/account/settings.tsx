// apps/mobile/app/account/settings.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Image, Platform, Switch } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/hooks/useAuth';
import { supabase } from '../../src/lib/supabase';
import { uploadAvatarAndGetPublicUrl } from '../../src/lib/supabaseHelpers';
import { router } from 'expo-router';
import { useUISettings } from '../../src/lib/uiSettings';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme, textA11yProps, typography } from '../../src/theme';

const isWeb = Platform.OS === 'web';
const DISPLAY_PREFS_KEY = 'display_prefs';

export default function AccountSettings() {
  const { session } = useAuth();
  const user = session?.user || null;

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Existing simplified mode (from your UI context)
  const { simplifiedMode, setSimplifiedMode } = useUISettings();

  // New: app-local display prefs
  const [largeText, setLargeText] = useState(false);
  const [highContrast, setHighContrast] = useState(false);

  useEffect(() => {
    const md = (user?.user_metadata || {}) as any;
    setDisplayName(md.display_name || user?.email?.split('@')[0] || '');
    setAvatarUrl(md.avatar_url || null);
  }, [user?.id]);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(DISPLAY_PREFS_KEY);
        if (saved) {
          const j = JSON.parse(saved);
          setLargeText(!!j.largeText);
          setHighContrast(!!j.highContrast);
        }
      } catch {}
    })();
  }, []);

  const saveDisplayPrefs = async (next: { largeText: boolean; highContrast: boolean }) => {
    try {
      await AsyncStorage.setItem(DISPLAY_PREFS_KEY, JSON.stringify(next));
    } catch {}
  };

  const toggleLT = () => {
    const next = { largeText: !largeText, highContrast };
    setLargeText(next.largeText);
    saveDisplayPrefs(next);
  };

  const toggleHC = () => {
    const next = { largeText, highContrast: !highContrast };
    setHighContrast(next.highContrast);
    saveDisplayPrefs(next);
  };

  const pickAvatar = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9,
    });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    const url = await uploadAvatarAndGetPublicUrl(user!.id, {
      uri: a.uri, fileName: a.fileName || 'avatar.jpg', mimeType: a.mimeType || 'image/jpeg',
    }, 'avatars');
    if (url) setAvatarUrl(url);
  };

  const save = async () => {
    if (!user) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.updateUser({
      data: { display_name: displayName || null, avatar_url: avatarUrl || null },
    });
    setBusy(false);
    setMsg(error ? error.message : 'Saved');
  };

  return (
    <View style={{ flex:1, padding:16, gap:12 as any }}>
      <Text
        {...textA11yProps}
        style={{ fontSize: typography.title.fontSize, lineHeight: typography.title.lineHeight, fontWeight:'800', textAlign:'center', marginBottom:8 }}
      >
        Account Settings
      </Text>

      <View style={{ alignItems:'center', gap:8 as any }}>
        <Image
          source={{ uri: avatarUrl || 'https://i.pravatar.cc/150?u=placeholder' }}
          style={{ width:120, height:120, borderRadius:60, borderWidth:1, borderColor:'#111' }}
          accessibilityIgnoresInvertColors
        />
        <Pressable
          onPress={pickAvatar}
          accessibilityRole="button"
          accessibilityLabel="Change photo"
          style={[theme.button, { backgroundColor: theme.colors.blue }]}
        >
          <Text {...textA11yProps} style={theme.buttonText}>Change Photo</Text>
        </Pressable>
      </View>

      <View>
        <Text {...textA11yProps} style={{ fontWeight:'700', marginBottom:6 }}>DISPLAY NAME</Text>
        <TextInput
          {...textA11yProps}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          autoCorrect={false}
          autoCapitalize="words"
          accessibilityLabel="Display name"
          style={theme.input}
        />
      </View>

      <View style={{ marginTop: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.colors.gray }}>
        <Text {...textA11yProps} style={{ fontWeight: '800', marginBottom: 6 }}>ACCESSIBILITY</Text>

        <Row
          title="Simplified mode"
          desc="Larger text and buttons for easier reading and tapping."
          value={simplifiedMode}
          onValueChange={setSimplifiedMode}
        />

        <Row
          title="Large text mode"
          desc="Bumps body & button text sizes even more. Also honors system text size."
          value={largeText}
          onValueChange={toggleLT}
        />

        <Row
          title="High-contrast mode"
          desc="Uses stronger color contrast for text & UI."
          value={highContrast}
          onValueChange={toggleHC}
        />
      </View>

      <Pressable
        onPress={save}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Save account settings"
        style={[
          theme.button,
          { backgroundColor: busy ? '#94a3b8' : theme.colors.blue }
        ]}
      >
        <Text {...textA11yProps} style={theme.buttonText}>{busy ? 'Saving…' : 'Save'}</Text>
      </Pressable>

      <Pressable onPress={() => router.back()} style={{ alignSelf:'center', marginTop:8 }} accessibilityRole="button" accessibilityLabel="Exit settings">
        <Text {...textA11yProps}>Exit</Text>
      </Pressable>

      {msg ? (
        <View style={{ alignItems:'center', marginTop:8 }}>
          <Text {...textA11yProps} style={{ color: msg === 'Saved' ? '#16a34a' : '#ef4444' }}>{msg}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Row({
  title, desc, value, onValueChange,
}: {
  title: string; desc: string; value: boolean; onValueChange: (v: boolean | ((x: boolean) => boolean)) => void;
}) {
  return (
    <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical: 8 }}>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text {...textA11yProps} style={typography.body}>
          <Text style={{ fontWeight:'700' }}>{title}</Text>
        </Text>
        <Text {...textA11yProps} style={{ color:'#374151' }}>{desc}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange as any} />
    </View>
  );
}

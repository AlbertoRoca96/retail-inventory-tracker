import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, Pressable, Image, Platform, Switch, ScrollView } from 'react-native';
import { router } from 'expo-router';
import Head from 'expo-router/head';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/hooks/useAuth';
import { supabase } from '../../src/lib/supabase';
import { uploadAvatarAndGetPublicUrl } from '../../src/lib/supabaseHelpers';
import { useUISettings } from '../../src/lib/uiSettings';
import { theme, colors } from '../../src/theme';

const isWeb = Platform.OS === 'web';

export default function AccountSettings() {
  const { session } = useAuth();
  const user = session?.user || null;

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // UI accessibility settings (safe defaults if provider not mounted for some reason)
  const {
    simplifiedMode = false,
    setSimplifiedMode = () => {},
    largeText = false,
    setLargeText = () => {},
    highContrast = false,
    setHighContrast = () => {},
  } = useUISettings() || ({} as any);

  // hidden <input type="file"> for web avatar selection
  const webFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const md = (user?.user_metadata || {}) as any;
    setDisplayName(md.display_name || user?.email?.split('@')[0] || '');
    setAvatarUrl(md.avatar_url || null);
  }, [user?.id]);

  const pickAvatarNative = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    const url = await uploadAvatarAndGetPublicUrl(
      user!.id,
      {
        uri: a.uri,
        fileName: a.fileName || 'avatar.jpg',
        mimeType: a.mimeType || 'image/jpeg',
      },
      'avatars'
    );
    if (url) setAvatarUrl(url);
  };

  const pickAvatarWeb = () => {
    webFileRef.current?.click();
  };

  const handleWebFile = async (f?: File | null) => {
    if (!user || !f) return;
    const url = await uploadAvatarAndGetPublicUrl(
      user.id,
      {
        uri: URL.createObjectURL(f),
        fileName: f.name || 'avatar.jpg',
        mimeType: f.type || 'image/jpeg',
      },
      'avatars'
    );
    if (url) setAvatarUrl(url);
  };

  const pickAvatar = async () => {
    if (!user) return;
    if (isWeb) return pickAvatarWeb();
    return pickAvatarNative();
  };

  const save = async () => {
    if (!user) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.updateUser({
      data: { display_name: displayName || null, avatar_url: avatarUrl || null },
    });
    setBusy(false);
    setMsg(error ? error.message : 'Saved');
  };

  // accessibility-aware sizing
  const basePad = simplifiedMode ? theme.spacing(3) : theme.spacing(2);
  const labelSize = (simplifiedMode || largeText) ? 16 : 14;
  const inputHeight = (simplifiedMode || largeText) ? 52 : 44;
  const buttonMinHeight = simplifiedMode ? 56 : 48;
  const btnBg = highContrast ? '#1743b3' : theme.colors.blue;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Head><title>Account Settings</title></Head>

      <Text style={{ fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 8 }}>
        Account Settings
      </Text>

      <View style={{ alignItems: 'center', gap: 8 }}>
        <Image
          source={{ uri: avatarUrl || 'https://i.pravatar.cc/150?u=placeholder' }}
          style={{ width: 120, height: 120, borderRadius: 60, borderWidth: 1, borderColor: highContrast ? '#000' : '#111' }}
        />
        <Pressable
          onPress={pickAvatar}
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
          style={{ backgroundColor: btnBg, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: colors.white, fontWeight: '700' }}>Change Photo</Text>
        </Pressable>
      </View>

      <View>
        <Text style={{ fontWeight: '700', marginBottom: 6, fontSize: labelSize }}>DISPLAY NAME</Text>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          autoCorrect={false}
          autoCapitalize="words"
          style={{
            backgroundColor: colors.white,
            borderWidth: 1,
            borderColor: highContrast ? '#000' : '#111',
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
            height: inputHeight,
          }}
        />
      </View>

      <View style={{ marginTop: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#e5e7eb' }}>
        <Text style={{ fontWeight: '800', marginBottom: 6 }}>ACCESSIBILITY</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={{ fontWeight: '700', marginBottom: 2 }}>Simplified mode</Text>
            <Text style={{ color: '#374151' }}>Larger text and buttons for easier reading and tapping.</Text>
          </View>
          <Switch value={simplifiedMode} onValueChange={setSimplifiedMode} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={{ fontWeight: '700', marginBottom: 2 }}>Large text mode</Text>
            <Text style={{ color: '#374151' }}>Bumps body & button text sizes even more.</Text>
          </View>
          <Switch value={largeText} onValueChange={setLargeText} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={{ fontWeight: '700', marginBottom: 2 }}>High-contrast mode</Text>
            <Text style={{ color: '#374151' }}>Stronger color contrast for text & UI.</Text>
          </View>
          <Switch value={highContrast} onValueChange={setHighContrast} />
        </View>
      </View>

      <Pressable
        onPress={save}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Save account settings"
        style={{
          backgroundColor: busy ? '#94a3b8' : btnBg,
          paddingVertical: basePad,
          borderRadius: 10,
          alignItems: 'center',
          minHeight: buttonMinHeight,
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: colors.white, fontWeight: '700' }}>{busy ? 'Saving…' : 'Save'}</Text>
      </Pressable>

      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Exit"
        style={{ alignSelf: 'center', marginTop: 8, minHeight: 44, justifyContent: 'center' }}
      >
        <Text>Exit</Text>
      </Pressable>

      {msg ? (
        <View style={{ alignItems: 'center', marginTop: 8 }}>
          <Text style={{ color: msg === 'Saved' ? '#16a34a' : '#ef4444' }}>{msg}</Text>
        </View>
      ) : null}

      {/* Web-only hidden input for avatar */}
      {isWeb ? (
        <div style={{ height: 0, overflow: 'hidden' }}>
          <input
            ref={webFileRef as any}
            type="file"
            accept="image/*"
            onChange={(e) => handleWebFile(e.currentTarget.files?.[0] ?? null)}
          />
        </div>
      ) : null}
    </ScrollView>
  );
}

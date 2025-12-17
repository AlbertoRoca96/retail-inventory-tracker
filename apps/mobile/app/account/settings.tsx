import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, Pressable, Image, Platform, Switch, ScrollView, SafeAreaView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import Head from 'expo-router/head';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/hooks/useAuth';
import { supabase } from '../../src/lib/supabase';
import { uploadAvatarAndGetPublicUrl } from '../../src/lib/supabaseHelpers';
import { useUISettings } from '../../src/lib/uiSettings';
import { theme, colors } from '../../src/theme';
import LogoHeader from '../../src/components/LogoHeader';

const isWeb = Platform.OS === 'web';

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 16,
  },
  avatarBlock: {
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 2,
    borderColor: colors.border,
  },
  changePhotoButton: {
    backgroundColor: colors.accentBlue,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
  },
  changePhotoText: {
    color: colors.white,
    fontWeight: '700',
  },
});

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
  const btnBg = highContrast ? '#0f172a' : colors.accentBlue;

  return (
    <SafeAreaView style={styles.safe}>
      <Head><title>Settings</title></Head>
      <LogoHeader title="Settings" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatarBlock}>
          <Image
            source={{ uri: avatarUrl || 'https://i.pravatar.cc/150?u=placeholder' }}
            style={styles.avatar}
          />
          <Pressable
            onPress={pickAvatar}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            style={styles.changePhotoButton}
          >
            <Text style={styles.changePhotoText}>Change Photo</Text>
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
    </SafeAreaView>
  );
}

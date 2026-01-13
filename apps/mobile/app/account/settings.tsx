import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, Pressable, Image, Platform, Switch, ScrollView, SafeAreaView, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import Head from 'expo-router/head';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/hooks/useAuth';
import { supabase } from '../../src/lib/supabase';
import { uploadAvatarAndGetPublicUrl, getSignedStorageUrl } from '../../src/lib/supabaseHelpers';
import { useUISettings } from '../../src/lib/uiSettings';
import { theme, colors } from '../../src/theme';
import LogoHeader from '../../src/components/LogoHeader';
import Button from '../../src/components/Button';

const isWeb = Platform.OS === 'web';

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    gap: 16,
    flexGrow: 1,
    alignItems: 'stretch',
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
  adminCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  adminLabel: {
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
});

export default function AccountSettings() {
  const { session } = useAuth();
  const user = session?.user || null;

  const [displayName, setDisplayName] = useState('');
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

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
    if (!user?.id) {
      setDisplayName('');
      setAvatarPath(null);
      setAvatarUrl(null);
      return;
    }
    let cancelled = false;
    const bootstrap = async () => {
      const md = (user.user_metadata || {}) as any;
      const fallbackName = md.display_name || user.email?.split('@')[0] || '';
      setDisplayName((prev) => prev || fallbackName);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('display_name, avatar_path')
          .eq('id', user.id)
          .maybeSingle();
        if (cancelled) return;
        if (!error && data) {
          setDisplayName(data.display_name ?? fallbackName);
          setAvatarPath(data.avatar_path ?? null);
          if (!data.avatar_path) {
            setAvatarUrl(null);
          }
        } else {
          setAvatarPath(null);
          setAvatarUrl(null);
          setDisplayName((prev) => prev || fallbackName);
        }
      } catch {
        if (!cancelled) {
          setAvatarPath(null);
          setAvatarUrl(null);
        }
      }
    };
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!avatarPath) {
      setAvatarUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const signed = await getSignedStorageUrl('avatars', avatarPath, 60 * 60 * 4);
      if (!cancelled) {
        setAvatarUrl(signed);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [avatarPath]);

  useEffect(() => {
    let active = true;
    if (!user?.id) {
      setIsAdmin(false);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase
          .from('team_members')
          .select('is_admin')
          .eq('user_id', user.id)
          .eq('is_admin', true)
          .limit(1)
          .maybeSingle();
        if (!active) return;
        setIsAdmin(!error && !!data);
      } catch (err) {
        if (!active) return;
        setIsAdmin(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const ensureMediaPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access to update your profile photo.');
      return false;
    }
    return true;
  };

  const persistProfile = async (
    overrides?: { displayName?: string; avatarPath?: string | null },
    opts: { silent?: boolean } = {}
  ) => {
    if (!user) return;
    if (!opts.silent) setBusy(true);
    setMsg(null);
    const nextDisplayName = overrides?.displayName ?? displayName;
    const nextAvatarPath = overrides?.avatarPath ?? avatarPath;
    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          email: user.email,
          display_name: nextDisplayName || null,
          avatar_path: nextAvatarPath || null,
        },
        { onConflict: 'id' }
      );
    if (!opts.silent) setBusy(false);
    if (error) {
      setMsg(error.message);
    } else {
      setMsg(opts.silent ? 'Photo updated' : 'Saved');
      setDisplayName(nextDisplayName);
      setAvatarPath(nextAvatarPath ?? null);
    }
  };

  const pickAvatarNative = async () => {
    if (!(await ensureMediaPermission())) return;
    setPhotoBusy(true);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const uploaded = await uploadAvatarAndGetPublicUrl(
        user!.id,
        {
          uri: a.uri,
          fileName: a.fileName || 'avatar.jpg',
          mimeType: a.mimeType || 'image/jpeg',
        },
        'avatars'
      );
      if (uploaded) {
        setAvatarPath(uploaded.path);
        if (uploaded.publicUrl) {
          setAvatarUrl(uploaded.publicUrl);
        }
        await persistProfile({ avatarPath: uploaded.path }, { silent: true });
      }
    } catch (error: any) {
      Alert.alert('Photo upload failed', error?.message || 'Unable to update avatar right now.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const pickAvatarWeb = () => {
    webFileRef.current?.click();
  };

  const handleWebFile = async (f?: File | null) => {
    if (!user || !f) return;
    setPhotoBusy(true);
    const tempUri = URL.createObjectURL(f);
    try {
      const uploaded = await uploadAvatarAndGetPublicUrl(
        user.id,
        {
          uri: tempUri,
          fileName: f.name || 'avatar.jpg',
          mimeType: f.type || 'image/jpeg',
          blob: f,
        },
        'avatars'
      );
      if (uploaded) {
        setAvatarPath(uploaded.path);
        if (uploaded.publicUrl) {
          setAvatarUrl(uploaded.publicUrl);
        }
        await persistProfile({ avatarPath: uploaded.path }, { silent: true });
      }
    } catch (error: any) {
      Alert.alert('Photo upload failed', error?.message || 'Unable to update avatar right now.');
    } finally {
      URL.revokeObjectURL(tempUri);
      setPhotoBusy(false);
      if (webFileRef.current) {
        webFileRef.current.value = '';
      }
    }
  };

  const pickAvatar = async () => {
    if (!user || photoBusy) return;
    if (isWeb) return pickAvatarWeb();
    return pickAvatarNative();
  };

  const save = async () => {
    await persistProfile();
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
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        <View style={styles.avatarBlock}>
          <Image
            source={{ uri: avatarUrl || 'https://i.pravatar.cc/150?u=placeholder' }}
            style={styles.avatar}
          />
          <Pressable
            onPress={pickAvatar}
            disabled={photoBusy}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            style={[styles.changePhotoButton, photoBusy && { opacity: 0.6 }]}
          >
            <Text style={styles.changePhotoText}>{photoBusy ? 'Uploading…' : 'Change Photo'}</Text>
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

      {isAdmin ? (
        <View style={styles.adminCard}>
          <Text style={styles.adminLabel}>ADMIN SHORTCUTS</Text>
          <Button
            title="Open Admin Panel"
            onPress={() => router.push('/admin')}
            fullWidth
            accessibilityLabel="Open admin panel"
          />
          <Button
            title="Metrics Dashboard"
            variant="secondary"
            onPress={() => router.push('/admin/metrics')}
            fullWidth
            accessibilityLabel="Open metrics dashboard"
          />
        </View>
      ) : null}

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
          alignSelf: 'stretch',
        }}
      >
        <Text style={{ color: colors.white, fontWeight: '700' }}>{busy ? 'Saving…' : 'Save'}</Text>
      </Pressable>

      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Exit"
        style={{ alignSelf: 'stretch', marginTop: 8, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
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

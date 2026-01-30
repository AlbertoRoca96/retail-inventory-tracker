import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';

import LogoHeader from '../../src/components/LogoHeader';
import { colors, theme, typography } from '../../src/theme';
import {
  buildViewerUrl,
  guessFileNameFromUrl,
  guessKindFromNameOrType,
  shareAttachment,
  type AttachmentMeta,
} from '../../src/lib/attachmentViewer';

export default function AttachmentViewerScreen() {
  const params = useLocalSearchParams<{ url?: string; type?: string; name?: string }>();
  const [sharing, setSharing] = useState(false);

  const meta = useMemo<AttachmentMeta | null>(() => {
    const url = typeof params.url === 'string' ? params.url : '';
    if (!url) return null;
    const name = (typeof params.name === 'string' && params.name.length)
      ? params.name
      : guessFileNameFromUrl(url);
    const kind = guessKindFromNameOrType(params.type, name);
    return { url, kind, name };
  }, [params.url, params.name, params.type]);

  const viewerUrl = useMemo(() => (meta ? buildViewerUrl(meta) : ''), [meta]);

  const onShare = async () => {
    if (!meta) return;
    try {
      setSharing(true);
      await shareAttachment(meta);
    } catch (err: any) {
      Alert.alert('Share failed', err?.message ?? 'Unable to share this attachment.');
    } finally {
      setSharing(false);
    }
  };

  if (!meta) {
    return (
      <SafeAreaView style={styles.safe}>
        <LogoHeader title="Attachment" />
        <View style={styles.center}>
          <Text style={styles.subtitle}>Attachment missing.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <LogoHeader title={meta.name} subtitle={meta.kind.toUpperCase()} />

      <View style={styles.actions}>
        <Pressable onPress={() => router.back()} style={[styles.actionBtn, styles.secondaryBtn]}>
          <Text style={[styles.actionText, styles.secondaryText]}>Back</Text>
        </Pressable>
        <Pressable onPress={onShare} style={[styles.actionBtn, styles.primaryBtn]} disabled={sharing}>
          {sharing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.actionText, styles.primaryText]}>Share / Download</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.viewer}>
        {meta.kind === 'image' ? (
          <Image source={{ uri: meta.url }} style={styles.image} resizeMode="contain" />
        ) : (
          <WebView
            source={{ uri: viewerUrl }}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={theme.colors.blue} />
                <Text style={styles.subtitle}>Loading preview…</Text>
              </View>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing(2),
    paddingHorizontal: theme.spacing(3),
    paddingVertical: theme.spacing(2),
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  actionBtn: {
    flex: 1,
    paddingVertical: theme.spacing(2),
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: { backgroundColor: theme.colors.blue },
  secondaryBtn: { backgroundColor: '#f3f4f6' },
  actionText: { ...typography.button, fontSize: 14 },
  primaryText: { color: colors.white },
  secondaryText: { color: colors.text },
  viewer: { flex: 1, backgroundColor: colors.surfaceMuted },
  image: { flex: 1, width: '100%', height: '100%' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing(4) },
  subtitle: { ...typography.body, color: colors.textMuted },
});

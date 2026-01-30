import React, { useEffect, useMemo, useState } from 'react';
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
import { buildDocumentPreview } from '../../src/lib/documentPreview';
import { fetchRemoteDocumentPreview } from '../../src/lib/documentPreviewRemote';

export default function AttachmentViewerScreen() {
  const params = useLocalSearchParams<{ url?: string; type?: string; name?: string; kind?: string; messageId?: string }>();
  const [sharing, setSharing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

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

  const messageKind = typeof params.kind === 'string' ? params.kind : '';
  const messageId = typeof params.messageId === 'string' ? params.messageId : '';

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!meta) return;

      // Only build previews for certain document types.
      if (meta.kind !== 'excel' && meta.kind !== 'csv') {
        setPreviewHtml(null);
        setPreviewError(null);
        setPreviewLoading(false);
        return;
      }

      try {
        setPreviewLoading(true);
        setPreviewError(null);
        setPreviewHtml(null);

        // Prefer server-side preview when we have a message reference.
        if ((meta.kind === 'excel' || meta.kind === 'csv') && messageKind && messageId) {
          const remote = await fetchRemoteDocumentPreview({
            kind: messageKind === 'direct_message' ? 'direct_message' : 'submission_message',
            id: messageId,
            max_rows: 60,
            max_cols: 20,
          });
          if (!cancelled) {
            setPreviewHtml(remote.html);
          }
          return;
        }

        // Fallback: on-device preview.
        const res = await buildDocumentPreview(meta);
        if (!cancelled) {
          setPreviewHtml(res.html);
        }
      } catch (err: any) {
        if (!cancelled) {
          setPreviewError(err?.message || 'Unable to preview this document.');
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [meta?.url, meta?.kind, meta?.name, messageKind, messageId]);

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
        ) : meta.kind === 'pdf' ? (
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
        ) : meta.kind === 'excel' || meta.kind === 'csv' ? (
          previewLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={theme.colors.blue} />
              <Text style={styles.subtitle}>Building preview…</Text>
            </View>
          ) : previewHtml ? (
            <WebView originWhitelist={['*']} source={{ html: previewHtml }} />
          ) : (
            <View style={styles.center}>
              <Text style={styles.noPreviewTitle}>Preview unavailable</Text>
              <Text style={styles.subtitle}>{previewError || 'Use Share / Download to open it in another app.'}</Text>
            </View>
          )
        ) : (
          <View style={styles.center}>
            <Text style={styles.noPreviewTitle}>No in-app preview for {meta.kind.toUpperCase()}</Text>
            <Text style={styles.subtitle}>Use Share / Download to open it in another app.</Text>
          </View>
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
  subtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  noPreviewTitle: { ...typography.body, fontWeight: '800', color: colors.text, marginBottom: theme.spacing(1), textAlign: 'center' },
});

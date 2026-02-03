import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, StyleSheet, SafeAreaView, Image, ActivityIndicator, Keyboard } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../../../src/hooks/useAuth';
import { supabase } from '../../../src/lib/supabase';
import { colors, theme, typography } from '../../../src/theme';
import LogoHeader from '../../../src/components/LogoHeader';
import ChatComposer from '../../../src/components/ChatComposer';
import { DirectMessage, fetchDirectMessages, sendDirectMessage, subscribeToDirectMessages } from '../../../src/lib/directMessages';
import { getSignedStorageUrl, uploadFileToStorage } from '../../../src/lib/supabaseHelpers';
import { generateUuid } from '../../../src/lib/uuid';
import { useUISettings } from '../../../src/lib/uiSettings';
import { formatChatDayDivider, formatChatTime, isSameDay } from '../../../src/lib/chatDateTime';

export default function DirectConversation() {
  const params = useLocalSearchParams<{ id: string; team?: string }>();
  const peerId = params.id;
  const { session, ready } = useAuth();
  const insets = useSafeAreaInsets();
  const { fontScale } = useUISettings();

  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const [teamId, setTeamId] = useState<string | null>(params.team ?? null);
  const [teamName, setTeamName] = useState('Team');
  const [peerName, setPeerName] = useState('Teammate');
  const [peerAvatarUrl, setPeerAvatarUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [pickerBusy, setPickerBusy] = useState(false);

  const flatListRef = useRef<FlatList<DirectMessage>>(null);
  const subscriptionRef = useRef<any>(null);

  const bootstrap = useCallback(async () => {
    if (!session?.user || !peerId) return;
    try {
      setLoading(true);
      let activeTeam = teamId;
      if (!activeTeam) {
        const { data, error } = await supabase
          .from('team_members')
          .select('team_id, teams(name)')
          .eq('user_id', session.user.id)
          .limit(1)
          .single();
        if (error) throw error;
        activeTeam = data?.team_id ?? null;
        setTeamName(data?.teams?.name || 'Team');
      } else {
        const { data } = await supabase
          .from('teams')
          .select('name')
          .eq('id', activeTeam)
          .maybeSingle();
        if (data?.name) setTeamName(data.name);
      }
      if (!activeTeam) {
        setTeamId(null);
        setMessages([]);
        return;
      }
      setTeamId(activeTeam);
      const { data: roster } = await supabase.rpc('team_users_with_names', { p_team_id: activeTeam });
      const peer = (roster as any[])?.find((row) => row.user_id === peerId);
      if (peer?.display_name || peer?.email) {
        setPeerName(peer.display_name || peer.email);
      }

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('avatar_path')
          .eq('id', peerId)
          .maybeSingle();
        if (profile?.avatar_path) {
          const signed = await getSignedStorageUrl('avatars', profile.avatar_path, 60 * 60 * 4);
          setPeerAvatarUrl(signed);
        } else {
          setPeerAvatarUrl(null);
        }
      } catch {
        setPeerAvatarUrl(null);
      }
      const history = await fetchDirectMessages(activeTeam, peerId, session.user.id);
      setMessages(history);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);

      if (subscriptionRef.current) subscriptionRef.current.unsubscribe();
      subscriptionRef.current = subscribeToDirectMessages(activeTeam, session.user.id, peerId, (payload) => {
        setMessages((prev) => {
          if (payload.eventType === 'INSERT' && payload.new) {
            if (prev.some((m) => m.id === payload.new!.id)) return prev;
            return [...prev, payload.new];
          }
          if (payload.eventType === 'DELETE' && payload.old) {
            return prev.filter((msg) => msg.id !== payload.old!.id);
          }
          if (payload.eventType === 'UPDATE' && payload.new) {
            return prev.map((msg) => (msg.id === payload.new!.id ? payload.new! : msg));
          }
          return prev;
        });
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      });
    } catch (error) {
      console.error('dm bootstrap failed', error);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, peerId, teamId]);

  useEffect(() => {
    if (!ready || !session?.user || !peerId) return;
    bootstrap();
    return () => {
      subscriptionRef.current?.unsubscribe?.();
    };
  }, [ready, session?.user?.id, peerId]);

  const sendMessageNow = async () => {
    if (!teamId || !peerId || !session?.user) return;
    const trimmed = newMessage.trim();
    if (!trimmed || sending) return;

    const messageId = generateUuid();
    const optimistic: DirectMessage = {
      id: messageId,
      created_at: new Date().toISOString(),
      team_id: teamId,
      sender_id: session.user.id,
      recipient_id: peerId,
      body: trimmed,
      attachment_url: null,
      attachment_type: null,
      attachment_signed_url: null,
    };

    setMessages((prev) => [...prev, optimistic]);
    setNewMessage('');
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      setSending(true);
      const result = await sendDirectMessage({
        id: messageId,
        teamId,
        recipientId: peerId,
        body: trimmed,
      });
      if (!result.success) throw new Error(result.error || 'Failed to send');
    } catch (error: any) {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      Alert.alert('Message failed', error?.message || 'Unable to send message');
    } finally {
      setSending(false);
    }
  };

  const handleAttachPhoto = async () => {
    if (!teamId || uploadingImage || pickerBusy) return;
    try {
      setPickerBusy(true);
      setUploadingImage(true);
      const permissions = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permissions.status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow photo access to share images.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const messageId = generateUuid();
      const safeExt = (asset.fileName?.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
      const safeName = (asset.fileName || `dm-photo-${Date.now()}.${safeExt}`).replace(/[^a-z0-9_.-]/gi, '-');
      const storagePath = `teams/${teamId}/messages/${messageId}/${safeName}`;
      const uploaded = await uploadFileToStorage({
        bucket: 'chat',
        path: storagePath,
        photo: {
          uri: asset.uri,
          fileName: safeName,
          mimeType: asset.mimeType || 'image/jpeg',
          assetId: asset.assetId ?? null,
        },
      });
      const body = newMessage.trim() || 'Shared a photo';
      const resultSend = await sendDirectMessage({
        id: messageId,
        teamId,
        recipientId: peerId,
        body,
        attachmentPath: uploaded.path,
        attachmentType: 'image',
      });
      if (!resultSend.success) throw new Error(resultSend.error || 'Unable to send photo');
      setNewMessage('');
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (error: any) {
      Alert.alert('Upload failed', error?.message || 'Could not share photo');
    } finally {
      setUploadingImage(false);
      setPickerBusy(false);
    }
  };

  const handleAttachFile = async () => {
    if (!teamId || uploadingFile || pickerBusy || !peerId) return;
    try {
      setPickerBusy(true);
      setUploadingFile(true);
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: '*/*',
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const name = a.name || `attachment-${Date.now()}`;
      const lower = name.toLowerCase();

      const attachmentType: any =
        (a.mimeType || '').startsWith('image/') ? 'image' :
        lower.endsWith('.pdf') ? 'pdf' :
        lower.endsWith('.csv') ? 'csv' :
        lower.endsWith('.xlsx') || lower.endsWith('.xls') ? 'excel' :
        lower.endsWith('.docx') || lower.endsWith('.doc') ? 'word' :
        lower.endsWith('.pptx') || lower.endsWith('.ppt') ? 'powerpoint' :
        'file';

      const messageId = generateUuid();
      const safeName = name.replace(/[^a-z0-9_.-]/gi, '-');
      const storagePath = `teams/${teamId}/direct/${messageId}/${Date.now()}-${safeName}`;

      const uploaded = await uploadFileToStorage({
        bucket: 'chat',
        path: storagePath,
        photo: {
          uri: a.uri,
          fileName: safeName,
          mimeType: a.mimeType || undefined,
        },
      });

      const body = newMessage.trim() || (attachmentType === 'image' ? 'Shared a photo' : 'Shared a file');
      const resultSend = await sendDirectMessage({
        id: messageId,
        teamId,
        recipientId: peerId,
        body,
        attachmentPath: uploaded.path,
        attachmentType,
      });
      if (!resultSend.success) throw new Error(resultSend.error || 'Unable to send attachment');
      setNewMessage('');
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (error: any) {
      const msg = String(error?.message || '');
      if (!msg.includes('Different document picking in progress')) {
        Alert.alert('Upload failed', error?.message || 'Could not share attachment');
      }
    } finally {
      setUploadingFile(false);
      setPickerBusy(false);
    }
  };

  const initials = (name: string) =>
    (name || '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') || 'U';

  type ChatListItem =
    | { kind: 'divider'; id: string; label: string }
    | { kind: 'message'; id: string; msg: DirectMessage };

  const listItems: ChatListItem[] = useMemo(() => {
    const out: ChatListItem[] = [];
    let prev: DirectMessage | null = null;
    for (const msg of messages) {
      if (!prev || !isSameDay(prev.created_at, msg.created_at)) {
        out.push({ kind: 'divider', id: `d:${msg.created_at}`, label: formatChatDayDivider(msg.created_at) });
      }
      out.push({ kind: 'message', id: msg.id, msg });
      prev = msg;
    }
    return out;
  }, [messages]);

  const renderMessage = ({ item }: { item: DirectMessage }) => {
    const isMe = item.sender_id === session?.user?.id;

    const bubble = (
      <View style={[styles.messageBubble, isMe ? styles.messageMine : styles.messageTheirs]}>
        <Text
          style={[
            styles.messageAuthor,
            { color: isMe ? colors.white : colors.text, fontSize: Math.round(12 * fontScale) },
          ]}
        >
          {isMe ? 'You' : peerName}
        </Text>
        <Text
          style={[
            styles.messageBody,
            { color: isMe ? colors.white : colors.text, fontSize: Math.round(15 * fontScale) },
          ]}
        >
          {item.body}
        </Text>
        {item.attachment_type && (item.attachment_signed_url || item.attachment_url) ? (
          item.attachment_type === 'image' ? (
            <TouchableOpacity
              style={styles.attachmentPreview}
              onPress={() => {
                const url = (item.attachment_signed_url || item.attachment_url)!;
                router.push({
                  pathname: '/chat/attachment',
                  params: {
                    url,
                    type: 'image',
                    name: url.split('/').pop() || 'image',
                    kind: 'direct_message',
                    messageId: item.id,
                  },
                });
              }}
            >
              <Image
                source={{ uri: item.attachment_signed_url || item.attachment_url || undefined }}
                style={styles.attachmentImage}
              />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.attachmentFileRow}
              onPress={() => {
                const url = (item.attachment_signed_url || item.attachment_url)!;
                router.push({
                  pathname: '/chat/attachment',
                  params: {
                    url,
                    type: item.attachment_type,
                    name: url.split('/').pop() || `attachment.${item.attachment_type}`,
                    kind: 'direct_message',
                    messageId: item.id,
                  },
                });
              }}
            >
              <Text style={[styles.attachmentFileIcon, { color: isMe ? '#e0f2fe' : theme.colors.blue }]}>📎</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.attachmentFileTitle, { color: isMe ? colors.white : colors.text }]} numberOfLines={1}>
                  {((item.attachment_url || item.attachment_signed_url || '')
                    .split('?')[0]
                    .split('/')
                    .filter(Boolean)
                    .pop()) || 'attachment'}
                </Text>
                <Text style={[styles.attachmentFileSub, { color: isMe ? '#e0f2fe' : '#64748b' }]}>
                  {String(item.attachment_type || 'file').toUpperCase()}  Tap to open
                </Text>
              </View>
            </TouchableOpacity>
          )
        ) : null}
        <Text style={[styles.timestamp, { color: isMe ? '#e0f2fe' : '#94a3b8' }]}>
          {formatChatTime(item.created_at)}
        </Text>
      </View>
    );

    if (isMe) return bubble;

    return (
      <View style={styles.messageRow}>
        <View style={styles.avatarCircle}>
          {peerAvatarUrl ? (
            <Image source={{ uri: peerAvatarUrl }} style={styles.avatarImage} />
          ) : (
            <Text style={[styles.avatarText, { fontSize: Math.round(12 * fontScale) }]}>
              {initials(peerName)}
            </Text>
          )}
        </View>
        {bubble}
      </View>
    );
  };

  if (!ready || !peerId) {
    return (
      <SafeAreaView style={styles.safe}>
        <LogoHeader title="Direct Message" />
        <View style={styles.center}> 
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  if (!session?.user) {
    return (
      <SafeAreaView style={styles.safe}>
        <LogoHeader title="Direct Message" />
        <View style={styles.center}>
          <Text>Please sign in.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!teamId) {
    return (
      <SafeAreaView style={styles.safe}>
        <LogoHeader title="Direct Message" />
        <View style={styles.center}>
          <Text style={styles.subtitle}>Join a team to message teammates.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <LogoHeader title={peerName} subtitle={`Direct • ${teamName}`} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={styles.container}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={theme.colors.blue} />
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={listItems}
              renderItem={({ item }) => {
                if (item.kind === 'divider') {
                  return (
                    <View style={styles.dayDivider}>
                      <Text style={[styles.dayDividerText, { fontSize: Math.round(12 * fontScale) }]}>{item.label}</Text>
                    </View>
                  );
                }
                return renderMessage({ item: item.msg });
              }}
              keyExtractor={(item) => item.id}
              contentContainerStyle={[
                styles.listContent,
                {
                  paddingBottom: theme.spacing(4) + (keyboardVisible ? theme.spacing(1) : insets.bottom),
                },
              ]}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            />
          )}

          <View
            style={[
              styles.composer,
              { paddingBottom: keyboardVisible ? theme.spacing(1) : Math.max(insets.bottom, theme.spacing(1)) },
            ]}
          >
            <ChatComposer
              value={newMessage}
              onChangeText={setNewMessage}
              placeholder="Message"
              fontScale={fontScale}
              disabled={sending || uploadingImage || uploadingFile || pickerBusy}
              canSend={!!newMessage.trim()}
              sending={sending || uploadingImage || uploadingFile}
              onSend={sendMessageNow}
              onPickPhoto={handleAttachPhoto}
              onPickFile={handleAttachFile}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing(4),
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: theme.spacing(3),
    paddingTop: theme.spacing(4),
    gap: theme.spacing(2),
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing(2),
  },
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#e2e8f0',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 34,
    height: 34,
  },
  avatarText: {
    ...typography.label,
    fontWeight: '800',
    color: '#0f172a',
  },
  messageBubble: {
    borderRadius: theme.radius.lg,
    padding: theme.spacing(3),
    maxWidth: '85%',
  },
  messageMine: {
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.blue,
    marginLeft: theme.spacing(6),
  },
  messageTheirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    marginRight: theme.spacing(6),
  },
  messageAuthor: {
    ...typography.label,
    fontWeight: '700',
    marginBottom: theme.spacing(1),
  },
  messageBody: {
    ...typography.body,
    fontSize: 15,
  },
  timestamp: {
    ...typography.label,
    fontSize: 11,
    marginTop: theme.spacing(1),
  },
  attachmentPreview: {
    marginTop: theme.spacing(1),
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  attachmentImage: {
    width: 220,
    height: 150,
  },
  attachmentFileRow: {
    marginTop: theme.spacing(2),
    padding: theme.spacing(2),
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: 'rgba(255,255,255,0.75)',
    flexDirection: 'row',
    gap: theme.spacing(2),
    alignItems: 'center',
  },
  attachmentFileIcon: { fontSize: 20 },
  attachmentFileTitle: { ...typography.body, fontWeight: '800' },
  attachmentFileSub: { ...typography.label },
  dayDivider: {
    alignItems: 'center',
    marginVertical: theme.spacing(2),
  },
  dayDividerText: {
    ...typography.label,
    color: '#64748b',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  composer: {
    backgroundColor: colors.white,
    paddingHorizontal: theme.spacing(2),
    paddingTop: theme.spacing(1),
  },
});

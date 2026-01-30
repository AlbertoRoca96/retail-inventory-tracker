import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, StyleSheet, SafeAreaView, Image, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../../../src/hooks/useAuth';
import { supabase } from '../../../src/lib/supabase';
import { colors, theme, typography } from '../../../src/theme';
import LogoHeader from '../../../src/components/LogoHeader';
import { DirectMessage, fetchDirectMessages, sendDirectMessage, subscribeToDirectMessages } from '../../../src/lib/directMessages';
import { uploadFileToStorage } from '../../../src/lib/supabaseHelpers';
import { generateUuid } from '../../../src/lib/uuid';

export default function DirectConversation() {
  const params = useLocalSearchParams<{ id: string; team?: string }>();
  const peerId = params.id;
  const { session, ready } = useAuth();
  const insets = useSafeAreaInsets();

  const [teamId, setTeamId] = useState<string | null>(params.team ?? null);
  const [teamName, setTeamName] = useState('Team');
  const [peerName, setPeerName] = useState('Teammate');
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

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
      const history = await fetchDirectMessages(activeTeam, peerId, session.user.id);
      setMessages(history);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);

      if (subscriptionRef.current) subscriptionRef.current.unsubscribe();
      subscriptionRef.current = subscribeToDirectMessages(activeTeam, session.user.id, peerId, (payload) => {
        setMessages((prev) => {
          if (payload.eventType === 'INSERT' && payload.new) {
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
    if (!teamId || !peerId) return;
    const trimmed = newMessage.trim();
    if (!trimmed || sending) return;
    try {
      setSending(true);
      const result = await sendDirectMessage({
        teamId,
        recipientId: peerId,
        body: trimmed,
      });
      if (!result.success) throw new Error(result.error || 'Failed to send');
      setNewMessage('');
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (error: any) {
      Alert.alert('Message failed', error?.message || 'Unable to send message');
    } finally {
      setSending(false);
    }
  };

  const handleAttachPhoto = async () => {
    if (!teamId || uploadingImage) return;
    try {
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
    }
  };

  const renderMessage = ({ item }: { item: DirectMessage }) => {
    const isMe = item.sender_id === session?.user?.id;
    return (
      <View style={[styles.messageBubble, isMe ? styles.messageMine : styles.messageTheirs]}>
        <Text style={[styles.messageAuthor, { color: isMe ? colors.white : colors.text }]}>
          {isMe ? 'You' : peerName}
        </Text>
        <Text style={[styles.messageBody, { color: isMe ? colors.white : colors.text }]}>{item.body}</Text>
        {item.attachment_type === 'image' && (item.attachment_signed_url || item.attachment_url) ? (
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
                },
              });
            }}
          >
            <Image
              source={{ uri: item.attachment_signed_url || item.attachment_url || undefined }}
              style={styles.attachmentImage}
            />
          </TouchableOpacity>
        ) : null}
        <Text style={[styles.timestamp, { color: isMe ? '#e0f2fe' : '#94a3b8' }]}>
          {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
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
      <View style={styles.container}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.colors.blue} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listContent, { paddingBottom: theme.spacing(6) + insets.bottom }]}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.composer, { paddingBottom: Math.max(insets.bottom, theme.spacing(1)) }]}
        >
          <View style={styles.composerRow}>
            <TouchableOpacity
              style={styles.attachmentButton}
              onPress={handleAttachPhoto}
              disabled={uploadingImage}
            >
              <Ionicons name="image-outline" size={22} color={uploadingImage ? '#94a3b8' : theme.colors.blue} />
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder="Message"
              placeholderTextColor="#94a3b8"
              multiline
              value={newMessage}
              onChangeText={setNewMessage}
            />
            <TouchableOpacity
              style={[styles.sendButton, { opacity: sending || !newMessage.trim() ? 0.6 : 1 }]}
              onPress={sendMessageNow}
              disabled={sending || uploadingImage || !newMessage.trim()}
            >
              <Text style={styles.sendText}>{sending ? '...' : 'Send'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
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
  composer: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: colors.white,
    paddingHorizontal: theme.spacing(3),
    paddingTop: theme.spacing(2),
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing(2),
  },
  attachmentButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: theme.radius.lg,
    padding: theme.spacing(2),
    backgroundColor: colors.white,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing(3),
    paddingVertical: theme.spacing(2),
    fontSize: 15,
    maxHeight: 120,
    backgroundColor: colors.white,
  },
  sendButton: {
    backgroundColor: theme.colors.blue,
    paddingHorizontal: theme.spacing(4),
    paddingVertical: theme.spacing(2),
    borderRadius: theme.radius.lg,
  },
  sendText: {
    ...typography.button,
    color: colors.white,
  },
});

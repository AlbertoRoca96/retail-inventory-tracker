// apps/mobile/app/chat/team.tsx
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, StyleSheet, SafeAreaView, Image, Keyboard } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/hooks/useAuth';
import { theme, colors, typography } from '../../src/theme';
import { useUISettings } from '../../src/lib/uiSettings';
import Button from '../../src/components/Button';
import LogoHeader from '../../src/components/LogoHeader';
import { sendSubmissionMessage, fetchTeamMessages, subscribeToTeamMessages, resolveAttachmentUrl, type SubmissionMessage } from '../../src/lib/chat';
import { guessFileNameFromUrl } from '../../src/lib/attachmentViewer';
import { uploadFileToStorage, type PhotoLike } from '../../src/lib/supabaseHelpers';
import { generateUuid } from '../../src/lib/uuid';

export default function TeamChat() {
  const { session, ready } = useAuth();
  const { fontScale } = useUISettings();
  const [messages, setMessages] = useState<SubmissionMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<PhotoLike | null>(null);
  const [pendingFile, setPendingFile] = useState<{
    uri: string;
    fileName: string;
    mimeType?: string | null;
    attachmentType: NonNullable<SubmissionMessage['attachment_type']>;
  } | null>(null);
  const [teamInfo, setTeamInfo] = useState<{ id: string; name: string } | null>(null);
  const [roster, setRoster] = useState<Record<string, { name: string; email?: string }>>({});
  
  const flatListRef = useRef<FlatList>(null);
  const subscriptionRef = useRef<any>(null);
  const insets = useSafeAreaInsets();
  // Keep this small: LogoHeader already consumes the top safe area.
  // A large offset creates weird gaps/overlaps depending on device.
  const keyboardOffset = Platform.OS === 'ios' ? 0 : 0;

  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (!ready || !session?.user) return;
    
    loadTeamInfo();
    loadMessages();
    
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
      }
    };
  }, [ready, session]);

  const loadTeamInfo = async () => {
    try {
      const { data } = await supabase
        .from('team_members')
        .select('team_id, teams(name)')
        .eq('user_id', session!.user.id)
        .limit(1)
        .single();
      
      if (data) {
        const info = { id: data.team_id, name: data.teams?.name || 'Unknown Team' };
        setTeamInfo(info);
        loadRoster(info.id);
      }
    } catch (error) {
      console.error('Error loading team info:', error);
    }
  };

  const loadRoster = async (teamId: string) => {
    try {
      const { data, error } = await supabase.rpc('team_users_with_names', { p_team_id: teamId });
      if (error) throw error;
      const next: Record<string, { name: string; email?: string }> = {};
      (data || []).forEach((row: any) => {
        next[row.user_id] = {
          name: row.display_name || row.email || row.user_id,
          email: row.email || undefined,
        };
      });
      setRoster(next);
    } catch (error) {
      console.error('Error loading roster', error);
    }
  };

  const loadMessages = async () => {
    try {
      setLoading(true);
      
      // Get user's team first
      const { data: teamMember } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', session!.user.id)
        .limit(1)
        .single();
      
      if (!teamMember) return;
      
      // Use the new fetchTeamMessages function
      const { messages: teamMessages } = await fetchTeamMessages(teamMember.team_id, {
        limit: 100,
      });
      
      setMessages(teamMessages.reverse());
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!teamInfo) return;

    // Subscribe to real-time updates
    subscriptionRef.current = subscribeToTeamMessages(teamInfo.id, (payload) => {
      if (payload.eventType === 'INSERT' && payload.new?.is_internal) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === payload.new!.id)) return prev;
          return [...prev, payload.new!];
        });
      } else if (payload.eventType === 'UPDATE' && payload.new?.is_internal) {
        setMessages((prev) => prev.map((msg) => (msg.id === payload.new?.id ? payload.new! : msg)));
      } else if (payload.eventType === 'DELETE') {
        setMessages((prev) => prev.filter((msg) => msg.id !== payload.old?.id));
      }
    });

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
      }
    };
  }, [teamInfo]);

  const sendMessage = async () => {
    if (!teamInfo || sending) return;
    const trimmed = newMessage.trim();
    if (!trimmed && !pendingPhoto && !pendingFile) return;

    const pickedPhoto = pendingPhoto;
    const pickedFile = pendingFile;

    const messageId = generateUuid();
    const body = trimmed || (pickedPhoto ? 'Shared a photo' : pickedFile ? 'Shared a file' : '');

    // Optimistic insert so the sender sees it instantly.
    const optimistic: SubmissionMessage = {
      id: messageId,
      created_at: new Date().toISOString(),
      team_id: teamInfo.id,
      submission_id: null,
      sender_id: session!.user.id,
      body,
      is_internal: true,
      attachment_path: pickedPhoto ? pickedPhoto.uri : pickedFile ? pickedFile.fileName : null,
      attachment_type: pickedPhoto ? 'image' : pickedFile ? pickedFile.attachmentType : null,
      attachment_signed_url: pickedPhoto ? pickedPhoto.uri : null,
      is_revised: false,
    };

    setMessages((prev) => [...prev, optimistic]);
    setNewMessage('');
    setPendingPhoto(null);
    setPendingFile(null);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      setSending(true);

      let attachmentPath: string | null = null;
      let attachmentType: SubmissionMessage['attachment_type'] | null = null;
      let attachmentSignedUrl: string | null = null;

      if (pickedPhoto) {
        setUploadingImage(true);
        const safeExt = (pickedPhoto.fileName?.split('.').pop() || 'jpg')
          .replace(/[^a-z0-9]/gi, '')
          .toLowerCase() || 'jpg';
        const safeName = (pickedPhoto.fileName || `team-chat-${Date.now()}.${safeExt}`)
          .replace(/[^a-z0-9_.-]/gi, '-');
        const storagePath = `teams/${teamInfo.id}/messages/${messageId}/${safeName}`;

        const uploaded = await uploadFileToStorage({
          bucket: 'chat',
          path: storagePath,
          photo: pickedPhoto,
        });

        attachmentPath = uploaded.path;
        attachmentSignedUrl = uploaded.publicUrl;
        attachmentType = 'image';
      } else if (pickedFile) {
        setUploadingImage(true);
        const safeName = (pickedFile.fileName || `attachment-${Date.now()}`)
          .replace(/[^a-z0-9_.-]/gi, '-');
        const storagePath = `teams/${teamInfo.id}/messages/${messageId}/${safeName}`;

        const uploaded = await uploadFileToStorage({
          bucket: 'chat',
          path: storagePath,
          photo: {
            uri: pickedFile.uri,
            fileName: safeName,
            mimeType: pickedFile.mimeType || undefined,
          },
        });

        attachmentPath = uploaded.path;
        attachmentSignedUrl = uploaded.publicUrl;
        attachmentType = pickedFile.attachmentType;
      }

      const result = await sendSubmissionMessage({
        id: messageId,
        team_id: teamInfo.id,
        submission_id: null,
        body,
        is_internal: true,
        attachment_path: attachmentPath ?? undefined,
        attachment_type: attachmentType ?? undefined,
      });

      if (!result.success || !result.message) {
        throw new Error(result.error || 'Failed to send message');
      }

      // Reconcile optimistic with server row (correct created_at, attachment path, etc.)
      const serverMsg: SubmissionMessage = {
        ...result.message,
        attachment_signed_url: attachmentSignedUrl ?? (result.message as any).attachment_signed_url ?? null,
      };

      setMessages((prev) => prev.map((m) => (m.id === messageId ? serverMsg : m)));
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (error) {
      // Remove optimistic bubble if the send failed.
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to send message');
    } finally {
      setSending(false);
      setUploadingImage(false);
    }
  };

  const handleAttachPhoto = async () => {
    if (!teamInfo || uploadingImage) return;
    try {
      setUploadingImage(true);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission needed', 'Enable photo permissions to share images.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        quality: 0.85,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setPendingPhoto({
        uri: asset.uri,
        fileName: asset.fileName || `team-chat-${Date.now()}.jpg`,
        mimeType: asset.mimeType || 'image/jpeg',
        assetId: asset.assetId ?? null,
      });
    } catch (error: any) {
      Alert.alert('Photo selection failed', error?.message || 'Unable to select a photo right now.');
    } finally {
      setUploadingImage(false);
    }
  };

  const openAttachment = async (item: SubmissionMessage) => {
    const url = await resolveAttachmentUrl(item.attachment_signed_url || item.attachment_path, item.attachment_type);
    if (!url) {
      Alert.alert('Attachment unavailable', 'Unable to open this attachment.');
      return;
    }

    const nameFromPath = (item.attachment_path || '').split('/').pop() || '';
    const name = nameFromPath || guessFileNameFromUrl(url);

    router.push({
      pathname: '/chat/attachment',
      params: {
        url,
        type: item.attachment_type || 'file',
        name,
        kind: 'submission_message',
        messageId: item.id,
      },
    });
  };

  const renderMessage = ({ item, index }: { item: SubmissionMessage; index: number }) => {
    const isMe = item.sender_id === session?.user?.id;
    const senderSummary = isMe ? 'You' : roster[item.sender_id || '']?.name || item.sender_id?.slice(0, 8) || 'Team Member';
    
    return (
      <View style={[
        styles.messageContainer,
        isMe ? styles.myMessage : styles.otherMessage,
      ]}>
        <View style={styles.messageHeader}>
          <Text style={[styles.senderName, { fontSize: Math.round(12 * fontScale) }]}>
            {senderSummary}
          </Text>
          <Text style={[styles.messageTime, { fontSize: Math.round(11 * fontScale) }]}>
            {new Date(item.created_at).toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </Text>
        </View>
        <Text style={[styles.messageBody, { fontSize: Math.round(14 * fontScale), lineHeight: Math.round(18 * fontScale) }]}>{item.body}</Text>
        {item.attachment_type && (item.attachment_signed_url || item.attachment_path) ? (
          item.attachment_type === 'image' ? (
            <TouchableOpacity
              style={styles.imageAttachment}
              onPress={() => openAttachment(item)}
            >
              <Image
                source={{ uri: item.attachment_signed_url || item.attachment_path || undefined }}
                style={styles.chatImage}
              />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.attachmentInfo}
              onPress={() => openAttachment(item)}
            >
              <Text style={styles.attachmentText}>
                📎 {item.attachment_type.toUpperCase()} attachment
              </Text>
            </TouchableOpacity>
          )
        ) : null}
        {item.is_revised && (
          <Text style={styles.revisedIndicator}>(revised)</Text>
        )}
      </View>
    );
  };
  if (!ready) {
    return (
      <SafeAreaView style={styles.safe}>
        <LogoHeader title="Team Chat" />
        <View style={styles.centerContainer}>
          <Text style={styles.subtitle}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session?.user) {
    return (
      <SafeAreaView style={styles.safe}>
        <LogoHeader title="Team Chat" />
        <View style={styles.centerContainer}>
          <Text style={styles.subtitle}>Please sign in to access team chat.</Text>
          <View style={styles.buttonContainer}>
            <Button 
              title="Sign In"
              onPress={() => router.replace('/login')}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <LogoHeader title="Team Chat" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={keyboardOffset}
      >
        <View style={styles.container}>
          {loading ? (
            <View style={styles.centerContainer}>
              <Text style={styles.subtitle}>Loading messages...</Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderMessage}
              keyExtractor={(item) => item.id}
              style={styles.messagesList}
              contentContainerStyle={[
                styles.messagesListContent,
                {
                  paddingBottom: theme.spacing(4) + (keyboardVisible ? theme.spacing(1) : insets.bottom),
                },
              ]}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => {
                flatListRef.current?.scrollToEnd({ animated: false });
              }}
            />
          )}

          <View
            style={[
              styles.inputContainer,
              { paddingBottom: keyboardVisible ? theme.spacing(1) : Math.max(insets.bottom, theme.spacing(1)) },
            ]}
          >
            {pendingPhoto || pendingFile ? (
              <View style={styles.pendingAttachment}>
                {pendingPhoto ? (
                  <Image source={{ uri: pendingPhoto.uri }} style={styles.pendingAttachmentImage} />
                ) : (
                  <View style={[styles.pendingAttachmentImage, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' }]}>
                    <Ionicons name="document-text-outline" size={22} color="#475569" />
                  </View>
                )}
                <View style={styles.pendingMeta}>
                  <Text style={styles.pendingLabel} numberOfLines={1}>
                    {pendingPhoto ? 'Photo attached' : pendingFile ? pendingFile.fileName : 'Attachment'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setPendingPhoto(null);
                      setPendingFile(null);
                    }}
                    accessibilityLabel="Remove attached photo"
                    style={styles.removeAttachmentButton}
                  >
                    <Ionicons name="close" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
            <View style={styles.inputRow}>
              <TouchableOpacity
                style={styles.attachmentButton}
                onPress={handleAttachPhoto}
                disabled={uploadingImage}
                accessibilityLabel="Attach photo"
              >
                <Ionicons name="image-outline" size={22} color={uploadingImage ? '#94a3b8' : theme.colors.blue} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.attachmentButton}
                onPress={async () => {
                  if (!teamInfo || uploadingImage) return;
                  try {
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
                      lower.endsWith('.pdf') ? 'pdf' :
                      lower.endsWith('.csv') ? 'csv' :
                      lower.endsWith('.xlsx') ? 'excel' :
                      (a.mimeType || '').startsWith('image/') ? 'image' :
                      null;
                    if (!attachmentType) {
                      Alert.alert('Unsupported file', 'Please choose a PDF, CSV, XLSX, or image.');
                      return;
                    }
                    if (attachmentType === 'image') {
                      setPendingPhoto({ uri: a.uri, fileName: name, mimeType: a.mimeType || 'image/jpeg' });
                      setPendingFile(null);
                      return;
                    }
                    setPendingFile({
                      uri: a.uri,
                      fileName: name,
                      mimeType: a.mimeType || undefined,
                      attachmentType,
                    });
                    setPendingPhoto(null);
                  } catch (err: any) {
                    Alert.alert('Attach failed', err?.message || 'Unable to pick a file.');
                  }
                }}
                disabled={uploadingImage}
                accessibilityLabel="Attach file"
              >
                <Ionicons name="attach-outline" size={22} color={uploadingImage ? '#94a3b8' : theme.colors.blue} />
              </TouchableOpacity>
              <TextInput
                style={[styles.textInput, { fontSize: Math.round(15 * fontScale) }]}
                value={newMessage}
                onChangeText={setNewMessage}
                placeholder="Type a message..."
                placeholderTextColor="#9CA3AF"
                multiline
                maxLength={1000}
                editable={!sending}
                accessibilityLabel="Message input"
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  { opacity: sending || uploadingImage || (!newMessage.trim() && !pendingPhoto && !pendingFile) ? 0.5 : 1 }
                ]}
                onPress={sendMessage}
                disabled={sending || uploadingImage || (!newMessage.trim() && !pendingPhoto && !pendingFile)}
                accessibilityLabel="Send message"
              >
                <Text style={styles.sendButtonText}>
                  {sending ? '...' : uploadingImage ? 'Upload…' : 'Send'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing(4),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: theme.spacing(6),
    paddingHorizontal: theme.spacing(4),
    paddingBottom: theme.spacing(2),
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    marginRight: theme.spacing(3),
  },
  backButtonText: {
    ...typography.body,
    color: theme.colors.blue,
    fontWeight: '600',
  },
  headerContent: {
    flex: 1,
  },
  title: {
    ...typography.title,
    fontSize: 20,
    marginBottom: theme.spacing(0.5),
  },
  subtitle: {
    ...typography.label,
    color: '#6b7280',
  },
  buttonContainer: {
    marginTop: theme.spacing(4),
  },
  messagesList: {
    flex: 1,
  },
  messagesListContent: {
    padding: theme.spacing(4),
    gap: theme.spacing(3),
  },
  messageContainer: {
    maxWidth: '80%',
    borderRadius: theme.radius.lg,
    padding: theme.spacing(3),
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.blue,
    marginLeft: theme.spacing(10),
  },
  otherMessage: {
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    marginRight: theme.spacing(10),
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(1),
  },
  senderName: {
    ...typography.label,
    fontWeight: '600',
    fontSize: 12,
    color: theme.colors.text,
  },
  messageTime: {
    ...typography.label,
    fontSize: 11,
    color: '#6b7280',
  },
  messageBody: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 18,
    color: theme.colors.text,
  },
  attachmentInfo: {
    marginTop: theme.spacing(1),
  },
  attachmentText: {
    ...typography.label,
    fontSize: 12,
    color: '#6b7280',
  },
  revisedIndicator: {
    ...typography.label,
    fontSize: 11,
    color: theme.colors.blue,
    fontStyle: 'italic',
    marginTop: theme.spacing(1),
  },
  inputContainer: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingHorizontal: theme.spacing(4),
    paddingVertical: theme.spacing(2),
  },
  pendingAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: theme.radius.md,
    padding: theme.spacing(2),
    backgroundColor: colors.white,
    marginBottom: theme.spacing(2),
  },
  pendingAttachmentImage: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
    marginRight: theme.spacing(2),
  },
  pendingMeta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pendingLabel: {
    ...typography.label,
    color: colors.text,
    fontWeight: '600',
  },
  removeAttachmentButton: {
    backgroundColor: '#ef4444',
    borderRadius: 999,
    padding: 6,
    marginLeft: theme.spacing(2),
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing(2),
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing(3),
    paddingVertical: theme.spacing(2),
    fontSize: 16,
    maxHeight: 110,
    minHeight: 48,
    backgroundColor: colors.white,
  },
  sendButton: {
    backgroundColor: theme.colors.blue,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing(4),
    paddingVertical: theme.spacing(2),
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 60,
  },
  attachmentButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: theme.radius.lg,
    padding: theme.spacing(2),
    backgroundColor: colors.white,
  },
  imageAttachment: {
    marginTop: theme.spacing(1),
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  chatImage: {
    width: 220,
    height: 150,
    borderRadius: theme.radius.md,
  },
  sendButtonText: {
    ...typography.button,
    color: colors.white,
    fontSize: 14,
  },
});
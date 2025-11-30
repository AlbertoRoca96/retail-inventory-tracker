// apps/mobile/app/chat/[id].tsx
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { theme, colors, typography } from '../../src/theme';
import Button from '../../src/components/Button';
import Input from '../../src/components/Input';
import { fetchSubmissionMessages, sendSubmissionMessage, sendCsvAttachmentMessage, subscribeToSubmissionMessages, type SubmissionMessage } from '../../src/lib/chat';

export default function SubmissionChat() {
  const { id: submissionId } = useLocalSearchParams<{ id: string }>();
  const { session, ready } = useAuth();
  const [messages, setMessages] = useState<SubmissionMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [submissionInfo, setSubmissionInfo] = useState<any>(null);
  const [teamInfo, setTeamInfo] = useState<{ id: string; name: string } | null>(null);
  
  const flatListRef = useRef<FlatList>(null);
  const subscriptionRef = useRef<any>(null);

  useEffect(() => {
    if (!ready || !session?.user || !submissionId) return;
    
    loadSubmissionInfo();
    loadMessages();
    
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
      }
    };
  }, [ready, session, submissionId]);

  const loadSubmissionInfo = async () => {
    try {
      const { data } = await supabase
        .from('submissions')
        .select(`
          id,
          date,
          store_location,
          store_site,
          brand,
          teams!inner(name)
        `)
        .eq('id', submissionId)
        .single();
      
      if (data) {
        setSubmissionInfo(data);
        setTeamInfo({ id: data.teams?.id || '', name: data.teams?.name || 'Unknown Team' });
      }
    } catch (error) {
      console.error('Error loading submission info:', error);
    }
  };

  const loadMessages = async () => {
    try {
      setLoading(true);
      
      const { messages: submissionMessages } = await fetchSubmissionMessages(submissionId!, {
        limit: 100,
      });
      
      setMessages(submissionMessages.reverse());
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!submissionId) return;

    // Subscribe to real-time updates
    subscriptionRef.current = subscribeToSubmissionMessages(submissionId, (payload) => {
      if (payload.eventType === 'INSERT') {
        setMessages(prev => [...prev, payload.new!]);
        // Scroll to bottom when new message arrives
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      } else if (payload.eventType === 'UPDATE') {
        setMessages(prev => 
          prev.map(msg => msg.id === payload.new?.id ? payload.new! : msg)
        );
      } else if (payload.eventType === 'DELETE') {
        setMessages(prev => prev.filter(msg => msg.id !== payload.old?.id));
      }
    });

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
      }
    };
  }, [submissionId]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !teamInfo || sending) return;

    try {
      setSending(true);
      
      const result = await sendSubmissionMessage({
        team_id: teamInfo.id,
        submission_id: submissionId,
        body: newMessage.trim(),
        is_internal: false, // This is submission chat
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to send message');
      }
      
      setNewMessage('');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleCsvUpload = async () => {
    // For now, show a placeholder alert
    Alert.alert('CSV Upload', 'CSV upload functionality will be implemented with file picker integration.');
    
    // In a real implementation, you would:
    // 1. Launch file picker to select CSV
    // 2. Send to sendCsvAttachmentMessage
    // 3. Show upload progress
  };

  const renderMessage = ({ item, index }: { item: SubmissionMessage; index: number }) => {
    const isMe = item.sender_id === session?.user?.id;
    
    return (
      <View style={[
        styles.messageContainer,
        isMe ? styles.myMessage : styles.otherMessage,
      ]}>
        <View style={styles.messageHeader}>
          <Text style={styles.senderName}>
            {isMe ? 'You' : item.sender_name || 'Team Member'}
          </Text>
          <Text style={styles.messageTime}>
            {new Date(item.created_at).toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </Text>
        </View>
        <Text style={styles.messageBody}>{item.body}</Text>
        
        {/* Attachment Display */}
        {item.attachment_path && (
          <TouchableOpacity 
            style={styles.attachmentBtn}
            onPress={() => {
              if (item.attachment_type === 'csv') {
                Alert.alert('CSV Attachment', `Download CSV: ${item.attachment_path}`);
                // In real app, handle CSV download/viewing
              }
            }}
          >
            <Text style={styles.attachmentText}>
              📎 {item.attachment_type?.toUpperCase()}.{item.attachment_path?.split('.').pop()}
            </Text>
          </TouchableOpacity>
        )}
        
        {item.is_revised && (
          <Text style={styles.revisedIndicator}>(revised)</Text>
        )}
      </View>
    );
  };

  if (!ready) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.blue} />
      </View>
    );
  }

  if (!session?.user) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.title}>Submission Chat</Text>
        <Text style={styles.subtitle}>Please sign in to access submission chat.</Text>
        <View style={styles.buttonContainer}>
          <Button 
            title="Sign In"
            onPress={() => router.replace('/login')}
          />
        </View>
      </View>
    );
  }

  if (loading && messages.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.title}>Loading...</Text>
          </View>
        </View>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.blue} />
          <Text style={styles.subtitle}>Loading submission and messages...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.title} numberOfLines={1}>
            {submissionInfo?.store_location || 'Submission'}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {submissionInfo?.date} • {teamInfo?.name || 'Team'}
          </Text>
        </View>
      </View>

      <View style={styles.submissionInfo}>
        <Text style={styles.submissionTitle}>{submissionInfo?.store_location || 'Submission'}</Text>
        <Text style={styles.submissionDetails}>
          {submissionInfo?.brand && `${submissionInfo.brand} •`} 
          {submissionInfo?.date}
        </Text>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        style={styles.messagesList}
        contentContainerStyle={styles.messagesListContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySubtext}>Start the conversation about this submission</Text>
          </View>
        }
      />

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inputContainer}
      >
        <View style={styles.inputRow}>
          <TouchableOpacity
            style={styles.attachmentButton}
            onPress={handleCsvUpload}
            accessibilityLabel="Upload CSV attachment"
          >
            <Text style={styles.attachmentButtonText}>📎</Text>
          </TouchableOpacity>
          
          <TextInput
            style={styles.textInput}
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder="Type a message about this submission..."
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={1000}
            editable={!sending}
            accessibilityLabel="Message input"
          />
          
          <TouchableOpacity
            style={[
              styles.sendButton,
              { opacity: sending || !newMessage.trim() ? 0.5 : 1 }
            ]}
            onPress={sendMessage}
            disabled={sending || !newMessage.trim()}
            accessibilityLabel="Send message"
          >
            <Text style={styles.sendButtonText}>
              {sending ? '...' : 'Send'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray,
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
  submissionInfo: {
    backgroundColor: colors.white,
    paddingHorizontal: theme.spacing(4),
    paddingVertical: theme.spacing(3),
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  submissionTitle: {
    ...typography.title,
    fontSize: 18,
    color: theme.colors.text,
    marginBottom: theme.spacing(1),
  },
  submissionDetails: {
    ...typography.body,
    color: '#6b7280',
    fontSize: 14,
  },
  messagesList: {
    flex: 1,
  },
  messagesListContent: {
    padding: theme.spacing(4),
    gap: theme.spacing(3),
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing(8),
  },
  emptyText: {
    ...typography.title,
    fontSize: 18,
    color: theme.colors.text,
    marginBottom: theme.spacing(2),
  },
  emptySubtext: {
    ...typography.body,
    color: '#6b7280',
    textAlign: 'center',
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
  attachmentBtn: {
    marginTop: theme.spacing(1),
    backgroundColor: '#f3f4f6',
    padding: theme.spacing(2),
    borderRadius: theme.radius.md,
    alignSelf: 'flex-start',
  },
  attachmentText: {
    ...typography.label,
    fontSize: 12,
    color: theme.colors.blue,
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing(2),
  },
  attachmentButton: {
    backgroundColor: '#f3f4f6',
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing(3),
    paddingVertical: theme.spacing(2),
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachmentButtonText: {
    fontSize: 18,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing(3),
    paddingVertical: theme.spacing(2),
    fontSize: 16,
    maxHeight: 100,
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
  sendButtonText: {
    ...typography.button,
    color: colors.white,
    fontSize: 14,
  },
});
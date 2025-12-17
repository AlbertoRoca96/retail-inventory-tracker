// apps/mobile/app/chat/team.tsx
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, StyleSheet, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { theme, colors, typography } from '../../src/theme';
import Button from '../../src/components/Button';
import LogoHeader from '../../src/components/LogoHeader';
import { sendSubmissionMessage, fetchTeamMessages, subscribeToTeamMessages, type SubmissionMessage } from '../../src/lib/chat';

export default function TeamChat() {
  const { session, ready } = useAuth();
  const [messages, setMessages] = useState<SubmissionMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [teamInfo, setTeamInfo] = useState<{ id: string; name: string } | null>(null);
  
  const flatListRef = useRef<FlatList>(null);
  const subscriptionRef = useRef<any>(null);

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
        setTeamInfo({ id: data.team_id, name: data.teams?.name || 'Unknown Team' });
      }
    } catch (error) {
      console.error('Error loading team info:', error);
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
        setMessages(prev => [...prev, payload.new]);
      } else if (payload.eventType === 'UPDATE' && payload.new?.is_internal) {
        setMessages(prev => 
          prev.map(msg => msg.id === payload.new?.id ? payload.new : msg)
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
  }, [teamInfo]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !teamInfo || sending) return;

    try {
      setSending(true);
      
      const result = await sendSubmissionMessage({
        team_id: teamInfo.id,
        submission_id: null,
        body: newMessage.trim(),
        is_internal: true, // This is team chat
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to send message');
      }
      
      setNewMessage('');
      
      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
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
            {isMe ? 'You' : item.sender_id?.slice(0, 8) || 'Team Member'}
          </Text>
          <Text style={styles.messageTime}>
            {new Date(item.created_at).toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </Text>
        </View>
        <Text style={styles.messageBody}>{item.body}</Text>
        {item.attachment_type && (
          <View style={styles.attachmentInfo}>
            <Text style={styles.attachmentText}>
              📎 {item.attachment_type.toUpperCase()} attachment
            </Text>
          </View>
        )}
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
            contentContainerStyle={styles.messagesListContent}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => {
              flatListRef.current?.scrollToEnd({ animated: false });
            }}
          />
        )}

        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.inputContainer}
        >
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
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
    </SafeAreaView>
  );
}
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
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
// apps/mobile/app/chat/index.tsx
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { theme, colors, typography } from '../../src/theme';
import Button from '../../src/components/Button';
import Banner from '../../src/components/Banner';
import { fetchTeamMessages, fetchSubmissionMessages, type ChatRoom, type SubmissionMessage } from '../../src/lib/chat';

export default function ChatOverview() {
  const { session, ready } = useAuth();
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [teamInfo, setTeamInfo] = useState<{ id: string; name: string } | null>(null);
  const subscriptionRef = useRef<any>(null);

  useEffect(() => {
    loadChatData();
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
      }
    };
  }, []);

  const loadChatData = async () => {
    if (!session?.user) return;
    
    try {
      setLoading(true);
      
      // Get user's team information
      const { data: teamMember } = await supabase
        .from('team_members')
        .select('team_id, teams(name)')
        .eq('user_id', session.user.id)
        .limit(1)
        .single();
      
      if (!teamMember) {
        setLoading(false);
        return;
      }
      
      setTeamInfo({ id: teamMember.team_id, name: teamMember.teams?.name || 'Unknown Team' });
      
      // Fetch recent team messages to build chat rooms
      const { messages } = await fetchTeamMessages(teamMember.team_id, {
        limit: 100,
        includeInternal: true,
      });
      
      // Group messages by submission and create chat rooms
      const chatMap = new Map<string, ChatRoom>();
      
      // Add team-wide chat room
      const teamMessages = messages.filter(m => m.is_internal);
      if (teamMessages.length > 0) {
        chatMap.set('team', {
          team_id: teamMember.team_id,
          team_name: teamMember.teams?.name || 'Unknown Team',
          last_message: teamMessages[0],
          unread_count: teamMessages.length, // This should be calculated properly
          last_activity: teamMessages[0].created_at,
        });
      }
      
      // Group by submission
      const submissionMessages = messages.filter(m => !m.is_internal && m.submission_id);
      const submissionsMap = new Map<string, SubmissionMessage[]>();
      
      submissionMessages.forEach(msg => {
        if (!submissionsMap.has(msg.submission_id!)) {
          submissionsMap.set(msg.submission_id!, []);
        }
        submissionsMap.get(msg.submission_id!)!.push(msg);
      });
      
      // Create chat rooms for each submission
      submissionsMap.forEach((subMessages, submissionId) => {
        if (subMessages.length > 0) {
          const lastMessage = subMessages[0];
          chatMap.set(submissionId, {
            team_id: teamMember.team_id,
            team_name: teamMember.teams?.name || 'Unknown Team',
            submission_id,
            submission_date: lastMessage.submission_date,
            submission_location: lastMessage.submission_location,
            last_message: lastMessage,
            unread_count: subMessages.length, // This should be calculated properly
            last_activity: lastMessage.created_at,
          });
        }
      });
      
      // Convert to array and sort by last activity
      const rooms = Array.from(chatMap.values()).sort((a, b) => 
        new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime()
      );
      
      setChatRooms(rooms);
    } catch (error) {
      console.error('Error loading chat data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadChatData();
    setRefreshing(false);
  };

  const renderChatRoom = ({ item }: { item: ChatRoom }) => {
    const isTeamChat = !item.submission_id;
    const displayName = isTeamChat 
      ? `${item.team_name} - Team Chat`
      : `${item.team_name} - ${item.submission_date || 'Submission'}`;
    
    const subtitle = isTeamChat 
      ? 'Internal team messages'
      : `Location: ${item.submission_location || 'Unknown'}`;
    
    const lastMessageBody = item.last_message?.body || 'No messages yet';
    const lastMessageTime = item.last_message 
      ? new Date(item.last_message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';
    
    return (
      <TouchableOpacity
        style={styles.chatRoom}
        onPress={() => {
          if (isTeamChat) {
            router.push(`/chat/team`);
          } else {
            router.push(`/chat/submission/${item.submission_id}`);
          }
        }}
        accessibilityLabel={`Open ${displayName}`}
        accessibilityHint={subtitle}
      >
        <View style={styles.chatRoomContent}>
          <View style={styles.chatRoomInfo}>
            <View style={styles.headerRow}>
              <Text style={styles.chatRoomName} numberOfLines={1}>
                {displayName}
              </Text>
              {lastMessageTime && (
                <Text style={styles.timeText}>{lastMessageTime}</Text>
              )}
            </View>
            <Text style={styles.chatRoomSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
            <Text style={styles.lastMessage} numberOfLines={2}>
              {item.last_message 
                ? `${item.last_message.sender_name || 'Someone'}: ${lastMessageBody}`
                : lastMessageBody
              }
            </Text>
          </View>
          {item.unread_count > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadCount}>
                {item.unread_count > 99 ? '99+' : item.unread_count}
              </Text>
            </View>
          )}
        </View>
        {item.last_message?.attachment_type && (
          <View style={styles.attachmentIndicator}>
            <Text style={styles.attachmentText}>
              📎 {item.last_message.attachment_type.toUpperCase()}
            </Text>
          </View>
        )}
      </TouchableOpacity>
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
        <Text style={styles.title}>Chat</Text>
        <Banner 
          kind="info" 
          message="Please sign in to access the chat feature."
        />
        <View style={styles.buttonContainer}>
          <Button 
            title="Sign In"
            onPress={() => router.replace('/login')}
            accessibilityLabel="Navigate to sign in page"
          />
        </View>
      </View>
    );
  }

  if (!teamInfo) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.title}>Chat</Text>
        <Banner 
          kind="info" 
          message="You need to be part of a team to use the chat feature."
        />
        <View style={styles.buttonContainer}>
          <Button 
            title="Back to Menu"
            onPress={() => router.replace('/menu')}
            variant="secondary"
            accessibilityLabel="Navigate back to menu"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Team Chat</Text>
        <Text style={styles.subtitle}>
          {teamInfo.name} - Communication hub
        </Text>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.blue} />
        </View>
      ) : chatRooms.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyTitle}>No Chats Yet</Text>
          <Text style={styles.subtitle}>
            Start a conversation from a submission page or use the team chat.
          </Text>
        </View>
      ) : (
        <FlatList
          data={chatRooms}
          renderItem={renderChatRoom}
          keyExtractor={(item) => item.submission_id || 'team'}
          style={styles.chatList}
          contentContainerStyle={styles.chatListContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <Button
          title="Team Chat"
          onPress={() => router.push('/chat/team')}
          accessibilityLabel="Open team-wide chat"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    paddingTop: theme.spacing(4),
    paddingHorizontal: theme.spacing(4),
    paddingBottom: theme.spacing(3),
  },
  title: {
    ...typography.title,
    fontSize: 24,
    marginBottom: theme.spacing(1),
  },
  subtitle: {
    ...typography.body,
    color: '#6b7280',
    marginBottom: 0,
  },
  emptyTitle: {
    ...typography.title,
    fontSize: 20,
    marginBottom: theme.spacing(2),
    color: theme.colors.text,
  },
  buttonContainer: {
    marginTop: theme.spacing(4),
  },
  chatList: {
    flex: 1,
  },
  chatListContent: {
    paddingHorizontal: theme.spacing(4),
    gap: theme.spacing(2),
    paddingBottom: theme.spacing(2),
  },
  chatRoom: {
    backgroundColor: colors.white,
    borderRadius: theme.radius.xl,
    padding: theme.spacing(4),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginVertical: theme.spacing(1),
  },
  chatRoomContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  chatRoomInfo: {
    flex: 1,
    marginRight: theme.spacing(2),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(1),
  },
  chatRoomName: {
    ...typography.body,
    fontWeight: '700',
    color: theme.colors.text,
    flex: 1,
  },
  timeText: {
    ...typography.label,
    color: '#6b7280',
    fontSize: 12,
    marginLeft: theme.spacing(2),
  },
  chatRoomSubtitle: {
    ...typography.label,
    color: '#6b7280',
    marginBottom: theme.spacing(1),
  },
  lastMessage: {
    ...typography.body,
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 18,
  },
  unreadBadge: {
    backgroundColor: theme.colors.blue,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing(1),
  },
  unreadCount: {
    ...typography.label,
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  attachmentIndicator: {
    marginTop: theme.spacing(2),
    flexDirection: 'row',
    alignItems: 'center',
  },
  attachmentText: {
    ...typography.label,
    color: '#6b7280',
    fontSize: 12,
  },
  quickActions: {
    padding: theme.spacing(4),
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
});
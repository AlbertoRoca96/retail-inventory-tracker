import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import Head from 'expo-router/head';
import { router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { theme, colors, typography } from '../../src/theme';
import Button from '../../src/components/Button';
import LogoHeader from '../../src/components/LogoHeader';
import Banner from '../../src/components/Banner';
import { fetchTeamMessages, type ChatRoom, type SubmissionMessage } from '../../src/lib/chat';

export default function ChatOverview() {
  const { session, ready } = useAuth();
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [teamInfo, setTeamInfo] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    loadChatData();
  }, []);

  const loadChatData = async () => {
    if (!session?.user) return;
    try {
      setLoading(true);

      const { data: teamMember } = await supabase
        .from('team_members')
        .select('team_id, teams(name)')
        .eq('user_id', session.user.id)
        .limit(1)
        .maybeSingle();
      if (!teamMember) {
        setLoading(false);
        return;
      }

      setTeamInfo({ id: teamMember.team_id, name: teamMember.teams?.name || 'Team' });

      const { messages } = await fetchTeamMessages(teamMember.team_id, { limit: 200 });
      const { data: submissionData } = await supabase
        .from('submission_messages')
        .select('id, team_id, submission_id, sender_id, body, is_internal, attachment_path, attachment_type, is_revised, created_at')
        .eq('team_id', teamMember.team_id)
        .not('submission_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200);
      const submissionMessages = (submissionData || []) as SubmissionMessage[];
      const chatMap = new Map<string, ChatRoom>();

      const teamMessages = messages.filter((m) => m.is_internal);
      if (teamMessages.length) {
        chatMap.set('team', {
          team_id: teamMember.team_id,
          team_name: teamMember.teams?.name || 'Team Chat',
          last_message: teamMessages[0],
          unread_count: teamMessages.length,
          last_activity: teamMessages[0].created_at,
        });
      }

      submissionMessages.forEach((msg) => {
        if (!msg.submission_id) return;
        const existing = chatMap.get(msg.submission_id);
        if (!existing || new Date(msg.created_at) > new Date(existing.last_activity)) {
          chatMap.set(msg.submission_id, {
            team_id: teamMember.team_id,
            team_name: teamMember.teams?.name || 'Team',
            submission_id: msg.submission_id,
            last_message: msg,
            unread_count: (existing?.unread_count || 0) + 1,
            last_activity: msg.created_at,
          });
        }
      });

      const rooms = Array.from(chatMap.values()).sort(
        (a, b) => new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime()
      );
      setChatRooms(rooms);
    } catch (error) {
      console.error('chat: load error', error);
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
    const title = isTeamChat ? 'Team Chat' : `Submission ${item.submission_id?.slice(0, 6)}`;
    const subtitle = isTeamChat
      ? `${item.team_name} • internal`
      : `Submission ID ${item.submission_id}`;
    const lastMessageBody = item.last_message?.body || 'No messages yet';
    const lastMessageTime = item.last_message
      ? new Date(item.last_message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';

    return (
      <TouchableOpacity
        style={styles.chatRoom}
        onPress={() =>
          isTeamChat ? router.push('/chat/team') : router.push(`/chat/submission/${item.submission_id}`)
        }
      >
        <View style={styles.chatRoomContent}>
          <View style={styles.chatRoomInfo}>
            <View style={styles.headerRow}>
              <Text style={styles.chatRoomName} numberOfLines={1}>
                {title}
              </Text>
              {lastMessageTime ? <Text style={styles.timeText}>{lastMessageTime}</Text> : null}
            </View>
            <Text style={styles.chatRoomSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
            <Text style={styles.lastMessage} numberOfLines={2}>
              {lastMessageBody}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (!ready) {
    return (
      <SafeAreaView style={styles.safe}>
        <LogoHeader title="Team Chat" />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.blue} />
        </View>
      </SafeAreaView>
    );
  }

  if (!session?.user) {
    return (
      <SafeAreaView style={styles.safe}>
        <LogoHeader title="Team Chat" />
        <View style={styles.centerContainer}>
          <Banner kind="info" message="Please sign in to access the chat feature." />
          <View style={styles.buttonContainer}>
            <Button title="Sign In" onPress={() => router.replace('/login')} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!teamInfo) {
    return (
      <SafeAreaView style={styles.safe}>
        <LogoHeader title="Team Chat" />
        <View style={styles.centerContainer}>
          <Banner kind="info" message="Join a team to unlock chat." />
          <View style={styles.buttonContainer}>
            <Button title="Back to Menu" onPress={() => router.replace('/menu')} variant="secondary" />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Head><title>Chat</title></Head>
      <LogoHeader title="Team Chat" />
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.blue} />
        </View>
      ) : (
        <FlatList
          data={chatRooms}
          renderItem={renderChatRoom}
          keyExtractor={(item) => item.submission_id || 'team'}
          style={styles.chatList}
          contentContainerStyle={styles.chatListContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={styles.emptyTitle}>No Chats Yet</Text>
              <Text style={styles.subtitle}>
                Start a conversation from a submission page or use the team chat.
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={styles.quickActions}>
        <Button
          title="New Chat"
          onPress={() => router.push('/chat/team')}
          accessibilityLabel="Open team-wide chat"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing(4),
  },
  buttonContainer: {
    marginTop: theme.spacing(4),
    width: '80%',
  },
  chatList: {
    flex: 1,
  },
  chatListContent: {
    paddingHorizontal: theme.spacing(2),
    paddingBottom: theme.spacing(2),
    gap: theme.spacing(2),
  },
  chatRoom: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: theme.spacing(3),
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.text,
    flex: 1,
  },
  timeText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 12,
    marginLeft: theme.spacing(2),
  },
  chatRoomSubtitle: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: theme.spacing(1),
  },
  lastMessage: {
    ...typography.body,
    color: colors.text,
    fontSize: 14,
    lineHeight: 18,
  },
  emptyTitle: {
    ...typography.title,
    fontSize: 20,
    marginBottom: theme.spacing(2),
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  quickActions: {
    padding: theme.spacing(3),
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
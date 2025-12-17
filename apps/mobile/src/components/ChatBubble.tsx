// apps/mobile/src/components/ChatBubble.tsx
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { theme, colors, typography } from '../theme';
import { subscribeToTeamMessages, type SubmissionMessage } from '../lib/chat';

interface ChatBubbleProps {
  visible?: boolean;
  position?: 'top-right' | 'bottom-right';
  size?: 'small' | 'medium' | 'large';
}

export default function ChatBubble({ 
  visible = true, 
  position = 'top-right', 
  size = 'medium' 
}: ChatBubbleProps) {
  const router = useRouter();
  const { session, ready } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastMessage, setLastMessage] = useState<SubmissionMessage | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  
  const subscriptionRef = useRef<any>(null);
  const slideAnimation = useRef(new Animated.Value(0)).current;
  const pulseAnimation = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!ready || !session?.user || !visible) return;

    // Subscribe to team messages for real-time notifications
    const loadTeamAndSubscribe = async () => {
      import('../lib/supabase').then(({ supabase }) => {
        // Get user's team
        supabase
          .from('team_members')
          .select('team_id')
          .eq('user_id', session.user.id)
          .limit(1)
          .single()
          .then(({ data }) => {
            if (data?.team_id) {
              // Subscribe to team messages
              subscriptionRef.current = subscribeToTeamMessages(data.team_id, (payload) => {
                if (payload.eventType === 'INSERT' && payload.new) {
                  const message = payload.new;
                  
                  // Don't count own messages
                  if (message.sender_id !== session.user.id) {
                    setUnreadCount(prev => prev + 1);
                    setLastMessage(message);
                    
                    // Animate new message notification
                    Animated.sequence([
                      Animated.timing(pulseAnimation, {
                        toValue: 1.2,
                        duration: 200,
                        useNativeDriver: true,
                      }),
                      Animated.timing(pulseAnimation, {
                        toValue: 1,
                        duration: 200,
                        useNativeDriver: true,
                      }),
                    ]).start();
                    
                    // Show preview briefly
                    setShowPreview(true);
                    setTimeout(() => setShowPreview(false), 5000);
                  }
                }
              });
            }
          });
      });
    };

    loadTeamAndSubscribe();

    // Animate in
    Animated.timing(slideAnimation, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
      }
    };
  }, [ready, session, visible]);

  const handlePress = () => {
    router.push('/chat');
    setUnreadCount(0);
    setShowPreview(false);
  };

  const handleLongPress = () => {
    setShowPreview(!showPreview);
  };

  if (!visible || !ready || !session?.user || unreadCount === 0) {
    return null;
  }

  const positionStyles = position === 'top-right' 
    ? { top: 80, right: 16 }
    : { bottom: 100, right: 16 };

  const sizeStyles = {
    small: { width: 40, height: 40 },
    medium: { width: 56, height: 56 },
    large: { width: 64, height: 64 },
  }[size];

  return (
    <>
      <Animated.View 
        style={[
          styles.container,
          positionStyles,
          sizeStyles,
          {
            transform: [
              { translateX: slideAnimation.interpolate({
                inputRange: [0, 1],
                outputRange: [100, 0],
              })},
              { scale: pulseAnimation },
            ],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.chatButton}
          onPress={handlePress}
          onLongPress={handleLongPress}
          activeOpacity={0.8}
          accessibilityLabel={`Chat with ${unreadCount} unread messages`}
          accessibilityHint="Tap to open chat, long press to preview"
        >
          <View style={styles.chatIcon}>
            <Text style={styles.chatIconText}>💬</Text>
          </View>
          
          {/* Unread count badge */}
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* Preview tooltip */}
      {showPreview && lastMessage && (
        <Animated.View 
          style={[
            styles.preview,
            position === 'top-right' 
              ? { top: 80, right: 80 }
              : { bottom: 100, right: 80 },
            {
              transform: [
                {
                  translateX: slideAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [200, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle}>
              {lastMessage.is_internal ? 'Team Chat' : 'Submission Chat'}
            </Text>
            <Text style={styles.previewTime}>
              {new Date(lastMessage.created_at).toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </Text>
          </View>
          <Text style={styles.previewSender}>
            {lastMessage.sender_id?.slice(0, 8) || 'Someone'}
          </Text>
          <Text style={styles.previewMessage} numberOfLines={2}>
            {lastMessage.body}
          </Text>
          {lastMessage.attachment_type && (
            <Text style={styles.previewAttachment}>
              📎 {lastMessage.attachment_type.toUpperCase()} attachment
            </Text>
          )}
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  chatButton: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.blue,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  chatIcon: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatIconText: {
    fontSize: 24,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.red,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: colors.white,
  },
  badgeText: {
    ...typography.label,
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  preview: {
    position: 'absolute',
    backgroundColor: colors.white,
    borderRadius: theme.radius.lg,
    padding: theme.spacing(3),
    maxWidth: 250,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(1),
  },
  previewTitle: {
    ...typography.label,
    fontWeight: '700',
    color: theme.colors.text,
  },
  previewTime: {
    ...typography.label,
    fontSize: 11,
    color: '#6b7280',
  },
  previewSender: {
    ...typography.label,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 2,
  },
  previewMessage: {
    ...typography.body,
    fontSize: 13,
    color: theme.colors.text,
    lineHeight: 16,
  },
  previewAttachment: {
    ...typography.label,
    fontSize: 11,
    color: '#6b7280',
    marginTop: theme.spacing(1),
  },
});
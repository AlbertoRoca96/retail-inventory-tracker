// apps/mobile/src/components/Banner.tsx - Professional Banner Component
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { theme, typography, textA11yProps, borderRadius, shadows, animations } from '../theme';
import { useUISettings } from '../lib/uiSettings';

interface BannerProps {
  kind?: 'success' | 'error' | 'info' | 'warning';
  message: string;
  onDismiss?: () => void;
  action?: {
    label: string;
    onPress: () => void;
  };
  visible?: boolean;
}

export default function Banner({
  kind = 'info',
  message,
  onDismiss,
  action,
  visible = true,
}: BannerProps) {
  const { fontScale, targetMinHeight, highContrast } = useUISettings();

  const getBannerStyles = () => {
    const baseStyle = {
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      borderRadius: borderRadius.lg,
      marginVertical: theme.spacing.sm,
      minHeight: targetMinHeight,
      justifyContent: 'center' as const,
      ...shadows.md,
    };

    const variants = {
      success: {
        ...baseStyle,
        backgroundColor: highContrast ? theme.colors.success[600] : theme.colors.success[500],
        borderColor: theme.colors.success[600],
      },
      error: {
        ...baseStyle,
        backgroundColor: highContrast ? theme.colors.error[600] : theme.colors.error[500],
        borderColor: theme.colors.error[600],
      },
      warning: {
        ...baseStyle,
        backgroundColor: highContrast ? theme.colors.warning[600] : theme.colors.warning[500],
        borderColor: theme.colors.warning[600],
      },
      info: {
        ...baseStyle,
        backgroundColor: highContrast ? theme.colors.primary[700] : theme.colors.primary[600],
        borderColor: theme.colors.primary[700],
      },
    };

    return variants[kind];
  };

  const getIcon = () => {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️',
    };
    return icons[kind];
  };

  if (!visible) return null;

  return (
    <View
      style={getBannerStyles()}
      accessible
      accessibilityRole="status"
      accessibilityLabel={`${kind} banner: ${message}`}
    >
      <View style={styles.content}>
        {/* Icon */}
        <Text style={styles.icon}>{getIcon()}</Text>
        
        {/* Message */}
        <Text
          {...textA11yProps}
          style={[
            styles.message,
            {
              fontSize: Math.round(typography.bodyLarge.fontSize * fontScale),
              lineHeight: Math.round(typography.bodyLarge.lineHeight * fontScale),
            }
          ]}
        >
          {message}
        </Text>
      </View>

      {/* Actions */}
      {(onDismiss || action) && (
        <View style={styles.actions}>
          {action && (
            <Pressable
              onPress={action.onPress}
              style={styles.actionButton}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <Text style={styles.actionText}>{action.label}</Text>
            </Pressable>
          )}
          
          {onDismiss && (
            <Pressable
              onPress={onDismiss}
              style={styles.dismissButton}
              accessibilityRole="button"
              accessibilityLabel="Dismiss notification"
            >
              <Text style={styles.dismissText}>✕</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  icon: {
    fontSize: 20,
    marginRight: theme.spacing.sm,
  },
  message: {
    color: theme.colors.white,
    fontWeight: '500',
    flex: 1,
    letterSpacing: 0.25,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  actionButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  actionText: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  dismissButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissText: {
    color: theme.colors.white,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
  },
});

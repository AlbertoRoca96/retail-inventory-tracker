// apps/mobile/src/components/Button.tsx - Professional Button Component
import React, { useCallback } from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { theme, typography, textA11yProps, animations, borderRadius, shadows, spacing } from '../theme';
import { useUISettings } from '../lib/uiSettings';

type Variant = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  accessibilityLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

const sizeStyles = {
  sm: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 40,
  },
  md: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
  },
  lg: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    minHeight: 56,
  },
};

const textSizes = {
  sm: typography.button.fontSize * 0.875,  // 14px (18 * 0.875)
  md: typography.button.fontSize,          // 18px
  lg: typography.button.fontSize * 1.125,   // 20px (18 * 1.125)
};

export default function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  accessibilityLabel,
  disabled = false,
  loading = false,
  icon,
  fullWidth = false,
}: ButtonProps) {
  const { simplifiedMode, largeText, highContrast, targetMinHeight, fontScale } = useUISettings();

  // Safe fallback for size prop to prevent undefined fontSize access
  const safeSize = (size && textSizes[size] && sizeStyles[size]) ? size : 'md';
  const seniorBoost = simplifiedMode ? 1.25 : largeText ? 1.18 : 1.12;
  const fontSize = Math.round(textSizes[safeSize] * fontScale * seniorBoost);
  const currentSizeStyle = sizeStyles[safeSize];
  
  // Professional color configurations
  const { containerStyle, labelColor } = React.useMemo(() => {
    const baseStyle = {
      borderRadius: borderRadius.lg,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      flexDirection: 'row' as const,
      gap: spacing.sm,
      width: fullWidth ? '100%' : undefined,
      alignSelf: fullWidth ? 'stretch' : undefined,
      minWidth: fullWidth ? undefined : 120,
    };

    type VariantConfig = {
      backgroundColor: string;
      textColor: string;
      borderColor?: string;
      borderWidth?: number;
      shadow?: typeof shadows.sm;
    };

    const variantMap: Record<Variant, VariantConfig> = {
      primary: {
        backgroundColor: highContrast ? theme.colors.primary[700] : theme.colors.primary[600],
        textColor: theme.colors.white,
        shadow: shadows.md,
      },
      secondary: {
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.primary[600],
        borderWidth: 2,
        textColor: theme.colors.primary[600],
        shadow: shadows.sm,
      },
      success: {
        backgroundColor: highContrast ? theme.colors.success[700] : theme.colors.success[600],
        textColor: theme.colors.white,
        shadow: shadows.md,
      },
      warning: {
        backgroundColor: highContrast ? theme.colors.warning[700] : theme.colors.warning[600],
        textColor: theme.colors.white,
        shadow: shadows.md,
      },
      error: {
        backgroundColor: highContrast ? theme.colors.error[700] : theme.colors.error[600],
        textColor: theme.colors.white,
        shadow: shadows.md,
      },
      ghost: {
        backgroundColor: 'transparent',
        borderColor: theme.colors.gray[300],
        borderWidth: 1,
        textColor: theme.colors.gray[700],
        shadow: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0,
          shadowRadius: 0,
          elevation: 0,
        },
      },
    };

    const selected = variantMap[variant] || variantMap.primary;
    const shadowStyle = selected.shadow ?? shadows.md;
    const borderWidth = selected.borderWidth ?? (selected.borderColor ? 1 : 0);
    const disabledBackground = (variant === 'secondary' || variant === 'ghost')
      ? theme.colors.surfaceMuted
      : theme.colors.gray[200];
    const disabledBorder = selected.borderColor ? theme.colors.gray[300] : 'transparent';

    return {
      containerStyle: {
        ...baseStyle,
        ...shadowStyle,
        backgroundColor: disabled ? disabledBackground : selected.backgroundColor,
        borderWidth,
        borderColor: disabled ? disabledBorder : selected.borderColor ?? 'transparent',
      },
      labelColor: disabled ? theme.colors.gray[400] : selected.textColor,
    };
  }, [variant, highContrast, disabled, fullWidth]);

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { fontSize, color: labelColor }]}>
            Loading...
          </Text>
        </View>
      );
    }

    return (
      <>
        {icon}
        <Text 
          {...textA11yProps} 
          style={[
            styles.text, 
            { 
              fontSize, 
              color: labelColor,
              textAlign: 'center',
              fontWeight: '600' as const,
            }
          ]}
        >
          {title}
        </Text>
      </>
    );
  };

  const handlePress = useCallback(() => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onPress();
  }, [disabled, loading, onPress]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled, busy: loading }}
      hitSlop={10}
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        containerStyle,
        {
          transform: [{ scale: pressed ? 0.98 : 1 }],
          minHeight: Math.max(targetMinHeight, currentSizeStyle.minHeight),
          ...currentSizeStyle,
        },
        pressed && styles.pressed,
      ]}
    >
      {renderContent()}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  text: {
    fontWeight: '600',
    letterSpacing: 0.25,
  },
  pressed: {
    shadowOpacity: 0.1,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    fontWeight: '600',
  },
});

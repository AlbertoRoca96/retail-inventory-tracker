// apps/mobile/src/components/Button.tsx - Professional Button Component
import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { theme, typography, textA11yProps, animations, borderRadius, shadows } from '../theme';
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
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    minHeight: 40,
  },
  md: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    minHeight: 48,
  },
  lg: {
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
    minHeight: 56,
  },
};

const textSizes = {
  sm: typography.buttonSmall.fontSize,
  md: typography.button.fontSize, 
  lg: typography.buttonLarge.fontSize,
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

  const fontSize = Math.round(textSizes[size] * fontScale);
  const currentSizeStyle = sizeStyles[size];
  
  // Professional color configurations
  const getVariantStyles = () => {
    const baseStyle = {
      borderRadius: borderRadius.lg,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      flexDirection: 'row' as const,
      gap: theme.spacing.sm,
      minWidth: fullWidth ? '100%' : 120,
      ...shadows.md,
    };

    switch (variant) {
      case 'primary':
        return {
          ...baseStyle,
          backgroundColor: highContrast ? theme.colors.primary[700] : theme.colors.primary[600],
        };
      
      case 'secondary':
        return {
          ...baseStyle,
          backgroundColor: theme.colors.card,
          borderWidth: 2,
          borderColor: theme.colors.primary[600],
        };
      
      case 'success':
        return {
          ...baseStyle,
          backgroundColor: highContrast ? theme.colors.success[600] : theme.colors.success[500],
        };
      
      case 'warning':
        return {
          ...baseStyle,
          backgroundColor: highContrast ? theme.colors.warning[600] : theme.colors.warning[500],
        };
      
      case 'error':
        return {
          ...baseStyle,
          backgroundColor: highContrast ? theme.colors.error[600] : theme.colors.error[500],
        };
      
      case 'ghost':
        return {
          ...baseStyle,
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: theme.colors.border,
          shadowOpacity: 0,
          elevation: 0,
        };
      
      default:
        return baseStyle;
    }
  };

  const getTextColor = () => {
    const textColors = {
      primary: theme.colors.white,
      secondary: theme.colors.primary[600],
      success: theme.colors.white,
      warning: theme.colors.white,
      error: theme.colors.white,
      ghost: theme.colors.gray[700],
    };
    return textColors[variant] || theme.colors.white;
  };

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { fontSize, color: getTextColor() }]}>
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
              color: disabled ? theme.colors.gray[400] : getTextColor(),
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

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled, busy: loading }}
      hitSlop={10}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        getVariantStyles(),
        {
          opacity: disabled ? 0.5 : 1,
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
    gap: theme.spacing.sm,
  },
  loadingText: {
    fontWeight: '600',
  },
});

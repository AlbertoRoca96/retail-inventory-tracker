// apps/mobile/src/components/Input.tsx - Professional Input Component
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import { theme, typography, textA11yProps, borderRadius, shadows, animations, spacing } from '../theme';
import { useUISettings } from '../lib/uiSettings';

interface InputProps {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: any;
  placeholder?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  labelFontSize?: number;
}

export default function Input({
  label,
  value,
  onChangeText,
  keyboardType = 'default',
  placeholder,
  secureTextEntry,
  multiline = false,
  required = false,
  error,
  disabled = false,
  helperText,
  leftIcon,
  rightIcon,
  labelFontSize,
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { simplifiedMode, highContrast, fontScale, targetMinHeight } = useUISettings();
  
  const actualLabelSize = labelFontSize || Math.round(typography.label.fontSize * fontScale);
  const actualInputSize = Math.round(typography.body.fontSize * fontScale);
  
  const inputPaddingVertical = theme.spacing.md;
  const inputPaddingHorizontal = theme.spacing.md;
  const paddingWithIcon = leftIcon ? inputPaddingHorizontal * 2 : inputPaddingHorizontal;

  const getInputStyles = () => {
    const baseStyle = {
      borderWidth: 2,
      borderRadius: borderRadius.lg,
      paddingVertical: inputPaddingVertical,
      paddingHorizontal: paddingWithIcon,
      minHeight: multiline ? Math.max(100, targetMinHeight) : targetMinHeight,
      textAlignVertical: multiline ? 'top' : 'center',
      fontSize: actualInputSize,
      lineHeight: actualInputSize * 1.5,
      backgroundColor: disabled ? theme.colors.gray[50] : theme.colors.card,
      transition: 'all 0.2s ease',
      ...shadows.sm,
    };

    if (error) {
      return {
        ...baseStyle,
        borderColor: theme.colors.error[500],
        backgroundColor: theme.colors.error[50],
        borderWidth: 2,
      };
    }

    if (focused) {
      return {
        ...baseStyle,
        borderColor: theme.colors.primary[500],
        backgroundColor: theme.colors.white,
        borderWidth: 2,
        ...shadows.md,
      };
    }

    return {
      ...baseStyle,
      borderColor: highContrast ? theme.colors.gray[700] : theme.colors.border,
      backgroundColor: theme.colors.card,
    };
  };

  const handleFocus = () => {
    if (!disabled) setFocused(true);
  };

  const handleBlur = () => {
    setFocused(false);
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const renderRightIcon = () => {
    if (secureTextEntry) {
      return (
        <Pressable
          onPress={togglePasswordVisibility}
          style={styles.passwordToggle}
          accessibilityRole="button"
          accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
        >
          <Text style={[styles.passwordToggleText, { color: theme.colors.gray[500] }]}>
            {showPassword ? '🙈' : '👁️'}
          </Text>
        </Pressable>
      );
    }
    return rightIcon;
  };

  return (
    <View style={styles.container}>
      {/* Label */}
      <View style={styles.labelContainer}>
        <Text 
          {...textA11yProps} 
          style={[
            styles.label, 
            { 
              fontSize: actualLabelSize,
              color: error ? theme.colors.error[600] : theme.colors.gray[700],
            }
          ]}
        >
          {label}
          {required && <Text style={styles.requiredAsterisk}> *</Text>}
        </Text>
      </View>

      {/* Input Container */}
      <View style={[styles.inputContainer, leftIcon && styles.inputWithLeftIcon]}>
        {leftIcon && (
          <View style={styles.leftIconContainer}>
            {leftIcon}
          </View>
        )}
        
        <TextInput
          {...textA11yProps}
          accessibilityLabel={label}
          accessibilityState={{ error: !!error }}
          accessibilityHint={error || helperText}
          placeholder={placeholder}
          placeholderTextColor={highContrast ? theme.colors.gray[600] : theme.colors.gray[400]}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry && !showPassword}
          multiline={multiline}
          value={value}
          onChangeText={onChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          editable={!disabled}
          style={getInputStyles()}
          maxLength={multiline ? 1000 : 200}
        />
        
        {renderRightIcon()}
      </View>

      {/* Helper text and error */}
      {(error || helperText) && (
        <Text 
          style={[
            styles.helperText,
            { 
              color: error ? theme.colors.error[600] : theme.colors.gray[500],
              fontSize: Math.round(typography.caption.fontSize * fontScale),
            }
          ]}
        >
          {error || helperText}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.sm,
  },
  labelContainer: {
    marginBottom: theme.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontWeight: '600',
    lineHeight: 20,
  },
  requiredAsterisk: {
    color: theme.colors.error[600],
    marginLeft: 2,
    fontSize: 16,
    fontWeight: '700',
  },
  inputContainer: {
    position: 'relative',
  },
  inputWithLeftIcon: {
    position: 'relative',
  },
  leftIconContainer: {
    position: 'absolute',
    left: theme.spacing.md,
    top: '50%',
    marginTop: -12, // Half of typical icon height
    zIndex: 1,
  },
  passwordToggle: {
    position: 'absolute',
    right: theme.spacing.md,
    top: '50%',
    marginTop: -12,
    padding: theme.spacing.xs,
    zIndex: 1,
  },
  passwordToggleText: {
    fontSize: 18,
  },
  helperText: {
    marginTop: theme.spacing.xs,
    lineHeight: 16,
    fontStyle: 'italic',
  },
});

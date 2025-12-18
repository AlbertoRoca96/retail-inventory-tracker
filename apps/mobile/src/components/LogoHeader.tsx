import React from 'react';
import { View, Image, Pressable, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography } from '../theme';
import logoPng from '../../assets/logo.png';

interface LogoHeaderProps {
  showBack?: boolean;
  showSettings?: boolean;
  onBackPress?: () => void;
  onSettingsPress?: () => void;
  settingsRoute?: string;
  settingsColor?: string;
  backColor?: string;
  title?: string;
  subtitle?: string;
  logoSize?: number;
  style?: any;
}

export function LogoHeader({
  showBack = true,
  showSettings = true,
  onBackPress,
  onSettingsPress,
  settingsRoute = '/account/settings',
  settingsColor = '#1f2937',
  backColor = '#1f2937',
  title,
  subtitle,
  logoSize = 60,
  style,
}: LogoHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBackPress) return onBackPress();
    if ((router as any).canGoBack?.()) {
      router.back();
    } else {
      router.replace('/menu');
    }
  };

  const handleSettings = () => {
    if (onSettingsPress) return onSettingsPress();
    router.push(settingsRoute);
  };

  return (
    <View style={[styles.container, style]}>
      <View style={styles.row}>
        {showBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={16} onPress={handleBack}>
            <Ionicons name="chevron-back" size={26} color={backColor} />
          </Pressable>
        ) : (
          <View style={styles.iconSpacer} />
        )}

        <Image
          source={logoPng}
          resizeMode="contain"
          style={{ width: logoSize, height: logoSize }}
        />

        {showSettings ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Open settings" hitSlop={16} onPress={handleSettings}>
            <Ionicons name="settings-outline" size={24} color={settingsColor} />
          </Pressable>
        ) : (
          <View style={styles.iconSpacer} />
        )}
      </View>

      {title ? (
        <Text style={[styles.title, { marginTop: 8 }]}>{title}</Text>
      ) : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    backgroundColor: colors.background,
  },
  row: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconSpacer: {
    width: 26,
    height: 26,
  },
  title: {
    ...typography.title,
    textAlign: 'center',
    color: colors.text,
  },
  subtitle: {
    ...typography.body,
    textAlign: 'center',
    color: colors.textMuted,
  },
});

export default LogoHeader;

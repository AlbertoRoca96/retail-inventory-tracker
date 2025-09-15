// apps/mobile/src/components/Banner.tsx
import { View, Text } from 'react-native';
import { colors, textA11yProps, typography } from '../theme';
import { useUISettings } from '../lib/uiSettings';

export default function Banner({
  kind = 'success',
  message,
}: {
  kind?: 'success' | 'error' | 'info';
  message: string;
}) {
  const { fontScale, targetMinHeight, highContrast } = useUISettings();
  const bg =
    kind === 'success'
      ? (highContrast ? '#0f7a35' : colors.green)
      : kind === 'error'
      ? (highContrast ? '#a31212' : '#dc2626')
      : (highContrast ? '#0a6aa0' : '#0284c7');

  return (
    <View
      style={{
        backgroundColor: bg,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 12,
        marginTop: 10,
        minHeight: targetMinHeight,
        justifyContent: 'center',
      }}
      accessible
      accessibilityRole="status"
      accessibilityLabel={`${kind} banner: ${message}`}
    >
      <Text
        {...textA11yProps}
        style={{
          color: 'white',
          textAlign: 'center',
          fontSize: Math.round(typography.body.fontSize * fontScale),
          lineHeight: Math.round(22 * fontScale),
          fontWeight: '600',
        }}
      >
        {message}
      </Text>
    </View>
  );
}

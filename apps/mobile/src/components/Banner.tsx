// apps/mobile/src/components/Banner.tsx
import { View, Text } from 'react-native';
import { colors, textA11yProps, typography } from '../theme';

export default function Banner({
  kind = 'success',
  message,
}: {
  kind?: 'success' | 'error' | 'info';
  message: string;
}) {
  const bg = kind === 'success' ? colors.green : kind === 'error' ? '#dc2626' : '#0284c7';
  return (
    <View
      style={{
        backgroundColor: bg,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 12,
        marginTop: 10,
        minHeight: 48,
        justifyContent: 'center',
      }}
      accessible
      accessibilityRole="status"
      accessibilityLabel={`${kind} banner: ${message}`}
    >
      <Text
        {...textA11yProps}
        style={{ color: 'white', textAlign: 'center', fontSize: typography.body.fontSize, lineHeight: 22, fontWeight: '600' }}
      >
        {message}
      </Text>
    </View>
  );
}

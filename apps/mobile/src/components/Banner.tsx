import { View, Text } from 'react-native';
import { colors } from '../theme';

export default function Banner({ kind='success', message }: { kind?: 'success'|'error'|'info', message: string }) {
  const bg = kind === 'success' ? colors.green : kind === 'error' ? '#dc2626' : '#0284c7';
  return (
    <View style={{ backgroundColor: bg, padding: 10, borderRadius: 10, marginTop: 10 }}>
      <Text style={{ color: 'white', textAlign: 'center' }}>{message}</Text>
    </View>
  );
}

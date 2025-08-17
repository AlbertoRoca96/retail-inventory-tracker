import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';

export default function Home() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '700' }}>You’re in ✅</Text>
      <Text style={{ color: '#6b7280', marginBottom: 8 }}>
        This is a placeholder “home” screen. We can wire up your real app screens next.
      </Text>

      <Pressable
        onPress={() => router.replace('/')}
        style={{ backgroundColor: '#e5e7eb', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }}
      >
        <Text>Sign out (dev)</Text>
      </Pressable>
    </View>
  );
}
